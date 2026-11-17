import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  DEFAULT_SCOPE_VIEW,
  SCOPE_NAMES,
  SCOPE_ZOOMS,
  currentScope,
  makeValueStyle,
  readCanvasTheme,
  renderScope,
  scopeHeight,
  scopeRowAt,
  scopeStart,
  scopeTickAt,
  scopeTicks,
  scopeZoom,
  unwatchRow,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { ScopeView } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon, PauseIcon, PlayIcon, ZoomInIcon, ZoomOutIcon } from './icons.tsx'
import { clampPanelHeight } from './panelSize.ts'

/** How far one press of an arrow key moves the edge of the panel. */
const KEY_STEP = 24

/**
 * The top edge of the panel, to drag it taller or shorter. A double click
 * gives the panel back the height its rows need.
 */
function PanelGrip({ height }: { height: number | null }) {
  const drag = useRef<{ y: number; height: number } | null>(null)
  const { setTimingHeight } = useChrome.getState()
  const panelHeight = (grip: HTMLElement): number =>
    grip.parentElement?.getBoundingClientRect().height ?? 0

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { y: event.clientY, height: panelHeight(event.currentTarget) }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = drag.current
    if (!start) return
    setTimingHeight(clampPanelHeight(start.height + start.y - event.clientY, window.innerHeight))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const by = event.code === 'ArrowUp' ? KEY_STEP : event.code === 'ArrowDown' ? -KEY_STEP : 0
    if (by === 0) return
    event.preventDefault()
    setTimingHeight(clampPanelHeight(panelHeight(event.currentTarget) + by, window.innerHeight))
  }

  return (
    <div
      className="panel-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Height of the timing diagram"
      aria-valuenow={height ?? undefined}
      tabIndex={0}
      title="Drag to resize. Double-click for the height the rows need"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => setTimingHeight(null)}
      onKeyDown={onKeyDown}
    />
  )
}

/** The kinds of part that get a row of their own. */
const ROW_TYPES = ['clock', 'cycle', 'input', 'output']

/**
 * The timing diagram: what the clocks, switches and outputs of the open
 * circuit, and any wire the user added, carried over the last ticks, one row
 * each. It zooms, can be frozen to look back while the run goes on, and shows
 * every value at the tick under the pointer.
 */
export function TimingPanel() {
  const open = useSim((state) => state.scopeOpen)
  const watched = useSim((state) => state.watched.length)
  const settings = useEditor((state) => state.settings)
  const parts = useEditor((state) => {
    let count = 0
    for (const part of Object.values(state.doc.components)) {
      if (ROW_TYPES.includes(part.type)) count++
    }
    return count
  })
  const rows = parts + watched
  const height = useChrome((state) => state.timingHeight)
  const [tickWidth, setTickWidth] = useState(DEFAULT_SCOPE_VIEW.tickWidth)
  /** The tick at the right edge while frozen, or null to follow the run. */
  const [end, setEnd] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const cursorRef = useRef<number | null>(null)
  const redrawRef = useRef<() => void>(() => {})

  // A restart takes the clock back past a frozen end: follow the run again.
  const time = useSim((state) => state.time)
  if (end !== null && time < end) setEnd(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (spanRef.current) spanRef.current.textContent = ''
    if (!open || !canvas || !ctx) return
    let frame = 0

    const draw = (): void => {
      frame = 0
      const scene = currentScope()
      const width = canvas.parentElement?.clientWidth ?? 0
      const height = scopeHeight(scene.signals.length, scene.radix)
      if (width === 0) return
      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
        canvas.style.height = `${height}px`
      }
      const theme = readCanvasTheme(canvas)
      const view: ScopeView = { tickWidth, end, cursor: cursorRef.current }
      renderScope(ctx, width, height, ratio, theme, scene, view, makeValueStyle(settings, theme))
      if (spanRef.current) {
        const shown = scopeTicks(width, tickWidth)
        const from = scopeStart(scene.time, width, view)
        spanRef.current.textContent =
          end === null
            ? `The last ${shown} ticks`
            : `Frozen at ticks ${from} to ${Math.min(from + shown, end)}`
      }
    }
    const request = (): void => {
      if (frame === 0) frame = requestAnimationFrame(draw)
    }
    redrawRef.current = request

    draw()
    const stops = [
      useSim.subscribe((state, previous) => {
        if (state.revision !== previous.revision) request()
      }),
      useEditor.subscribe((state, previous) => {
        if (state.doc !== previous.doc || state.theme !== previous.theme) request()
      }),
    ]
    const observer = new ResizeObserver(request)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', request)
    return () => {
      for (const stop of stops) stop()
      observer.disconnect()
      scheme.removeEventListener('change', request)
      cancelAnimationFrame(frame)
    }
  }, [open, rows, tickWidth, end, settings])

  // Ctrl and the wheel zoom; the wheel sideways, or with Shift, moves through time.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!open || !canvas) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        if (event.deltaY !== 0) setTickWidth((was) => scopeZoom(was, event.deltaY < 0 ? 1 : -1))
        return
      }
      const sideways = event.shiftKey ? event.deltaY : event.deltaX
      if (sideways === 0) return
      event.preventDefault()
      const now = useSim.getState().time
      const shown = scopeTicks(canvas.clientWidth, tickWidth)
      const step = Math.max(1, Math.round(shown / 8)) * Math.sign(sideways)
      setEnd((was) => {
        const next = Math.min(now, Math.max(Math.min(shown, now), (was ?? now) + step))
        return next >= now ? null : next
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [open, rows, tickWidth])

  if (!open) return null

  const pointAt = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  /** The row under the pointer when it is the name of a wire the user added. */
  const addedRowAt = (x: number, y: number): string | null => {
    if (x >= SCOPE_NAMES) return null
    const scene = currentScope()
    const row = scopeRowAt(y, scene.signals.length, scene.radix)
    return row !== null && scene.signals[row].kind === 'wire' ? scene.signals[row].key : null
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const { x, y } = pointAt(event)
    const canvas = event.currentTarget
    const removable = addedRowAt(x, y) !== null
    canvas.style.cursor = removable ? 'pointer' : ''
    canvas.title = removable ? 'Click to take this wire out of the diagram' : ''
    const view: ScopeView = { tickWidth, end, cursor: null }
    const tick = scopeTickAt(x, useSim.getState().time, canvas.clientWidth, view)
    if (tick !== cursorRef.current) {
      cursorRef.current = tick
      redrawRef.current()
    }
  }
  const onPointerLeave = (): void => {
    cursorRef.current = null
    redrawRef.current()
  }
  const onClick = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const { x, y } = pointAt(event)
    const key = addedRowAt(x, y)
    if (key !== null) unwatchRow(key)
  }
  const frozen = end !== null

  return (
    <section
      className="timing"
      aria-label="Timing diagram"
      style={height === null ? undefined : { height, maxHeight: '70vh' }}
    >
      <PanelGrip height={height} />
      <header className="timing-head">
        <h2>Timing</h2>
        <span ref={spanRef} className="timing-span" />
        <button
          type="button"
          className="tool"
          aria-label="Zoom the timing diagram out"
          title="Zoom out (Ctrl+wheel)"
          disabled={tickWidth === SCOPE_ZOOMS[0]}
          onClick={() => setTickWidth((was) => scopeZoom(was, -1))}
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Zoom the timing diagram in"
          title="Zoom in (Ctrl+wheel)"
          disabled={tickWidth === SCOPE_ZOOMS[SCOPE_ZOOMS.length - 1]}
          onClick={() => setTickWidth((was) => scopeZoom(was, 1))}
        >
          <ZoomInIcon />
        </button>
        <button
          type="button"
          className="tool"
          aria-pressed={frozen}
          aria-label="Freeze the timing diagram"
          title={
            frozen
              ? 'Follow the run again'
              : 'Freeze: the run goes on and the diagram stays put. Shift+wheel looks back'
          }
          onClick={() => setEnd(frozen ? null : useSim.getState().time)}
        >
          {frozen ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Close the timing diagram"
          title="Close the timing diagram"
          onClick={() => useSim.getState().setScopeOpen(false)}
        >
          <CloseIcon />
        </button>
      </header>
      {rows === 0 ? (
        <p className="timing-empty">
          Nothing to follow yet. Add a clock, an input or an output, or right-click a wire, and it
          gets a row here.
        </p>
      ) : (
        <div className="timing-body">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Values of ${rows} signal${rows === 1 ? '' : 's'} over the last ticks`}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onClick}
          />
        </div>
      )}
    </section>
  )
}
