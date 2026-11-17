import { useEffect, useId, useRef, useState } from 'react'
import { builtinComponents } from '../core/index.ts'
import {
  MAX_DELAY,
  MAX_LABEL,
  MAX_TEXT,
  SUB_TYPE,
  TEXT_TYPE,
  breakpointOn,
  describeNode,
  extractable,
  isSwitchKey,
  keyName,
  readPart,
  setBreakpoint,
  setSwitch,
  signalText,
  switchValue,
  takesKey,
  useEditor,
  useSim,
  valueText,
} from '../editor/index.ts'
import type { AlignEdge, BreakWhen, ProjectSettings, Terminal } from '../editor/index.ts'
import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  CloseIcon,
  SpreadXIcon,
  SpreadYIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.tsx'
import { partHint, partName } from './parts.ts'
import { pinName, portLabel } from './probeText.ts'

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
  {
    param: 'outputs',
    label: 'Outputs',
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'select',
    label: 'Select digits',
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
  {
    param: 'width',
    label: 'Width',
    range: (_radix, limits) => [limits.min, Math.min(limits.max, MAX_BUS)],
    show: (value) => (value === 1 ? '1 digit' : `${value} digits`),
  },
  {
    param: 'each',
    label: 'Digits per branch',
    range: (_radix, limits) => [limits.min, Math.min(limits.max, MAX_BUS)],
    show: String,
  },
]

/** The widest bus the inspector makes. Wider ones are hard to read on screen. */
const MAX_BUS = 32

/** The parts whose name becomes a pin when the circuit is used as a part. */
const NAMED: readonly string[] = ['input', 'output']

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`
}

interface NameFieldProps {
  id: string
  type: string
  label: string
  /** The field holds the writing of a text label, not the name of a part. */
  writing?: boolean
}

/**
 * The name of a switch or an output, or the writing of a text label. It is
 * typed freely and becomes an edit, one step of undo, when the user is done
 * with the field.
 */
function NameField({ id, type, label, writing = false }: NameFieldProps) {
  const [draft, setDraft] = useState(label)
  const latest = useRef(label)
  const fieldId = useId()

  const save = (text: string): void => {
    const state = useEditor.getState()
    if (writing) state.setText(id, text)
    else state.setLabel(id, text)
  }
  const commit = (text: string): void => {
    latest.current = text
    save(text)
  }

  // The canvas can take the selection away without the field losing focus
  // first. What was typed is kept, unless the part is no longer the same one.
  useEffect(() => {
    const { active, epoch } = useEditor.getState()
    return () => {
      const state = useEditor.getState()
      if (state.active !== active || state.epoch !== epoch) return
      if (state.doc.components[id]?.type !== type) return
      if (writing) state.setText(id, latest.current)
      else state.setLabel(id, latest.current)
    }
  }, [id, type, writing])

  return (
    <div className="field">
      <label htmlFor={fieldId}>{writing ? 'Text' : 'Name'}</label>
      <input
        id={fieldId}
        value={draft}
        maxLength={writing ? MAX_TEXT : MAX_LABEL}
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

/**
 * The value of a switch on a bus, typed as digits. Clicking the switch only
 * goes one number up or down, which is a long way on a wide bus.
 */
function BusValueField({ id, width }: { id: string; width: number }) {
  // The simulator moving is what changes the value.
  useSim((state) => state.revision)
  useSim((state) => state.pokes)
  const shown = String(switchValue(id) ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const fieldId = useId()

  const commit = (): void => {
    if (draft === null) return
    const text = draft.trim().toUpperCase()
    setRefused(text !== '' && !setSwitch(id, text))
    setDraft(null)
  }

  return (
    <>
      <div className="field">
        <label htmlFor={fieldId}>Value</label>
        <input
          id={fieldId}
          value={draft ?? shown}
          maxLength={width}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value)
            setRefused(false)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.code === 'Enter' || event.code === 'NumpadEnter') commit()
            else if (event.code === 'Escape') setDraft(null)
          }}
        />
      </div>
      {refused && <p className="note">Use up to {width} digits of this radix.</p>}
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
  // A bus has too many values to list: it can only wait for a change.
  const values =
    info.signal.length > 1 ? [] : Array.from({ length: settings.radix }, (_, digit) => digit)

  return (
    <aside className="inspector" aria-label="Wire">
      <h2>Wire</h2>
      <p className="wire-reading">
        <span className="wire-value">{signalText(info.signal, settings)}</span>
        <span>{info.conflict ? `${info.name}, in conflict` : info.name}</span>
      </p>
      {info.signal.length > 1 && <p className="note">A bus of {info.signal.length} digits.</p>}
      {info.mixed && (
        <p className="note">
          Pins of different widths are wired together here. Make the widths the same, or use a
          splitter or a merger.
        </p>
      )}
      {info.drivers.length === 0 ? (
        <p className="note">Nothing drives it, so it floats.</p>
      ) : (
        <ul className="probe-pins">
          {info.drivers.map((pin) => (
            <li key={`${pin.part}:${pin.port}`}>
              <span>{pinName(pin)}</span>
              <span className="probe-pin-value">{signalText(pin.signal, settings)}</span>
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
 * What a part carries right now: the value a memory part keeps, then every
 * pin, inputs first. It follows the simulation as it runs.
 */
function PartValues({ id }: { id: string }) {
  const settings = useEditor((state) => state.settings)
  useSim((state) => state.revision)
  const reading = readPart(id)
  if (!reading || reading.pins.length === 0) return null
  const pins = [
    ...reading.pins.filter((pin) => pin.direction === 'in'),
    ...reading.pins.filter((pin) => pin.direction === 'out'),
  ]
  return (
    <section className="part-values" aria-label="Values now">
      {reading.stored && (
        <p className="wire-reading">
          <span className="wire-value">{signalText(reading.stored, settings)}</span>
          <span>kept inside</span>
        </p>
      )}
      <ul className="probe-pins">
        {pins.map((pin) => (
          <li key={pin.port}>
            <span>
              {pin.direction === 'in' ? '\u2192 ' : '\u2190 '}
              {portLabel(pin.port)}
            </span>
            <span className="probe-pin-value">{signalText(pin.signal, settings)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const ALIGNMENTS: readonly {
  readonly edge: AlignEdge
  readonly label: string
  readonly icon: () => React.JSX.Element
}[] = [
  { edge: 'left', label: 'Line up the left edges', icon: AlignLeftIcon },
  { edge: 'centerX', label: 'Line up the middles, left to right', icon: AlignCenterXIcon },
  { edge: 'right', label: 'Line up the right edges', icon: AlignRightIcon },
  { edge: 'top', label: 'Line up the top edges', icon: AlignTopIcon },
  { edge: 'centerY', label: 'Line up the middles, top to bottom', icon: AlignCenterYIcon },
  { edge: 'bottom', label: 'Line up the bottom edges', icon: AlignBottomIcon },
]

/** What can be done with several selected parts at once. */
function ArrangePanel() {
  const doc = useEditor((state) => state.doc)
  const selection = useEditor((state) => state.selection)
  let parts = 0
  for (const id of selection) {
    if (id in doc.components) parts++
  }
  const movable = extractable(doc, selection).length
  if (parts === 0) return null
  const { alignSelection, distributeSelection, selectionToCircuit } = useEditor.getState()

  return (
    <aside className="inspector" aria-label="Selected parts">
      <h2>{count(parts, 'part')}</h2>
      <div className="arrange" role="group" aria-label="Line up">
        {ALIGNMENTS.map(({ edge, label, icon: AlignIcon }) => (
          <button
            key={edge}
            type="button"
            className="tool"
            aria-label={label}
            title={label}
            disabled={parts < 2}
            onClick={() => alignSelection(edge)}
          >
            <AlignIcon />
          </button>
        ))}
      </div>
      <div className="arrange" role="group" aria-label="Space evenly">
        <button
          type="button"
          className="tool"
          aria-label="Space evenly, left to right"
          title="Space evenly, left to right. Needs three parts"
          disabled={parts < 3}
          onClick={() => distributeSelection('x')}
        >
          <SpreadXIcon />
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Space evenly, top to bottom"
          title="Space evenly, top to bottom. Needs three parts"
          disabled={parts < 3}
          onClick={() => distributeSelection('y')}
        >
          <SpreadYIcon />
        </button>
      </div>
      <button
        type="button"
        className="button"
        title="Move these parts into a circuit of their own and put one part in their place (Ctrl+G). Switches and outputs stay here"
        disabled={movable === 0}
        onClick={() => selectionToCircuit()}
      >
        Make a circuit
      </button>
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
  const several = useEditor((state) => state.selection.size > 1)
  const doc = useEditor((state) => state.doc)
  const settings = useEditor((state) => state.settings)
  const active = useEditor((state) => state.active)
  if (several) return <ArrangePanel />
  if (selected === null) return null

  const wire = doc.wires[selected]
  if (wire) return <WirePanel key={selected} terminal={wire.from} />
  if (doc.junctions[selected]) {
    return <WirePanel key={selected} terminal={{ kind: 'junction', junction: selected }} />
  }
  const component = doc.components[selected]
  if (!component) return null

  if (component.type === TEXT_TYPE) {
    const text = component.text ?? ''
    return (
      <aside className="inspector" aria-label="Text settings">
        <h2>Text</h2>
        <NameField
          key={`${active}:${component.id}:${text}`}
          id={component.id}
          type={component.type}
          label={text}
          writing
        />
        <p className="note">Writing on the canvas. It is not part of the circuit.</p>
      </aside>
    )
  }

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
  const { setParams, setDelay } = useEditor.getState()

  return (
    <aside className="inspector" aria-label={`${partName(component.type)} settings`}>
      <h2>{partName(component.type)}</h2>
      <p className="note part-hint">{partHint(component.type, settings.radix)}</p>
      <NameField
        // A new field for another part, and after undo changed the name.
        key={`${active}:${component.id}:${component.label ?? ''}`}
        id={component.id}
        type={component.type}
        label={component.label ?? ''}
      />
      {named && <p className="note">Shown on the pin when this circuit is used as a part.</p>}
      {keyed && (
        <KeyField key={`${active}:${component.id}`} id={component.id} code={component.key} />
      )}
      {component.type === 'input' && component.params.width > 1 && (
        <BusValueField
          key={`${active}:${component.id}:value`}
          id={component.id}
          width={component.params.width}
        />
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
      <PartValues id={component.id} />
    </aside>
  )
}
