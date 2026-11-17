import { useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  currentScope,
  readCanvasTheme,
  renderScope,
  scopeHeight,
  scopeTicks,
  useEditor,
  useSim,
} from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
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

/**
 * The timing diagram: what the clocks, switches and outputs of the open
 * circuit carried over the last ticks, one row each.
 */
export function TimingPanel() {
  const open = useSim((state) => state.scopeOpen)
  const rows = useEditor((state) => {
    let count = 0
    for (const part of Object.values(state.doc.components)) {
      if (['clock', 'cycle', 'input', 'output'].includes(part.type)) count++
    }
    return count
  })
  const height = useChrome((state) => state.timingHeight)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)

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
      const height = scopeHeight(scene.signals.length)
      if (width === 0) return
      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
        canvas.style.height = `${height}px`
      }
      renderScope(ctx, width, height, ratio, readCanvasTheme(canvas), scene)
      if (spanRef.current) spanRef.current.textContent = `The last ${scopeTicks(width)} ticks`
    }
    const request = (): void => {
      if (frame === 0) frame = requestAnimationFrame(draw)
    }

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
  }, [open, rows])

  if (!open) return null

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
          aria-label="Close the timing diagram"
          title="Close the timing diagram"
          onClick={() => useSim.getState().setScopeOpen(false)}
        >
          <CloseIcon />
        </button>
      </header>
      {rows === 0 ? (
        <p className="timing-empty">
          Nothing to follow yet. Add a clock, an input or an output, and it gets a row here.
        </p>
      ) : (
        <div className="timing-body">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Values of ${rows} signal${rows === 1 ? '' : 's'} over the last ticks`}
          />
        </div>
      )}
    </section>
  )
}
