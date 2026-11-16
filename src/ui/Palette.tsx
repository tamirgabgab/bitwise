import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { canvasRuntime, readCanvasTheme, renderSymbolIcon, useEditor } from '../editor/index.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

interface PaletteItem {
  readonly type: string
  readonly name: string
}

const SECTIONS: readonly { readonly title: string; readonly items: readonly PaletteItem[] }[] = [
  {
    title: 'Gates',
    items: [
      { type: 'and', name: 'AND' },
      { type: 'or', name: 'OR' },
      { type: 'not', name: 'NOT' },
      { type: 'nand', name: 'NAND' },
      { type: 'nor', name: 'NOR' },
      { type: 'xor', name: 'XOR' },
      { type: 'xnor', name: 'XNOR' },
      { type: 'buffer', name: 'Buffer' },
    ],
  },
  {
    title: 'Sources',
    items: [{ type: 'input', name: 'Input' }],
  },
]

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
  return (
    <nav className="palette" aria-label="Parts">
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <div className="palette-grid">
            {section.items.map((item) => (
              <button
                key={item.type}
                type="button"
                className="part"
                title={`Add ${item.name}: drag onto the canvas, or click`}
                onPointerDown={(event) => beginPlacing(item.type, event)}
                onClick={() => placeAtCenter(item.type)}
              >
                <SymbolIcon type={item.type} />
                {item.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}
