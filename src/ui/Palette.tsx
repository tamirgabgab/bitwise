import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { findPreset, sandboxGates } from '../core/index.ts'
import {
  SUB_TYPE,
  canPlace,
  canvasRuntime,
  interfaceOf,
  readCanvasTheme,
  renderSymbolIcon,
  useEditor,
} from '../editor/index.ts'
import { GateTable } from './GateTable.tsx'
import { ChipIcon } from './icons.tsx'
import { hasGateTable, partHint, partName } from './parts.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

const IO_PARTS: readonly string[] = ['input', 'button', 'output', 'display']
const SEQUENTIAL_PARTS: readonly string[] = ['clock', 'cycle', 'sr', 'dff', 'tff', 'jkff']
const BIT_PARTS: readonly string[] = ['tobits', 'frombits']
const BUS_PARTS: readonly string[] = ['split', 'merge']
const NOTE_PARTS: readonly string[] = ['text']

/** The gate whose table is on show, and where its button is. */
interface TableTip {
  readonly type: string
  readonly top: number
  readonly right: number
}

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
 * For a named circuit, `type` is `SUB_TYPE` and `circuit` says which one.
 */
function beginPlacing(type: string, event: ReactPointerEvent, circuit?: string): void {
  if (event.button !== 0) return
  const { setPlacing, addComponent } = useEditor.getState()
  const gridAt = (e: PointerEvent) =>
    canvasRuntime.current?.clientToGrid(e.clientX, e.clientY) ?? null

  const move = (e: PointerEvent) => setPlacing({ type, circuit, pos: gridAt(e) })
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    setPlacing(null)
  }
  const up = (e: PointerEvent) => {
    const pos = gridAt(e)
    stop()
    if (pos) addComponent(type, pos, circuit)
  }

  setPlacing({ type, circuit, pos: null })
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}

/** A plain click, or Enter on the keyboard, drops the part mid-canvas. */
function placeAtCenter(type: string, circuit?: string): void {
  const center = canvasRuntime.current?.gridCenter() ?? { x: 0, y: 0 }
  useEditor.getState().addComponent(type, center, circuit)
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`
}

/** The other circuits of the project, each ready to be used as a part. */
function CircuitParts() {
  const circuits = useEditor((state) => state.circuits)
  const order = useEditor((state) => state.order)
  const active = useEditor((state) => state.active)
  const others = order.filter((id) => id !== active)

  return (
    <section>
      <h2>Circuits</h2>
      {others.length === 0 ? (
        <p className="palette-note">
          Add a circuit with + above the canvas. It shows up here as a part you can use.
        </p>
      ) : (
        <div className="palette-list">
          {others.map((id) => {
            const circuit = circuits[id]
            const pins = interfaceOf(circuit.doc)
            const allowed = canPlace(circuits, active, id)
            const shape = `${count(pins.inputs.length, 'input')}, ${count(pins.outputs.length, 'output')}`
            return (
              <button
                key={id}
                type="button"
                className={allowed ? 'part part-circuit' : 'part part-circuit part-off'}
                // Not `disabled`, so the reason can still be read and focused.
                aria-disabled={!allowed}
                title={
                  allowed
                    ? `${circuit.name}: ${shape}. Drag onto the canvas, or click.`
                    : `${circuit.name} has ${circuits[active].name} inside it, so it cannot go in here.`
                }
                onPointerDown={(event) => {
                  if (allowed) beginPlacing(SUB_TYPE, event, id)
                }}
                onClick={() => {
                  if (allowed) placeAtCenter(SUB_TYPE, id)
                }}
              >
                <ChipIcon />
                <span className="part-circuit-name">{circuit.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
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
    { title: 'Sequential', types: SEQUENTIAL_PARTS },
    { title: 'Digits and bits', types: BIT_PARTS },
    { title: 'Buses', types: BUS_PARTS },
    { title: 'Notes', types: NOTE_PARTS },
  ]
  const [tip, setTip] = useState<TableTip | null>(null)
  const showTable = (type: string, button: HTMLElement): void => {
    if (!hasGateTable(type)) return
    const rect = button.getBoundingClientRect()
    setTip({ type, top: rect.top, right: rect.right })
  }
  const hideTable = (): void => setTip(null)

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
                onPointerDown={(event) => {
                  hideTable()
                  beginPlacing(type, event)
                }}
                onClick={() => placeAtCenter(type)}
                onPointerEnter={(event) => showTable(type, event.currentTarget)}
                onPointerLeave={hideTable}
                onFocus={(event) => showTable(type, event.currentTarget)}
                onBlur={hideTable}
              >
                <SymbolIcon type={type} />
                {partName(type)}
              </button>
            ))}
          </div>
        </section>
      ))}
      <CircuitParts />
      {tip && <GateTable type={tip.type} anchor={tip} />}
    </nav>
  )
}
