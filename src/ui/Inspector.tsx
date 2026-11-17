import { useEffect, useId, useRef, useState } from 'react'
import { builtinComponents } from '../core/index.ts'
import { MAX_LABEL, SUB_TYPE, useEditor, valueText } from '../editor/index.ts'
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
  {
    param: 'digits',
    label: 'Digits',
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'half',
    label: 'Ticks per half',
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
]

/** The parts whose name becomes a pin when the circuit is used as a part. */
const NAMED: readonly string[] = ['input', 'output']

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`
}

interface NameFieldProps {
  id: string
  type: string
  label: string
}

/**
 * The name of a switch or an output. It is typed freely and becomes an edit,
 * one step of undo, when the user is done with the field.
 */
function NameField({ id, type, label }: NameFieldProps) {
  const [draft, setDraft] = useState(label)
  const latest = useRef(label)
  const fieldId = useId()

  const commit = (text: string): void => {
    latest.current = text
    useEditor.getState().setLabel(id, text)
  }

  // The canvas can take the selection away without the field losing focus
  // first. What was typed is kept, unless the part is no longer the same one.
  useEffect(() => {
    const { active, epoch } = useEditor.getState()
    return () => {
      const state = useEditor.getState()
      if (state.active !== active || state.epoch !== epoch) return
      if (state.doc.components[id]?.type === type) state.setLabel(id, latest.current)
    }
  }, [id, type])

  return (
    <div className="field">
      <label htmlFor={fieldId}>Name</label>
      <input
        id={fieldId}
        value={draft}
        maxLength={MAX_LABEL}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value)
          latest.current = event.target.value
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.code === 'Enter' || event.code === 'NumpadEnter') {
            commit(draft)
          } else if (event.code === 'Escape') {
            setDraft(label)
            latest.current = label
          }
        }}
      />
    </div>
  )
}

/**
 * The settings of the one selected part: a gate's number of inputs, the
 * value a constant gives, the name of a switch. Hidden when there is nothing
 * to set.
 */
export function Inspector() {
  const component = useEditor((state) => {
    if (state.selection.size !== 1) return null
    const [id] = state.selection
    return state.doc.components[id] ?? null
  })
  const settings = useEditor((state) => state.settings)
  const active = useEditor((state) => state.active)
  if (!component) return null

  if (component.type === SUB_TYPE) {
    const sub = component.sub
    if (!sub) return null
    return (
      <aside className="inspector" aria-label={`${sub.name} circuit`}>
        <h2>{sub.name}</h2>
        <p className="note">
          {count(sub.inputs.length, 'input')}, {count(sub.outputs.length, 'output')}
        </p>
        <button
          type="button"
          className="button"
          title="Open this circuit. Double-clicking the part does the same"
          onClick={() => useEditor.getState().selectCircuit(sub.circuit)}
        >
          Open circuit
        </button>
      </aside>
    )
  }

  const specs = builtinComponents.get(component.type).params
  const fields = FIELDS.filter((field) => field.param in specs)
  const named = NAMED.includes(component.type)
  if (fields.length === 0 && !named) return null
  const { setParams } = useEditor.getState()

  return (
    <aside className="inspector" aria-label={`${partName(component.type)} settings`}>
      <h2>{partName(component.type)}</h2>
      {named && (
        <>
          <NameField
            // A new field for another part, and after undo changed the name.
            key={`${active}:${component.id}:${component.label ?? ''}`}
            id={component.id}
            type={component.type}
            label={component.label ?? ''}
          />
          <p className="note">Shown on the pin when this circuit is used as a part.</p>
        </>
      )}
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
