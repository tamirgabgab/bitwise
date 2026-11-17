import {
  bendWire,
  duplicateItems,
  isSwitchKey,
  moveItems,
  sameTerminal,
  terminalEnd,
} from './document.ts'
import type { CircuitDoc, WireEnd } from './document.ts'
import { rectFromPoints, rotatePoint, snapPoint } from './geometry.ts'
import type { Point, Rotation } from './geometry.ts'
import { docBounds, hitTest, itemsInRect, terminalOfHit } from './hitTest.ts'
import type { Hit } from './hitTest.ts'
import { isPokeable, readLiveValues } from './liveValues.ts'
import type { LiveValues } from './liveValues.ts'
import { useProbe } from './probeStore.ts'
import { WirePulses, flowDirections } from './pulses.ts'
import { renderScene } from './render.ts'
import type { Scene } from './render.ts'
import { routeWire } from './routing.ts'
import type { RouteEnd } from './routing.ts'
import { canvasRuntime } from './runtime.ts'
import {
  breakpointMarks,
  criticalMarks,
  currentBridge,
  evaluatedParts,
  holdButton,
  pokeInput,
  pressKey,
  releaseKey,
  releaseKeys,
  showStep,
  toggleWatch,
} from './session.ts'
import { useSim } from './simStore.ts'
import { useEditor } from './store.ts'
import type { EditorState, ProjectSettings } from './store.ts'
import { subRefOf } from './subcircuit.ts'
import { circuitSvg } from './svgExport.ts'
import { symbolOf } from './symbols.ts'
import { readCanvasTheme } from './theme.ts'
import type { CanvasTheme } from './theme.ts'
import { makeValueStyle } from './valueStyle.ts'
import type { ValueStyle } from './valueStyle.ts'
import { keepInSight, screenToWorld, wheelZoomFactor } from './view.ts'
import { bendPoints, wirePath } from './wireLayout.ts'

/** How far the pointer must travel, in pixels, before a press is a drag. */
const DRAG_THRESHOLD = 4

/** At this many ticks a second or fewer, the eye can follow a change spreading. */
const SLOW_SPEED = 5

const NO_PARTS: ReadonlySet<string> = new Set()

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
      /** Alt was down: dragging the selection leaves a copy behind. */
      readonly alt: boolean
      /** The press landed on the face of a switch: a click changes its value. */
      readonly poke: boolean
    }
  /** A push button is being held down. */
  | { readonly kind: 'hold'; readonly id: string }
  | {
      readonly kind: 'move'
      readonly start: Point
      /** The drag carries a copy and leaves the selection where it was. */
      readonly copy: boolean
      dx: number
      dy: number
    }
  /**
   * A straight stretch of a selected wire being dragged sideways. Junctions
   * go in at its two ends, `at`, and move with it.
   */
  | {
      readonly kind: 'bend'
      readonly wire: string
      readonly at: readonly Point[]
      /** The stretch runs left to right, so it moves only up and down. */
      readonly level: boolean
      readonly start: Point
      dx: number
      dy: number
    }
  | { readonly kind: 'marquee'; readonly start: Point; current: Point; readonly additive: boolean }
  | {
      readonly kind: 'wire'
      readonly from: WireEnd
      readonly fromEnd: RouteEnd
      current: Point
      target: Hit | null
    }

/** True for a key press that belongs to a text field or to a window over the app. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('dialog')) return true
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
  /**
   * Where the pointer last was in the window, in window pixels. It is
   * followed over the whole window, so that the cards and maps drawn over
   * the canvas do not hide it.
   */
  private pointerAt: { x: number; y: number } | null = null
  /** The pointer rests on the face of a switch or button. */
  private hoverPoke = false
  /** The document as it would look if the drag in progress ended now. */
  private previewDoc: CircuitDoc | null = null
  private theme: CanvasTheme
  private style: ValueStyle | null = null
  private styleSettings: ProjectSettings | null = null
  private width = 0
  private height = 0
  private pixelRatio = 1
  private frame = 0
  private spaceDown = false
  private centered = false
  private readonly pulses = new WirePulses()
  /** Set when the user asked the system for less motion: no waves then. */
  private readonly calm = window.matchMedia('(prefers-reduced-motion: reduce)')

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
    this.listen(canvas, 'contextmenu', this.onContextMenu)
    this.listen(canvas, 'dblclick', this.onDoubleClick)
    this.listen(window, 'pointermove', (event: PointerEvent) => {
      this.pointerAt = { x: event.clientX, y: event.clientY }
    })
    this.listen(document.documentElement, 'pointerleave', () => {
      this.pointerAt = null
    })
    this.listen(window, 'keydown', this.onKeyDown)
    this.listen(window, 'keyup', this.onKeyUp)
    this.listen(window, 'blur', releaseKeys)

    const observer = new ResizeObserver(() => this.resize())
    observer.observe(canvas)
    this.cleanups.push(() => observer.disconnect())

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.listen(darkQuery, 'change', () => this.refreshTheme())
    // Values are drawn in a face that may still be loading on the first frame.
    this.listen(document.fonts, 'loadingdone', () => this.requestDraw())

    this.cleanups.push(
      useEditor.subscribe((state, previous) => {
        if (state.theme !== previous.theme) this.refreshTheme()
        if (state.active !== previous.active || state.epoch !== previous.epoch) {
          // Another drawing is on screen: whatever was being dragged is gone.
          this.mode = { kind: 'idle' }
          this.previewDoc = null
          this.pulses.reset()
          this.hover = null
          this.hoverPoke = false
          this.probe(null)
          this.setCursor()
          this.frameCircuit()
        }
        this.requestDraw()
      }),
      // The simulator moved: wires and lamps may show new values.
      useSim.subscribe((state, previous) => {
        if (
          state.revision !== previous.revision ||
          state.running !== previous.running ||
          state.speed !== previous.speed ||
          state.criticalShown !== previous.criticalShown
        ) {
          this.requestDraw()
        }
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
      pointerGrid: () => {
        const at = this.pointerAt
        return at ? (canvasRuntime.current?.clientToGrid(at.x, at.y) ?? null) : null
      },
      gridCenter: () =>
        snapPoint(screenToWorld(useEditor.getState().view, this.width / 2, this.height / 2)),
      screenCenter: () => ({ x: this.width / 2, y: this.height / 2 }),
      size: () => ({ width: this.width, height: this.height }),
      svg: () => {
        const state = useEditor.getState()
        return circuitSvg(
          state.doc,
          this.theme,
          this.valueStyle(state.settings),
          readLiveValues(state.doc, currentBridge()),
        )
      },
    }
    this.cleanups.push(() => {
      canvasRuntime.current = null
      this.probe(null)
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
    this.style = null
    this.requestDraw()
  }

  /** The way values look now, rebuilt only when the settings or theme change. */
  private valueStyle(settings: ProjectSettings): ValueStyle {
    if (!this.style || this.styleSettings !== settings) {
      this.style = makeValueStyle(settings, this.theme)
      this.styleSettings = settings
    }
    return this.style
  }

  /** Brings a circuit that is on screen for the first time into view. */
  private frameCircuit(): void {
    if (this.width > 0 && this.height > 0) useEditor.getState().frame(this.width, this.height)
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    if (this.centered && rect.width > 0 && rect.height > 0) {
      // A panel opened beside or below the canvas: keep the drawing in sight.
      const { view, doc, setView } = useEditor.getState()
      const bounds = docBounds(doc)
      if (bounds) {
        const before = { width: this.width, height: this.height }
        const kept = keepInSight(view, bounds, before, rect)
        if (kept !== view) setView(kept)
      }
    }
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
      this.frameCircuit()
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

    const live = readLiveValues(doc, currentBridge())
    renderScene(this.ctx, this.width, this.height, this.pixelRatio, this.theme, {
      doc,
      selection: state.selection,
      view: state.view,
      highlight,
      wirePreview,
      marquee: mode.kind === 'marquee' ? rectFromPoints(mode.start, mode.current) : null,
      ghost: this.ghostOf(state),
      live,
      style: this.valueStyle(state.settings),
      pulse: this.pulseOf(doc, live),
      active: this.followsChanges() ? evaluatedParts() : NO_PARTS,
      critical: useSim.getState().criticalShown ? criticalMarks() : undefined,
      marks: breakpointMarks(doc),
    })
  }

  /**
   * Notes which wires changed since the last frame, and gives the waves that
   * are running over them. While one runs, the canvas keeps redrawing.
   */
  private pulseOf(doc: CircuitDoc, live: LiveValues): Scene['pulse'] {
    if (this.calm.matches) return undefined
    const now = performance.now()
    const values = new Map<string, string>()
    for (const wire of Object.values(doc.wires)) {
      const value = live.at(wire.from)
      values.set(wire.id, `${value.signal.join(',')}|${value.conflict}`)
    }
    this.pulses.observe(values, now)
    if (!this.pulses.active(now)) return undefined
    this.requestDraw()
    const directions = flowDirections(doc)
    return (id) => {
      const progress = this.pulses.progress(id, now)
      return progress === undefined ? undefined : { progress, direction: directions.get(id) ?? 0 }
    }
  }

  /**
   * True when time moves slowly enough to watch a change go from part to
   * part: stepping through a paused circuit, or running at a crawl.
   */
  private followsChanges(): boolean {
    const { running, speed } = useSim.getState()
    return !running || (speed !== 'max' && speed <= SLOW_SPEED)
  }

  /** Shows the probe on the wire under the pointer, or puts it away. */
  private probe(hover: Hit | null, event?: MouseEvent): void {
    const terminal = terminalOfHit(useEditor.getState().doc, hover)
    if (!terminal || !event) {
      if (useProbe.getState().at !== null) useProbe.setState({ at: null })
      return
    }
    const rect = this.canvas.getBoundingClientRect()
    useProbe.setState({
      at: { x: event.clientX - rect.left, y: event.clientY - rect.top, terminal },
    })
  }

  // ---- Helpers ----

  /** The part being carried in from the palette, if it is over the canvas. */
  private ghostOf(state: EditorState): Scene['ghost'] {
    const placing = state.placing
    if (!placing?.pos) return null
    const circuit = placing.circuit === undefined ? undefined : state.circuits[placing.circuit]
    return { type: placing.type, pos: placing.pos, sub: circuit ? subRefOf(circuit) : undefined }
  }

  private toWorld(event: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect()
    return screenToWorld(
      useEditor.getState().view,
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }

  /**
   * The switch or push button whose face is under `world`, if any. The face
   * answers clicks; the housing around it is for selecting and dragging.
   */
  private pokeTarget(doc: CircuitDoc, hit: Hit | null, world: Point): string | null {
    if (hit?.kind !== 'component') return null
    const component = doc.components[hit.id]
    if (!component || !isPokeable(component.type)) return null
    const face = symbolOf(component).face
    if (!face) return null
    const local = rotatePoint(
      { x: world.x - component.pos.x, y: world.y - component.pos.y },
      ((4 - component.rotation) % 4) as Rotation,
    )
    const reach = face.reach + 0.08
    const inside =
      Math.abs(local.x - face.pos.x) <= reach && Math.abs(local.y - face.pos.y) <= reach
    return inside ? hit.id : null
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
    else if (this.mode.kind === 'move') cursor = this.mode.copy ? 'copy' : 'move'
    else if (this.mode.kind === 'bend') cursor = 'move'
    else if (this.mode.kind === 'hold' || this.hoverPoke) cursor = 'pointer'
    else if (this.hover?.kind === 'wire' && useEditor.getState().selection.has(this.hover.id)) {
      cursor = 'move'
    } else if (this.hover?.kind === 'pin' || this.hover?.kind === 'wire') cursor = 'crosshair'
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
    this.probe(null)
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

    const poked = this.pokeTarget(state.doc, hit, world)
    if (poked !== null && state.doc.components[poked].type === 'button') {
      // A push button acts the moment it goes down and lets go on release.
      holdButton(poked, true)
      this.mode = { kind: 'hold', id: poked }
      this.setCursor()
      return
    }

    // On a switch face Shift means "step backwards", not "add to selection".
    if (poked === null && (hit?.kind === 'component' || hit?.kind === 'junction')) {
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
      alt: event.altKey,
      poke: poked !== null,
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
        this.previewDoc = !mode.copy
          ? moveItems(state.doc, state.selection, dx, dy)
          : dx === 0 && dy === 0
            ? null
            : duplicateItems(state.doc, state.selection, { x: dx, y: dy }).doc
        this.requestDraw()
        return
      }
      case 'bend': {
        const dx = mode.level ? 0 : Math.round(world.x - mode.start.x)
        const dy = mode.level ? Math.round(world.y - mode.start.y) : 0
        if (dx === mode.dx && dy === mode.dy) return
        mode.dx = dx
        mode.dy = dy
        this.previewDoc =
          dx === 0 && dy === 0 ? null : (bendWire(state.doc, mode.wire, mode.at, dx, dy)?.doc ?? null)
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
      case 'hold':
        return
      case 'idle': {
        const hover = hitTest(state.doc, world)
        const changed = JSON.stringify(hover) !== JSON.stringify(this.hover)
        this.hover = hover
        this.hoverPoke = this.pokeTarget(state.doc, hover, world) !== null
        this.setCursor()
        if (changed) {
          this.probe(hover, event)
          this.requestDraw()
        }
      }
    }
  }

  /** Starts dragging the straight stretch of a wire that runs through `pos`. */
  private bendOf(doc: CircuitDoc, wireId: string, pos: Point, start: Point): Mode {
    const wire = doc.wires[wireId]
    const path = wire && wirePath(doc, wire)
    const bend = path && bendPoints(wire, path, pos)
    if (!bend) return { kind: 'idle' }
    return { kind: 'bend', wire: wireId, ...bend, start, dx: 0, dy: 0 }
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
    } else if (hit.kind === 'wire' && state.selection.has(hit.id) && !press.shift) {
      // A selected wire moves, like a selected part; any other wire starts a branch.
      this.mode = this.bendOf(state.doc, hit.id, hit.pos, press.world)
    } else if (hit.kind === 'wire') {
      this.mode = {
        kind: 'wire',
        from: { kind: 'wire', wire: hit.id, pos: hit.pos },
        fromEnd: { pos: hit.pos },
        current: press.world,
        target: null,
      }
    } else if (hit.kind !== 'pin' && (press.poke || state.selection.has(hit.id))) {
      // Dragging a switch by its face moves it like any other part.
      if (!state.selection.has(hit.id)) state.setSelection([hit.id])
      this.mode = { kind: 'move', start: press.world, copy: press.alt, dx: 0, dy: 0 }
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
      case 'hold':
        holdButton(mode.id, false)
        break
      case 'press': {
        const hit = mode.hit
        if (mode.poke && hit?.kind === 'component') {
          pokeInput(hit.id, mode.shift ? -1 : 1)
        } else if (hit === null) {
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
        if (mode.copy) state.duplicateSelection(mode.dx, mode.dy)
        else if (mode.dx !== 0 || mode.dy !== 0) state.moveSelection(mode.dx, mode.dy)
        break
      case 'bend':
        state.bendWire(mode.wire, mode.at, mode.dx, mode.dy)
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
    const world = this.toWorld(event)
    this.hover = hitTest(useEditor.getState().doc, world)
    this.hoverPoke = this.pokeTarget(useEditor.getState().doc, this.hover, world) !== null
    this.finish()
  }

  private readonly onPointerCancel = (): void => {
    if (this.mode.kind === 'hold') holdButton(this.mode.id, false)
    this.finish()
  }

  /** A right-click on a switch steps it backwards instead of opening a menu. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    const doc = useEditor.getState().doc
    const world = this.toWorld(event)
    const hit = hitTest(doc, world)
    const poked = this.pokeTarget(doc, hit, world)
    if (poked !== null) {
      event.preventDefault()
      if (doc.components[poked].type === 'input') pokeInput(poked, -1)
      return
    }
    // A right click on a wire gives it a row of its own in the timing diagram, or takes it away.
    const terminal = hit?.kind === 'component' ? undefined : terminalOfHit(doc, hit)
    if (!terminal) return
    event.preventDefault()
    if (toggleWatch(terminal)) useSim.getState().setScopeOpen(true)
  }

  /** A double click on a part that stands for a named circuit opens it. */
  private readonly onDoubleClick = (event: MouseEvent): void => {
    const state = useEditor.getState()
    const hit = hitTest(state.doc, this.toWorld(event))
    if (hit?.kind !== 'component') return
    const circuit = state.doc.components[hit.id]?.sub?.circuit
    if (circuit !== undefined) state.selectCircuit(circuit)
  }

  private readonly onPointerLeave = (): void => {
    if (this.mode.kind !== 'idle' || this.hover === null) return
    this.hover = null
    this.hoverPoke = false
    this.probe(null)
    this.setCursor()
    this.requestDraw()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const factor = wheelZoomFactor(event.deltaY, event.deltaMode, rect.height)
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
        KeyG: () => void state.selectionToCircuit(),
      }
      const action = actions[code]
      if (!action) return
      event.preventDefault()
      action()
      return
    }

    // While the presentation steps are open, the arrows walk through them.
    const steps = state.stepsOpen ? (state.circuits[state.active].steps?.length ?? 0) : 0
    if (steps > 0 && !event.altKey) {
      const jumps: Record<string, number> = {
        ArrowRight: state.stepIndex + 1,
        ArrowDown: state.stepIndex + 1,
        PageDown: state.stepIndex + 1,
        ArrowLeft: state.stepIndex - 1,
        ArrowUp: state.stepIndex - 1,
        PageUp: state.stepIndex - 1,
        Home: 0,
        End: steps - 1,
      }
      if (code in jumps) {
        event.preventDefault()
        showStep(jumps[code])
        return
      }
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
    } else if (isSwitchKey(code) && !event.altKey && !event.repeat) {
      // A key the user gave to a switch or a push button of this circuit.
      if (pressKey(code, event.shiftKey)) event.preventDefault()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isSwitchKey(event.code)) releaseKey(event.code)
    if (event.code !== 'Space') return
    this.spaceDown = false
    this.setCursor()
  }
}
