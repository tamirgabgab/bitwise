import { builtinComponents } from '../core/index.ts'
import { useEditor, valueText } from '../editor/index.ts'
import type { ProjectSettings } from '../editor/index.ts'
import { ZoomInIcon, ZoomOutIcon } from './icons.tsx'
import { partName } from './parts.ts'

interface Field {
  /** The parameter this field changes. */
  readonly param: string
  readonly label: string
  /** The lowest and highest value at the current radix. */
  range(radix: number, limits: { min: number; max: number }): [number, number]
  /** How the current value is written. */
  show(value: number, settings: ProjectSettings): string
}

const asValue = (value: number, settings: ProjectSettings): string => valueText(value, settings)
const digitRange = (radix: number): [number, number] => [0, radix - 1]

/** The parameters the inspector lets the user change, by parameter name. */
const FIELDS: readonly Field[] = [
  {
    param: 'inputs',
    label: 'Inputs',
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  { param: 'value', label: 'Value', range: digitRange, show: asValue },
  { param: 'match', label: 'Matches', range: digitRange, show: asValue },
  {
    param: 'by',
    label: 'Adds',
    range: (radix) => [1, Math.max(1, radix - 1)],
    show: String,
  },
]

/**
 * The settings of the one selected part, such as a gate's number of inputs
 * or the value a constant gives. Hidden when there is nothing to set.
 */
export function Inspector() {
  const component = useEditor((state) => {
    if (state.selection.size !== 1) return null
    const [id] = state.selection
    return state.doc.components[id] ?? null
  })
  const settings = useEditor((state) => state.settings)
  if (!component) return null

  const specs = builtinComponents.get(component.type).params
  const fields = FIELDS.filter((field) => field.param in specs)
  if (fields.length === 0) return null
  const { setParams } = useEditor.getState()

  return (
    <aside className="inspector" aria-label={`${partName(component.type)} settings`}>
      <h2>{partName(component.type)}</h2>
      {fields.map((field) => {
        const [min, max] = field.range(settings.radix, specs[field.param])
        const value = component.params[field.param]
        // A value left over from a larger radix can sit above the range.
        const set = (next: number): void =>
          setParams(component.id, { [field.param]: Math.min(max, Math.max(min, next)) })
        return (
          <div key={field.param} className="stepper" role="group" aria-label={field.label}>
            <span className="stepper-label">{field.label}</span>
            <button
              type="button"
              className="tool"
              aria-label={`${field.label}: lower`}
              disabled={value <= min}
              onClick={() => set(value - 1)}
            >
              <ZoomOutIcon />
            </button>
            <output className="stepper-value" aria-live="polite">
              {field.show(value, settings)}
            </output>
            <button
              type="button"
              className="tool"
              aria-label={`${field.label}: higher`}
              disabled={value >= max}
              onClick={() => set(value + 1)}
            >
              <ZoomInIcon />
            </button>
          </div>
        )
      })}
    </aside>
  )
}
