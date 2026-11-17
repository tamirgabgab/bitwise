import { useEffect, useRef } from 'react'
import {
  currentScope,
  readCanvasTheme,
  renderScope,
  scopeHeight,
  scopeTicks,
  useEditor,
  useSim,
} from '../editor/index.ts'
import { CloseIcon } from './icons.tsx'

/**
 * The timing diagram: what the clocks, switches and outputs of the open
 * circuit carried over the last ticks, one row each.
 */
export function TimingPanel() {
  const open = useSim((state) => state.scopeOpen)
  const rows = useEditor((state) => {
    let count = 0
    for (const part of Object.values(state.doc.components)) {
      if (part.type === 'clock' || part.type === 'input' || part.type === 'output') count++
    }
    return count
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
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
    <section className="timing" aria-label="Timing diagram">
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
