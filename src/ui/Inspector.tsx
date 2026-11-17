import { useEffect, useId, useRef, useState } from 'react'
import { builtinComponents } from '../core/index.ts'
import {
  MAX_DELAY,
  MAX_LABEL,
  SUB_TYPE,
  breakpointOn,
  describeNode,
  isSwitchKey,
  keyName,
  setBreakpoint,
  takesKey,
  useEditor,
  useSim,
  valueText,
} from '../editor/index.ts'
import type { BreakWhen, ProjectSettings, Terminal } from '../editor/index.ts'
import { CloseIcon, ZoomInIcon, ZoomOutIcon } from './icons.tsx'
import { partName } from './parts.ts'
import { pinName } from './probeText.ts'

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
  {
    param: 'ticks',
    label: 'Ticks per value',
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'bits',
    label: 'Bits',
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

interface KeyFieldProps {
  id: string
  code: string | undefined
}

/**
 * The keyboard key that works a switch or a push button. Pressing the field
 * and then a key sets it.
 */
function KeyField({ id, code }: KeyFieldProps) {
  const [listening, setListening] = useState(false)
  const [refused, setRefused] = useState(false)
  const { setKey } = useEditor.getState()

  return (
    <>
      <div className="field">
        <span className="field-label">Key</span>
        <button
          type="button"
          className="button key-button"
          aria-label={
            listening
              ? 'Press a letter or a digit'
              : code
                ? `Key ${keyName(code)}. Press to change it`
                : 'No key. Press to choose one'
          }
          onClick={() => {
            setListening(!listening)
            setRefused(false)
          }}
          onBlur={() => setListening(false)}
          onKeyDown={(event) => {
            if (!listening) return
            // The key is for this field, not a shortcut of the canvas.
            event.stopPropagation()
            if (event.code === 'Tab') return
            event.preventDefault()
            if (event.code === 'Escape') {
              setListening(false)
            } else if (isSwitchKey(event.code)) {
              setKey(id, event.code)
              setListening(false)
              setRefused(false)
            } else if (!/^(Shift|Control|Alt|Meta)/.test(event.code)) {
              setRefused(true)
            }
          }}
        >
          {listening ? 'Press a key' : code ? keyName(code) : 'Choose'}
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Remove the key"
          title="Remove the key"
          disabled={!code}
          onClick={() => setKey(id, null)}
        >
          <CloseIcon />
        </button>
      </div>
      {refused && <p className="note">Use a letter or a digit. R is taken: it rotates.</p>}
    </>
  )
}

function breakValue(when: BreakWhen | undefined): string {
  return when === undefined ? 'never' : String(when)
}

/**
 * What the selected wire carries and what drives it, and the breakpoint
 * that pauses the run when the wire does something.
 */
function WirePanel({ terminal }: { terminal: Terminal }) {
  const settings = useEditor((state) => state.settings)
  // The reading follows the simulator, and the choice follows the breakpoints.
  useSim((state) => state.revision)
  useSim((state) => state.breakpoints)
  const fieldId = useId()
  const info = describeNode(terminal)
  const when = breakpointOn(terminal)
  const values = Array.from({ length: settings.radix }, (_, digit) => digit)

  return (
    <aside className="inspector" aria-label="Wire">
      <h2>Wire</h2>
      <p className="wire-reading">
        <span className="wire-value">{valueText(info.value, settings)}</span>
        <span>{info.conflict ? `${info.name}, in conflict` : info.name}</span>
      </p>
      {info.drivers.length === 0 ? (
        <p className="note">Nothing drives it, so it floats.</p>
      ) : (
        <ul className="probe-pins">
          {info.drivers.map((pin) => (
            <li key={`${pin.part}:${pin.port}`}>
              <span>{pinName(pin)}</span>
              <span className="probe-pin-value">{valueText(pin.value, settings)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <label htmlFor={fieldId}>Pause when it</label>
        <select
          id={fieldId}
          value={breakValue(when)}
          onChange={(event) => {
            const choice = event.target.value
            setBreakpoint(
              terminal,
              choice === 'never'
                ? null
                : choice === 'change' || choice === 'conflict'
                  ? choice
                  : Number(choice),
            )
          }}
        >
          <option value="never">Never</option>
          <option value="change">Changes</option>
          <option value="conflict">Is in conflict</option>
          {values.map((digit) => (
            <option key={digit} value={digit}>
              Becomes {valueText(digit, settings)}
            </option>
          ))}
        </select>
      </div>
    </aside>
  )
}

/**
 * The settings of the one selected thing: a gate's number of inputs and its
 * delay, the value a constant gives, the name and the key of a switch, the
 * breakpoint of a wire. Hidden when there is nothing to set.
 */
export function Inspector() {
  const selected = useEditor((state) => {
    if (state.selection.size !== 1) return null
    const [id] = state.selection
    return id
  })
  const doc = useEditor((state) => state.doc)
  const settings = useEditor((state) => state.settings)
  const active = useEditor((state) => state.active)
  if (selected === null) return null

  const wire = doc.wires[selected]
  if (wire) return <WirePanel key={selected} terminal={wire.from} />
  if (doc.junctions[selected]) {
    return <WirePanel key={selected} terminal={{ kind: 'junction', junction: selected }} />
  }
  const component = doc.components[selected]
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

  const def = builtinComponents.get(component.type)
  const specs = def.params
  const fields = FIELDS.filter((field) => field.param in specs)
  const named = NAMED.includes(component.type)
  const keyed = takesKey(component.type)
  // Only a part that turns inputs into outputs has a delay worth setting.
  const ports = def.ports(component.params)
  const timed =
    ports.some((port) => port.direction === 'in') && ports.some((port) => port.direction === 'out')
  if (fields.length === 0 && !named && !keyed && !timed) return null
  const { setParams, setDelay } = useEditor.getState()

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
      {keyed && (
        <KeyField key={`${active}:${component.id}`} id={component.id} code={component.key} />
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
      {timed && (
        <div className="stepper" role="group" aria-label="Delay">
          <span className="stepper-label" title="How many ticks the part takes to answer">
            Delay
          </span>
          <button
            type="button"
            className="tool"
            aria-label="Delay: lower"
            disabled={component.delay <= 1}
            onClick={() => setDelay(component.id, component.delay - 1)}
          >
            <ZoomOutIcon />
          </button>
          <output className="stepper-value" aria-live="polite">
            {component.delay}
          </output>
          <button
            type="button"
            className="tool"
            aria-label="Delay: higher"
            disabled={component.delay >= MAX_DELAY}
            onClick={() => setDelay(component.id, component.delay + 1)}
          >
            <ZoomInIcon />
          </button>
        </div>
      )}
    </aside>
  )
}
