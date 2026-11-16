import { moveItems, sameTerminal, terminalEnd } from './document.ts'
import type { CircuitDoc, WireEnd } from './document.ts'
import { rectFromPoints, snapPoint } from './geometry.ts'
import type { Point } from './geometry.ts'
import { hitTest, itemsInRect } from './hitTest.ts'
import type { Hit } from './hitTest.ts'
import { renderScene } from './render.ts'
import { routeWire } from './routing.ts'
import type { RouteEnd } from './routing.ts'
import { canvasRuntime } from './runtime.ts'
import { useEditor } from './store.ts'
import { readCanvasTheme } from './theme.ts'
import type { CanvasTheme } from './theme.ts'
import { screenToWorld } from './view.ts'

/** How far the pointer must travel, in pixels, before a press is a drag. */
const DRAG_THRESHOLD = 4

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pan'; lastX: number; lastY: number }
  /** The button is down but the pointer has not moved enough to mean a drag. */
  | {
      readonly kind: 'press'
      readonly hit: Hit | null
      readonly startX: number
      readonly startY: number
      readonly world: Point
      readonly shift: boolean
    }
  | { readonly kind: 'move'; readonly start: Point; dx: number; dy: number }
  | { readonly kind: 'marquee'; readonly start: Point; current: Point; readonly additive: boolean }
  | {
      readonly kind: 'wire'
      readonly from: WireEnd
      readonly fromEnd: RouteEnd
      current: Point
      target: Hit | null
    }

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Drives one canvas element: turns pointer and keyboard input into edits of
 * the document, and repaints whenever something visible changes.
 */
export class CanvasController {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly cleanups: (() => void)[] = []
  private mode: Mode = { kind: 'idle' }
  private hover: Hit | null = null
  /** The document as it would look if the drag in progress ended now. */
  private previewDoc: CircuitDoc | null = null
  private theme: CanvasTheme
  private width = 0
  private height = 0
  private pixelRatio = 1
  private frame = 0
  private spaceDown = false
  private centered = false

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw on a canvas')
    this.canvas = canvas
    this.ctx = ctx
    this.theme = readCanvasTheme(canvas)

    this.listen(canvas, 'pointerdown', this.onPointerDown)
    this.listen(canvas, 'pointermove', this.onPointerMove)
    this.listen(canvas, 'pointerup', this.onPointerUp)
    this.listen(canvas, 'pointercancel', this.onPointerCancel)
    this.listen(canvas, 'pointerleave', this.onPointerLeave)
    this.listen(canvas, 'wheel', this.onWheel, { passive: false })
    this.listen(window, 'keydown', this.onKeyDown)
    this.listen(window, 'keyup', this.onKeyUp)

    const observer = new ResizeObserver(() => this.resize())
    observer.observe(canvas)
    this.cleanups.push(() => observer.disconnect())

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.listen(darkQuery, 'change', () => this.refreshTheme())

    this.cleanups.push(
      useEditor.subscribe((state, previous) => {
        if (state.theme !== previous.theme) this.refreshTheme()
        this.requestDraw()
      }),
    )

    canvasRuntime.current = {
      clientToGrid: (clientX, clientY) => {
        const rect = this.canvas.getBoundingClientRect()
        const x = clientX - rect.left
        const y = clientY - rect.top
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
        return snapPoint(screenToWorld(useEditor.getState().view, x, y))
      },
      gridCenter: () =>
        snapPoint(screenToWorld(useEditor.getState().view, this.width / 2, this.height / 2)),
      screenCenter: () => ({ x: this.width / 2, y: this.height / 2 }),
    }
    this.cleanups.push(() => {
      canvasRuntime.current = null
    })

    this.resize()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    for (const cleanup of this.cleanups) cleanup()
  }

  private listen<T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as (event: Event) => void
    target.addEventListener(type, listener, options)
    this.cleanups.push(() => target.removeEventListener(type, listener, options))
  }

  // ---- Painting ----

  private refreshTheme(): void {
    this.theme = readCanvasTheme(this.canvas)
    this.requestDraw()
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.width = rect.width
    this.height = rect.height
    this.pixelRatio = window.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.round(rect.width * this.pixelRatio))
    this.canvas.height = Math.max(1, Math.round(rect.height * this.pixelRatio))
    if (!this.centered && rect.width > 0 && rect.height > 0) {
      // Start with the grid origin in the middle of the canvas.
      this.centered = true
      const { view, setView } = useEditor.getState()
      if (view.panX === 0 && view.panY === 0) {
        setView({ ...view, panX: Math.round(rect.width / 2), panY: Math.round(rect.height / 2) })
      }
    }
    this.draw()
  }

  private requestDraw(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.draw())
  }

  private draw(): void {
    const state = useEditor.getState()
    const mode = this.mode
    const doc = this.previewDoc ?? state.doc

    let highlight: Point | null = null
    let wirePreview: Point[] | null = null
    if (mode.kind === 'wire') {
      const targetEnd = mode.target ? this.endOfHit(doc, mode.target) : undefined
      wirePreview = routeWire(mode.fromEnd, targetEnd ?? { pos: snapPoint(mode.current) })
      highlight = targetEnd?.pos ?? null
    } else if (mode.kind === 'idle' && this.hover && this.hover.kind !== 'component') {
      highlight = this.hover.pos
    }

    renderScene(this.ctx, this.width, this.height, this.pixelRatio, this.theme, {
      doc,
      selection: state.selection,
      view: state.view,
      highlight,
      wirePreview,
      marquee: mode.kind === 'marquee' ? rectFromPoints(mode.start, mode.current) : null,
      ghost: state.placing?.pos ? { type: state.placing.type, pos: state.placing.pos } : null,
    })
  }

  // ---- Helpers ----

  private toWorld(event: PointerEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    return screenToWorld(
      useEditor.getState().view,
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }

  private endOfHit(doc: CircuitDoc, hit: Hit): RouteEnd | undefined {
    if (hit.kind === 'pin') return terminalEnd(doc, hit.terminal)
    if (hit.kind === 'junction' || hit.kind === 'wire') return { pos: hit.pos }
    return undefined
  }

  private wireEndOfHit(hit: Hit): WireEnd | undefined {
    if (hit.kind === 'pin') return { kind: 'terminal', terminal: hit.terminal }
    if (hit.kind === 'junction') {
      return { kind: 'terminal', terminal: { kind: 'junction', junction: hit.id } }
    }
    if (hit.kind === 'wire') return { kind: 'wire', wire: hit.id, pos: hit.pos }
    return undefined
  }

  /** What a wire being drawn from `from` could attach to at `world`. */
  private wireTarget(from: WireEnd, world: Point): Hit | null {
    const hit = hitTest(useEditor.getState().doc, world)
    if (!hit || hit.kind === 'component') return null
    const end = this.wireEndOfHit(hit)
    if (!end) return null
    if (from.kind === 'wire' && end.kind === 'wire' && from.wire === end.wire) return null
    if (
      from.kind === 'terminal' &&
      end.kind === 'terminal' &&
      sameTerminal(from.terminal, end.terminal)
    ) {
      return null
    }
    return hit
  }

  private setCursor(): void {
    let cursor = 'default'
    if (this.mode.kind === 'pan') cursor = 'grabbing'
    else if (this.spaceDown) cursor = 'grab'
    else if (this.mode.kind === 'wire') cursor = 'crosshair'
    else if (this.mode.kind === 'move') cursor = 'move'
    else if (this.hover?.kind === 'pin' || this.hover?.kind === 'wire') cursor = 'crosshair'
    else if (this.hover) cursor = 'move'
    this.canvas.style.cursor = cursor
  }

  private finish(): void {
    this.mode = { kind: 'idle' }
    this.previewDoc = null
    this.setCursor()
    this.requestDraw()
  }

  // ---- Pointer ----

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.focus()
    if (event.button === 1 || (event.button === 0 && this.spaceDown)) {
      event.preventDefault()
      this.canvas.setPointerCapture(event.pointerId)
      this.mode = { kind: 'pan', lastX: event.clientX, lastY: event.clientY }
      this.setCursor()
      return
    }
    if (event.button !== 0) return
    this.canvas.setPointerCapture(event.pointerId)

    const state = useEditor.getState()
    const world = this.toWorld(event)
    const hit = hitTest(state.doc, world)

    if (hit?.kind === 'pin') {
      const fromEnd = terminalEnd(state.doc, hit.terminal)
      if (!fromEnd) return
      this.mode = {
        kind: 'wire',
        from: { kind: 'terminal', terminal: hit.terminal },
        fromEnd,
        current: world,
        target: null,
      }
      this.setCursor()
      this.requestDraw()
      return
    }

    if (hit?.kind === 'component' || hit?.kind === 'junction') {
      if (event.shiftKey) state.toggleSelected(hit.id)
      else if (!state.selection.has(hit.id)) state.setSelection([hit.id])
    }
    this.mode = {
      kind: 'press',
      hit,
      startX: event.clientX,
      startY: event.clientY,
      world,
      shift: event.shiftKey,
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const state = useEditor.getState()
    const world = this.toWorld(event)
    const mode = this.mode

    switch (mode.kind) {
      case 'pan': {
        const { view } = state
        state.setView({
          ...view,
          panX: view.panX + event.clientX - mode.lastX,
          panY: view.panY + event.clientY - mode.lastY,
        })
        mode.lastX = event.clientX
        mode.lastY = event.clientY
        return
      }
      case 'press': {
        const travelled = Math.hypot(event.clientX - mode.startX, event.clientY - mode.startY)
        if (travelled < DRAG_THRESHOLD) return
        this.beginDrag(mode)
        if (this.mode.kind !== 'press') this.onPointerMove(event)
        return
      }
      case 'move': {
        const dx = Math.round(world.x - mode.start.x)
        const dy = Math.round(world.y - mode.start.y)
        if (dx === mode.dx && dy === mode.dy) return
        mode.dx = dx
        mode.dy = dy
        this.previewDoc = moveItems(state.doc, state.selection, dx, dy)
        this.requestDraw()
        return
      }
      case 'marquee':
        mode.current = world
        this.requestDraw()
        return
      case 'wire':
        mode.current = world
        mode.target = this.wireTarget(mode.from, world)
        this.requestDraw()
        return
      case 'idle': {
        const hover = hitTest(state.doc, world)
        const changed = JSON.stringify(hover) !== JSON.stringify(this.hover)
        this.hover = hover
        this.setCursor()
        if (changed) this.requestDraw()
      }
    }
  }

  /** Decides what a press that started moving turns into. */
  private beginDrag(press: Extract<Mode, { kind: 'press' }>): void {
    const state = useEditor.getState()
    const hit = press.hit
    this.hover = null
    if (hit === null) {
      this.mode = {
        kind: 'marquee',
        start: press.world,
        current: press.world,
        additive: press.shift,
      }
    } else if (hit.kind === 'wire') {
      this.mode = {
        kind: 'wire',
        from: { kind: 'wire', wire: hit.id, pos: hit.pos },
        fromEnd: { pos: hit.pos },
        current: press.world,
        target: null,
      }
    } else if (hit.kind !== 'pin' && state.selection.has(hit.id)) {
      this.mode = { kind: 'move', start: press.world, dx: 0, dy: 0 }
    } else {
      // Shift-click just took this item out of the selection: nothing to drag.
      this.mode = { kind: 'idle' }
    }
    this.setCursor()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    const state = useEditor.getState()
    const mode = this.mode

    switch (mode.kind) {
      case 'press': {
        const hit = mode.hit
        if (hit === null) {
          if (!mode.shift) state.setSelection([])
        } else if (hit.kind === 'wire') {
          if (mode.shift) state.toggleSelected(hit.id)
          else state.setSelection([hit.id])
        } else if (hit.kind !== 'pin' && !mode.shift) {
          state.setSelection([hit.id])
        }
        break
      }
      case 'move':
        if (mode.dx !== 0 || mode.dy !== 0) state.moveSelection(mode.dx, mode.dy)
        break
      case 'marquee': {
        const inside = itemsInRect(state.doc, rectFromPoints(mode.start, mode.current))
        state.setSelection(mode.additive ? [...state.selection, ...inside] : inside)
        break
      }
      case 'wire': {
        const to = mode.target ? this.wireEndOfHit(mode.target) : undefined
        if (to) state.connect(mode.from, to)
        break
      }
      default:
        break
    }
    this.hover = hitTest(useEditor.getState().doc, this.toWorld(event))
    this.finish()
  }

  private readonly onPointerCancel = (): void => {
    this.finish()
  }

  private readonly onPointerLeave = (): void => {
    if (this.mode.kind !== 'idle' || this.hover === null) return
    this.hover = null
    this.setCursor()
    this.requestDraw()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const factor = Math.exp(-event.deltaY * 0.0015)
    useEditor.getState().zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top)
  }

  // ---- Keyboard ----

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return
    const state = useEditor.getState()
    const command = event.ctrlKey || event.metaKey
    // `code` names the physical key, so shortcuts work on any keyboard layout.
    const code = event.code

    if (code === 'Space') {
      if (document.activeElement === this.canvas || document.activeElement === document.body) {
        event.preventDefault()
        this.spaceDown = true
        this.setCursor()
      }
      return
    }
    if (code === 'Escape') {
      if (state.placing) state.setPlacing(null)
      else if (this.mode.kind !== 'idle') this.finish()
      else state.setSelection([])
      return
    }

    if (command) {
      const actions: Record<string, () => void> = {
        KeyZ: () => (event.shiftKey ? state.redo() : state.undo()),
        KeyY: () => state.redo(),
        KeyC: () => state.copy(),
        KeyX: () => state.cut(),
        KeyV: () => state.paste(),
        KeyA: () => state.selectAll(),
      }
      const action = actions[code]
      if (!action) return
      event.preventDefault()
      action()
      return
    }

    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (code in moves) {
      if (state.selection.size === 0) return
      event.preventDefault()
      state.moveSelection(moves[code][0], moves[code][1])
    } else if (code === 'Delete' || code === 'Backspace') {
      event.preventDefault()
      state.deleteSelection()
    } else if (code === 'KeyR') {
      state.rotateSelection()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return
    this.spaceDown = false
    this.setCursor()
  }
}
