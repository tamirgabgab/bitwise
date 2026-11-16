import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { findPreset, sandboxGates } from '../core/index.ts'
import { canvasRuntime, readCanvasTheme, renderSymbolIcon, useEditor } from '../editor/index.ts'
import { partHint, partName } from './parts.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

const IO_PARTS: readonly string[] = ['input', 'button', 'output']

const ICON_WIDTH = 64
const ICON_HEIGHT = 40

function SymbolIcon({ type }: { type: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useResolvedTheme()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = ICON_WIDTH * ratio
    canvas.height = ICON_HEIGHT * ratio
    renderSymbolIcon(ctx, ICON_WIDTH, ICON_HEIGHT, ratio, readCanvasTheme(canvas), type)
  }, [type, theme])

  return <canvas ref={ref} aria-hidden="true" />
}

/**
 * Starts carrying a part from the palette. It follows the pointer as a ghost
 * and is placed where the button is released, if that is over the canvas.
 */
function beginPlacing(type: string, event: ReactPointerEvent): void {
  if (event.button !== 0) return
  const { setPlacing, addComponent } = useEditor.getState()
  const gridAt = (e: PointerEvent) =>
    canvasRuntime.current?.clientToGrid(e.clientX, e.clientY) ?? null

  const move = (e: PointerEvent) => setPlacing({ type, pos: gridAt(e) })
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    setPlacing(null)
  }
  const up = (e: PointerEvent) => {
    const pos = gridAt(e)
    stop()
    if (pos) addComponent(type, pos)
  }

  setPlacing({ type, pos: null })
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}

/** A plain click, or Enter on the keyboard, drops the part mid-canvas. */
function placeAtCenter(type: string): void {
  const center = canvasRuntime.current?.gridCenter() ?? { x: 0, y: 0 }
  useEditor.getState().addComponent(type, center)
}

export function Palette() {
  const radix = useEditor((state) => state.settings.radix)
  const presetId = useEditor((state) => state.settings.preset)
  const sandbox = useEditor((state) => state.settings.sandbox)

  const preset = findPreset(presetId)
  const sections = [
    {
      title: sandbox ? 'All gates' : (preset?.name ?? 'Gates'),
      types: sandbox ? sandboxGates(radix) : (preset?.gates ?? []),
    },
    { title: 'Inputs and outputs', types: IO_PARTS },
  ]

  return (
    <nav className="palette" aria-label="Parts">
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <div className="palette-grid">
            {section.types.map((type) => (
              <button
                key={type}
                type="button"
                className="part"
                title={`${partName(type)}: ${partHint(type, radix)}. Drag onto the canvas, or click.`}
                onPointerDown={(event) => beginPlacing(type, event)}
                onClick={() => placeAtCenter(type)}
              >
                <SymbolIcon type={type} />
                {partName(type)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}
