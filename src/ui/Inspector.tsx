import { useEffect, useId, useRef, useState } from 'react'
import { builtinComponents, formatSignal } from '../core/index.ts'
import {
  MAX_DELAY,
  MAX_LABEL,
  MAX_TEXT,
  SUB_TYPE,
  FRAME_TYPE,
  NET_TYPE,
  TEXT_TYPE,
  breakpointOn,
  busFormatName,
  busFormatsFor,
  describeNode,
  formatAt,
  extractable,
  isSwitchKey,
  isMetered,
  isWatched,
  keyName,
  readBusValue,
  readPart,
  setBreakpoint,
  setSwitch,
  signalText,
  switchValue,
  takesKey,
  toggleMeter,
  toggleWatch,
  useEditor,
  useSim,
  valueText,
} from '../editor/index.ts'
import type { AlignEdge, BreakWhen, BusFormat, Machine, ProjectSettings, Terminal } from '../editor/index.ts'
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
import { msg, t } from '../i18n/index.ts'
import { inputCount, outputCount, partHint, partName } from './parts.ts'
import { readWholeNumber } from './wholeNumber.ts'
import { pinName, portLabel } from './probeText.ts'
import { TableEditor } from './TableEditor.tsx'
import { MemoryEditor } from './MemoryEditor.tsx'
import { MachineSummary } from './MachineSummary.tsx'
import { TruthTablePanel } from './TruthTablePanel.tsx'
import { InspectorSheet } from './InspectorSheet.tsx'
import { useSheet } from './sheet.ts'

interface Field {
  /** The parameter this field changes. */
  readonly param: string
  /** In English; shown through `t`. */
  readonly label: string
  /** The lowest and highest value at the current radix. */
  range(radix: number, limits: { min: number; max: number }): [number, number]
  /** How the current value is written. */
  show(value: number, settings: ProjectSettings): string
  /**
   * The value can be typed as a decimal number. Not for a digit of the
   * radix, which is written in the radix's own way (A, +1, ...).
   */
  readonly typed?: false
}

const asValue = (value: number, settings: ProjectSettings): string => valueText(value, settings)
const digitRange = (radix: number): [number, number] => [0, radix - 1]

/** The parameters the inspector lets the user change, by parameter name. */
const FIELDS: readonly Field[] = [
  {
    param: 'inputs',
    label: msg('Inputs'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'outputs',
    label: msg('Outputs'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'select',
    label: msg('Select digits'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  { param: 'value', label: msg('Value'), range: digitRange, show: asValue, typed: false },
  { param: 'match', label: msg('Matches'), range: digitRange, show: asValue, typed: false },
  {
    param: 'by',
    label: msg('Adds'),
    range: (radix) => [1, Math.max(1, radix - 1)],
    show: String,
  },
  {
    param: 'digits',
    label: msg('Digits'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'half',
    label: msg('Ticks per half'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'ticks',
    label: msg('Ticks per value'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'bits',
    label: msg('Bits'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'address',
    label: msg('Address digits'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'width',
    label: msg('Width (digits)'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
  {
    param: 'each',
    label: msg('Digits per branch'),
    range: (_radix, limits) => [limits.min, limits.max],
    show: String,
  },
]

/** What the select digits steer, where it is not a choice among ways. */
const SELECT_LABELS: Readonly<Record<string, string>> = {
  alu: msg('Operation digits'),
  shifter: msg('Amount digits'),
}

/** Parameters that pick one of a few ways of working, by parameter name. */
const CHOICES: readonly { param: string; label: string; options: readonly string[] }[] = [
  { param: 'left', label: msg('Direction'), options: [msg('Down (right)'), msg('Up (left)')] },
  { param: 'rotate', label: msg('Brings in'), options: [msg('Zeros'), msg('The digits pushed out')] },
]

/** A parameter that picks one of a few ways, by its number. */
function ChoiceField(props: {
  label: string
  options: readonly string[]
  value: number
  onSet(next: number): void
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{t(props.label)}</label>
      <select id={id} value={props.value} onChange={(event) => props.onSet(Number(event.target.value))}>
        {props.options.map((option, index) => (
          <option key={option} value={index}>
            {t(option)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The parts whose name becomes a pin when the circuit is used as a part. */
const NAMED: readonly string[] = ['input', 'output']

interface StepperProps {
  label: string
  /** Shown when the label is hovered. */
  title?: string
  value: number
  min: number
  max: number
  /** Gets a value already inside the range. */
  onSet(next: number): void
  /** The value written in the radix's own way; such a value is not typed. */
  shown?: string
}

/**
 * A number with a button on each side. Unless it is a digit of the radix,
 * the number itself is a field: a value typed there takes effect on Enter or
 * when the field is left, and one outside the range is refused with a note
 * that names the range.
 */
export function Stepper({ label, title, value, min, max, onSet, shown }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const set = (next: number): void => {
    setDraft(null)
    setError(null)
    // A value left over from a larger radix can sit above the range.
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped !== value) onSet(clamped)
  }
  /** Takes what was typed. Returns whether it was taken. */
  const commit = (): boolean => {
    if (draft === null) return true
    const read = readWholeNumber(draft, min, max)
    if (!read.ok) {
      setError(read.message)
      return false
    }
    set(read.value)
    return true
  }
  const cancel = (): void => {
    setDraft(null)
    setError(null)
  }

  return (
    <>
      <div className="stepper" role="group" aria-label={label}>
        <span className="stepper-label" title={title}>
          {label}
        </span>
        <button
          type="button"
          className="tool"
          aria-label={t('{label}: lower', { label })}
          title={t('{label}: lower', { label })}
          disabled={value <= min}
          onClick={() => set(value - 1)}
        >
          <ZoomOutIcon />
        </button>
        {shown === undefined ? (
          <input
            className="stepper-value stepper-input"
            aria-label={label}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? noteId : undefined}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={draft ?? String(value)}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              const text = event.target.value
              setDraft(text)
              // Once the note is up, it goes the moment the value is right.
              if (error !== null && readWholeNumber(text, min, max).ok) setError(null)
            }}
            onBlur={() => {
              // A refused value is not kept in the field; the note stays to say why.
              if (!commit()) setDraft(null)
            }}
            onKeyDown={(event) => {
              if (event.code === 'Enter' || event.code === 'NumpadEnter') {
                event.preventDefault()
                commit()
              } else if (event.code === 'Escape') {
                cancel()
              } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
                event.preventDefault()
                set(value + (event.code === 'ArrowUp' ? 1 : -1))
              }
            }}
          />
        ) : (
          <output className="stepper-value" aria-live="polite">
            {shown}
          </output>
        )}
        <button
          type="button"
          className="tool"
          aria-label={t('{label}: higher', { label })}
          title={t('{label}: higher', { label })}
          disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          <ZoomInIcon />
        </button>
      </div>
      {error !== null && (
        <p className="note stepper-error" id={noteId} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

interface NameFieldProps {
  id: string
  type: string
  label: string
  /** The field holds the writing of a text label or a frame's title, not the name of a part. */
  writing?: boolean
  /** What the field is called, when not "Text" or "Name". */
  caption?: string
}

/**
 * The name of a switch or an output, or the writing of a text label. It is
 * typed freely and becomes an edit, one step of undo, when the user is done
 * with the field.
 */
function NameField({ id, type, label, writing = false, caption }: NameFieldProps) {
  const [draft, setDraft] = useState(label)
  const latest = useRef(label)
  const fieldId = useId()

  const save = (text: string): void => {
    const state = useEditor.getState()
    if (writing) state.setText(id, text)
    else state.setLabel(id, text)
  }
  const commit = (text: string): void => {
    // A net label keeps its name: a blank one is refused, so show the old one.
    if (type === NET_TYPE && text.trim() === '') {
      setDraft(label)
      latest.current = label
      return
    }
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
      <label htmlFor={fieldId}>{caption ?? (writing ? t('Text') : t('Name'))}</label>
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
        <span className="field-label">{t('Key')}</span>
        <button
          type="button"
          className="button key-button"
          aria-label={
            listening
              ? t('Press a letter or a digit')
              : code
                ? t('Key {key}. Press to change it', { key: keyName(code) })
                : t('No key. Press to choose one')
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
          {listening ? t('Press a key') : code ? keyName(code) : t('Choose')}
        </button>
        <button
          type="button"
          className="tool"
          aria-label={t('Remove the key')}
          title={t('Remove the key')}
          disabled={!code}
          onClick={() => setKey(id, null)}
        >
          <CloseIcon />
        </button>
      </div>
      {refused && <p className="note">{t('Use a letter or a digit. R is taken: it rotates.')}</p>}
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
        <label htmlFor={fieldId}>{t('Value')}</label>
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
      {refused && <p className="note">{t('Use up to {width} digits of this radix.', { width })}</p>}
    </>
  )
}

function breakValue(when: BreakWhen | undefined): string {
  if (when === undefined) return 'never'
  return typeof when === 'object' ? 'value' : String(when)
}

/**
 * When the run pauses for the wire at `terminal`. A plain wire offers each
 * of its values; a bus `width` digits wide takes one typed in its `format`.
 */
export function BreakField({ terminal, width, format }: { terminal: Terminal; width: number; format: BusFormat }) {
  const settings = useEditor((state) => state.settings)
  const fieldId = useId()
  const valueId = useId()
  const problemId = useId()
  const when = breakpointOn(terminal)
  /** "Becomes a value" is chosen, and no value is set yet. */
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const bus = width > 1
  const values = bus ? [] : Array.from({ length: settings.radix }, (_, digit) => digit)
  const choice = when === undefined && asking ? 'value' : breakValue(when)
  const written = draft ?? (typeof when === 'object' ? when.shown : '')

  const commit = () => {
    if (written.trim() === '') return setProblem(null)
    const read = readBusValue(written, settings.radix, width, format)
    if ('problem' in read) return setProblem(read.problem)
    setProblem(null)
    setDraft(null)
    setBreakpoint(terminal, { bus: formatSignal(read.signal), shown: written.trim() })
  }

  return (
    <>
      <div className="field">
        <label htmlFor={fieldId}>{t('Pause when it')}</label>
        <select
          id={fieldId}
          value={choice}
          onChange={(event) => {
            const next = event.target.value
            setAsking(next === 'value')
            setDraft(null)
            setProblem(null)
            setBreakpoint(
              terminal,
              next === 'never' || next === 'value'
                ? null
                : next === 'change' || next === 'conflict'
                  ? next
                  : Number(next),
            )
          }}
        >
          <option value="never">{t('Never')}</option>
          <option value="change">{t('Changes')}</option>
          <option value="conflict">{t('Is in conflict')}</option>
          {values.map((digit) => (
            <option key={digit} value={digit}>
              {t('Becomes {value}', { value: valueText(digit, settings) })}
            </option>
          ))}
          {bus && <option value="value">{t('Becomes a value')}</option>}
        </select>
      </div>
      {bus && choice === 'value' && (
        <div className="field">
          <label htmlFor={valueId}>{t('Value')}</label>
          <input
            id={valueId}
            className="mono"
            value={written}
            spellCheck={false}
            autoComplete="off"
            autoFocus={asking && when === undefined}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : problemId}
            onChange={(event) => {
              setDraft(event.target.value)
              setProblem(null)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
            }}
          />
        </div>
      )}
      {problem !== null && (
        <p className="note" id={problemId} role="alert">
          {problem}
        </p>
      )}
    </>
  )
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
  useSim((state) => state.meters)
  const doc = useEditor((state) => state.doc)
  const formatId = useId()
  const info = describeNode(terminal)
  const format = formatAt(doc, terminal)

  return (
    <InspectorSheet label={t('Wire')} title={t('Wire')}>
      <p className="wire-reading">
        <span className="wire-value">{signalText(info.signal, settings, format)}</span>
        <span>{info.conflict ? t('{name}, in conflict', { name: info.name }) : info.name}</span>
      </p>
      {info.signal.length > 1 && (
        <>
          <p className="note">{t('A bus of {count} digits.', { count: info.signal.length })}</p>
          <div className="field">
            <label htmlFor={formatId}>{t('Write it as')}</label>
            <select
              id={formatId}
              value={format}
              onChange={(event) =>
                useEditor.getState().setBusFormat(terminal, event.target.value as BusFormat)
              }
            >
              {busFormatsFor(settings.radix).map((choice) => (
                <option key={choice} value={choice}>
                  {busFormatName(choice, settings.radix)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {info.mixed && (
        <p className="note">
          {t('Pins of different widths are wired together here.')}{' '}
          {t('Make the widths the same, or use a splitter or a merger.')}
        </p>
      )}
      {info.drivers.length === 0 ? (
        <p className="note">{t('Nothing drives it, so it floats.')}</p>
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
      <BreakField terminal={terminal} width={info.signal.length} format={format} />
      {/* The same as a right-click on the wire, for the keyboard. */}
      <label className="check">
        <input
          type="checkbox"
          checked={isWatched(terminal)}
          onChange={() => {
            if (toggleWatch(terminal)) useSim.getState().setScopeOpen(true)
          }}
        />
        {t('Show in the timing diagram')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={isMetered(terminal)}
          onChange={() => toggleMeter(terminal)}
        />
        {t('Pin to the meter board')}
      </label>
      <ConeCheck />
    </InspectorSheet>
  )
}

/** The name a state machine gives one of its pins, if it names it. */
function machinePinName(machine: Machine | undefined, port: string): string | undefined {
  const numbered = machine ? /^(in|out)(\d)$/.exec(port) : null
  if (!machine || !numbered) return undefined
  return (numbered[1] === 'in' ? machine.inputs : machine.outputs)[Number(numbered[2])]
}

/**
 * What a part carries right now: the value a memory part keeps, then every
 * pin, inputs first. It follows the simulation as it runs.
 */
function PartValues({ id }: { id: string }) {
  const settings = useEditor((state) => state.settings)
  const machine = useEditor((state) => state.doc.components[id]?.machine)
  useSim((state) => state.revision)
  const reading = readPart(id)
  if (!reading || reading.pins.length === 0) return null
  const pins = [
    ...reading.pins.filter((pin) => pin.direction === 'in'),
    ...reading.pins.filter((pin) => pin.direction === 'out'),
  ]
  return (
    <section className="part-values" aria-label={t('Values now')}>
      {reading.stored && (
        <p className="wire-reading">
          {machine ? (
            <>
              <span>{t('in state')}</span>
              <span className="wire-value">{machine.states[reading.stored[0]]?.name ?? '?'}</span>
            </>
          ) : (
            <>
              <span className="wire-value">{signalText(reading.stored, settings)}</span>
              <span>{t('kept inside')}</span>
            </>
          )}
        </p>
      )}
      <ul className="probe-pins">
        {pins.map((pin) => (
          <li key={pin.port}>
            <span>
              {pin.direction === 'in' ? '\u2192 ' : '\u2190 '}
              {machinePinName(machine, pin.port) ?? portLabel(pin.port)}
            </span>
            <span className="probe-pin-value">{signalText(pin.signal, settings)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Turns the cone of influence of the selection on and off, as the command does. */
function ConeCheck() {
  const shown = useSim((state) => state.coneShown)
  return (
    <label className="check" title={t('Light up what this drives and fade what has nothing to do with it')}>
      <input type="checkbox" checked={shown} onChange={() => useSim.getState().setConeShown(!shown)} />
      {t('Show the cone of influence')}
    </label>
  )
}

const ALIGNMENTS: readonly {
  readonly edge: AlignEdge
  /** In English; shown through `t`. */
  readonly label: string
  readonly icon: () => React.JSX.Element
}[] = [
  { edge: 'left', label: msg('Line up the left edges'), icon: AlignLeftIcon },
  { edge: 'centerX', label: msg('Line up the middles, left to right'), icon: AlignCenterXIcon },
  { edge: 'right', label: msg('Line up the right edges'), icon: AlignRightIcon },
  { edge: 'top', label: msg('Line up the top edges'), icon: AlignTopIcon },
  { edge: 'centerY', label: msg('Line up the middles, top to bottom'), icon: AlignCenterYIcon },
  { edge: 'bottom', label: msg('Line up the bottom edges'), icon: AlignBottomIcon },
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
  const { alignSelection, distributeSelection, selectionToCircuit, frameSelection } = useEditor.getState()

  return (
    <InspectorSheet label={t('Selected parts')} title={parts === 1 ? t('1 part') : t('{count} parts', { count: parts })}>
      <div className="arrange" role="group" aria-label={t('Line up')}>
        {ALIGNMENTS.map(({ edge, label, icon: AlignIcon }) => (
          <button
            key={edge}
            type="button"
            className="tool"
            aria-label={t(label)}
            title={t(label)}
            disabled={parts < 2}
            onClick={() => alignSelection(edge)}
          >
            <AlignIcon />
          </button>
        ))}
      </div>
      <div className="arrange" role="group" aria-label={t('Space evenly')}>
        <button
          type="button"
          className="tool"
          aria-label={t('Space evenly, left to right')}
          title={t('Space evenly, left to right. Needs three parts')}
          disabled={parts < 3}
          onClick={() => distributeSelection('x')}
        >
          <SpreadXIcon />
        </button>
        <button
          type="button"
          className="tool"
          aria-label={t('Space evenly, top to bottom')}
          title={t('Space evenly, top to bottom. Needs three parts')}
          disabled={parts < 3}
          onClick={() => distributeSelection('y')}
        >
          <SpreadYIcon />
        </button>
      </div>
      <button
        type="button"
        className="button"
        title={t(
          'Move these parts into a circuit of their own and put one part in their place (Ctrl+G). Switches and outputs stay here',
        )}
        disabled={movable === 0}
        onClick={() => selectionToCircuit()}
      >
        {t('Make a circuit')}
      </button>
      <button
        type="button"
        className="button"
        title={t('Draw a titled frame around these parts. What lies inside moves with it')}
        onClick={frameSelection}
      >
        {t('Add a frame')}
      </button>
      <ConeCheck />
    </InspectorSheet>
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
  const nothing = useEditor((state) => state.selection.size === 0)
  // With nothing selected the sheet goes away; the next selection brings it up low again.
  useEffect(() => {
    if (nothing) useSheet.getState().setOpen(false)
  }, [nothing])
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
      <InspectorSheet label={t('Text settings')} title={t('Text')}>
        <NameField
          key={`${active}:${component.id}:${text}`}
          id={component.id}
          type={component.type}
          label={text}
          writing
        />
        <p className="note">{t('Writing on the canvas. It is not part of the circuit.')}</p>
      </InspectorSheet>
    )
  }

  if (component.type === FRAME_TYPE) {
    const title = component.text ?? ''
    return (
      <InspectorSheet label={t('Frame settings')} title={t('Frame')}>
        <NameField
          key={`${active}:${component.id}:${title}`}
          id={component.id}
          type={component.type}
          label={title}
          writing
          caption={t('Title')}
        />
        <p className="note">
          {t('Not part of the circuit.')} {t('Whatever lies wholly inside moves with it.')}{' '}
          {t('Drag its lower right corner to resize it.')}
        </p>
      </InspectorSheet>
    )
  }

  if (component.type === NET_TYPE) {
    const name = component.label ?? ''
    const others = Object.values(doc.components).filter(
      (part) => part.type === NET_TYPE && part.id !== component.id && part.label === name,
    ).length
    return (
      <InspectorSheet label={t('Net label settings')} title={t('Net label')}>
        <NameField
          key={`${active}:${component.id}:${name}`}
          id={component.id}
          type={component.type}
          label={name}
          caption={t('Net name')}
        />
        <p className="note">
          {others === 0
            ? `${t('No other label is named {name} yet.', { name })} ${t('Give one the same name to connect them.')}`
            : others === 1
              ? t('Connected to 1 other label named {name}, as if a wire ran between them.', { name })
              : t('Connected to {count} other labels named {name}, as if a wire ran between them.', {
                  count: others,
                  name,
                })}
        </p>
        <ConeCheck />
      </InspectorSheet>
    )
  }

  if (component.type === SUB_TYPE) {
    const sub = component.sub
    if (!sub) return null
    return (
      <InspectorSheet label={t('{name} circuit', { name: sub.name })} title={sub.name}>
        <p className="note">
          {t('{inputs}, {outputs}', { inputs: inputCount(sub.inputs.length), outputs: outputCount(sub.outputs.length) })}
        </p>
        <button
          type="button"
          className="button"
          title={t('Open this circuit. Double-clicking the part does the same')}
          onClick={() => useEditor.getState().selectCircuit(sub.circuit)}
        >
          {t('Open circuit')}
        </button>
        <TruthTablePanel part={component} />
        <ConeCheck />
      </InspectorSheet>
    )
  }

  const def = builtinComponents.get(component.type)
  const specs = def.params
  // A state machine's numbers all come from its machine, drawn in its own editor.
  const fields = component.machine ? [] : FIELDS.filter((field) => field.param in specs)
  const named = NAMED.includes(component.type)
  const keyed = takesKey(component.type)
  // Only a part that turns inputs into outputs has a delay worth setting.
  const ports = def.ports(component.params)
  const timed =
    ports.some((port) => port.direction === 'in') && ports.some((port) => port.direction === 'out')
  const { setParams, setDelay } = useEditor.getState()

  return (
    <InspectorSheet label={t('{name} settings', { name: partName(component.type) })} title={partName(component.type)}>
      <p className="note part-hint">{partHint(component.type, settings.radix)}</p>
      <NameField
        // A new field for another part, and after undo changed the name.
        key={`${active}:${component.id}:${component.label ?? ''}`}
        id={component.id}
        type={component.type}
        label={component.label ?? ''}
      />
      {named && <p className="note">{t('Shown on the pin when this circuit is used as a part.')}</p>}
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
      {component.type === 'clock' && (
        <label className="check" title={t('A stopped clock gives 0 and lets the circuit settle')}>
          <input
            type="checkbox"
            checked={component.params.on !== 0}
            onChange={(event) => setParams(component.id, { on: event.target.checked ? 1 : 0 })}
          />
          {t('Running')}
        </label>
      )}
      {fields.map((field) => {
        const [min, max] = field.range(settings.radix, specs[field.param])
        return (
          <Stepper
            // A fresh field for another part, so nothing typed carries over.
            key={`${active}:${component.id}:${field.param}`}
            label={t((field.param === 'select' && SELECT_LABELS[component.type]) || field.label)}
            value={component.params[field.param]}
            min={min}
            max={max}
            shown={field.typed === false ? field.show(component.params[field.param], settings) : undefined}
            onSet={(next) => setParams(component.id, { [field.param]: next })}
          />
        )
      })}
      {CHOICES.filter((choice) => choice.param in specs).map((choice) => (
        <ChoiceField
          key={`${active}:${component.id}:${choice.param}`}
          label={choice.label}
          options={choice.options}
          value={component.params[choice.param]}
          onSet={(next) => setParams(component.id, { [choice.param]: next })}
        />
      ))}
      {timed && (
        <Stepper
          key={`${active}:${component.id}:delay`}
          label={t('Delay')}
          title={t('How many ticks the part takes to answer')}
          value={component.delay}
          min={1}
          max={MAX_DELAY}
          onSet={(next) => setDelay(component.id, next)}
        />
      )}
      {component.type === 'table' && <TableEditor component={component} />}
      {(component.type === 'rom' || component.type === 'ram') && <MemoryEditor component={component} />}
      {component.machine && <MachineSummary id={component.id} machine={component.machine} />}
      <PartValues id={component.id} />
      <TruthTablePanel part={component} />
      <ConeCheck />
    </InspectorSheet>
  )
}
