import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_MACHINE_INPUTS,
  MAX_MACHINE_OUTPUTS,
  MAX_RULES,
  MAX_STATES,
} from '../core/index.ts'
import {
  MACHINE_SPACE,
  MAX_PIN_NAME,
  MAX_STATE_NAME,
  freeStateId,
  freeStateName,
  readPart,
  ruleOutputs,
  setMealy,
  shadowedRules,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { Machine, MachineNode, MachineRule, Point } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon, DeleteIcon } from './icons.tsx'
import { useModal } from './useModal.ts'

/*
 * The machine editor: the states of a state machine part drawn as circles
 * and its rules as arrows, with the selected state and its rules in a panel
 * beside them. Every change is one step of undo of the circuit. A Moore
 * machine shows its outputs in the states, a Mealy machine on the arrows.
 */

/** The radius of a state, in the editor's pixels. */
const RADIUS = 34
/** The least the drawing shows, so a small machine is not blown up. */
const LEAST = { width: 640, height: 400 }

const hex = (digit: number): string => digit.toString(16).toUpperCase()

/**
 * What a rule asks of the inputs, in words. In a Mealy machine what it
 * gives follows a slash, as such machines are drawn.
 */
function conditionText(machine: Machine, rule: MachineRule): string {
  const parts = rule.when.flatMap((digit, input) => (digit === null ? [] : [`${machine.inputs[input]}=${hex(digit)}`]))
  const when = parts.length === 0 ? t('always') : parts.join(' ')
  if (!machine.mealy || machine.outputs.length === 0) return when
  return `${when} / ${ruleOutputs(machine, rule).map(hex).join(' ')}`
}

/** A text field that takes its text when it loses focus or on Enter; Esc puts it back. */
function NameInput({
  label,
  value,
  longest,
  onName,
  first,
}: {
  label: string
  value: string
  longest: number
  onName: (name: string) => void
  first?: boolean
}) {
  const [text, setText] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) {
    setWas(value)
    setText(value)
  }
  const done = (): void => {
    const name = text.trim()
    if (name === '' || name === value) setText(value)
    else onName(name)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      done()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setText(value)
    }
  }
  return (
    <input
      aria-label={label}
      value={text}
      maxLength={longest}
      spellCheck={false}
      autoComplete="off"
      data-first={first ? '' : undefined}
      onChange={(event) => setText(event.target.value)}
      onBlur={done}
      onKeyDown={onKeyDown}
    />
  )
}

/** A choice of a digit of the radix, or of any digit when `any` is given. */
function DigitSelect({
  label,
  value,
  radix,
  any,
  onDigit,
}: {
  label: string
  value: number | null
  radix: number
  any?: string
  onDigit: (digit: number | null) => void
}) {
  const digits = Array.from({ length: radix }, (_, digit) => digit)
  // A digit kept from a larger radix stays visible until it is changed.
  if (value !== null && value >= radix) digits.push(value)
  return (
    <select
      aria-label={label}
      value={value === null ? '' : String(value)}
      onChange={(event) => onDigit(event.target.value === '' ? null : Number(event.target.value))}
    >
      {any !== undefined && <option value="">{any}</option>}
      {digits.map((digit) => (
        <option key={digit} value={digit}>
          {digit >= radix ? t('{digit} (no room)', { digit: hex(digit) }) : hex(digit)}
        </option>
      ))}
    </select>
  )
}

/** The arrows of the rules, one for each pair of states, with every rule's condition on it. */
function Arrows({
  machine,
  at,
  selectedRule,
  onRule,
}: {
  machine: Machine
  at: (state: MachineNode) => Point
  selectedRule: number | null
  onRule: (rule: number) => void
}) {
  const byId = new Map(machine.states.map((state) => [state.id, state]))
  // A press on an arrow is not a press on the empty drawing under it.
  const pick = (event: ReactPointerEvent<SVGElement>, rule: number): void => {
    event.stopPropagation()
    onRule(rule)
  }
  const pairs = new Map<string, number[]>()
  machine.rules.forEach((rule, index) => {
    const key = `${rule.from}>${rule.to}`
    pairs.set(key, [...(pairs.get(key) ?? []), index])
  })
  return (
    <>
      {[...pairs].map(([key, indices]) => {
        const { from, to } = machine.rules[indices[0]]
        const a = at(byId.get(from)!)
        const b = at(byId.get(to)!)
        const chosen = selectedRule !== null && indices.includes(selectedRule)
        let path: string
        let label: Point
        if (from === to) {
          const angle = (degrees: number): Point => ({
            x: a.x + RADIUS * Math.cos((degrees * Math.PI) / 180),
            y: a.y + RADIUS * Math.sin((degrees * Math.PI) / 180),
          })
          const start = angle(-115)
          const end = angle(-65)
          path = `M ${start.x} ${start.y} C ${a.x - 42} ${a.y - RADIUS - 56} ${a.x + 42} ${a.y - RADIUS - 56} ${end.x} ${end.y}`
          label = { x: a.x, y: a.y - RADIUS - 52 }
        } else {
          const dx = b.x - a.x
          const dy = b.y - a.y
          const length = Math.hypot(dx, dy) || 1
          const normal = { x: -dy / length, y: dx / length }
          // Two states with rules both ways get two curves, one each side.
          const bend = pairs.has(`${to}>${from}`) ? 28 : 0
          const control = { x: (a.x + b.x) / 2 + normal.x * bend, y: (a.y + b.y) / 2 + normal.y * bend }
          const toward = (p: Point, q: Point): Point => {
            const span = Math.hypot(q.x - p.x, q.y - p.y) || 1
            return { x: p.x + ((q.x - p.x) / span) * RADIUS, y: p.y + ((q.y - p.y) / span) * RADIUS }
          }
          const start = toward(a, control)
          const end = toward(b, control)
          path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
          const middle = {
            x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
            y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
          }
          label = { x: middle.x + normal.x * 14, y: middle.y + normal.y * 14 }
        }
        return (
          <g key={key} className={chosen ? 'machine-arrow chosen' : 'machine-arrow'}>
            <path d={path} markerEnd={chosen ? 'url(#machine-head-chosen)' : 'url(#machine-head)'} />
            <path d={path} className="machine-arrow-hit" onPointerDown={(event) => pick(event, indices[0])} />
            {indices.map((index, line) => (
              <text
                key={index}
                x={label.x}
                y={label.y + (line - (indices.length - 1) / 2) * 15}
                className={index === selectedRule ? 'chosen' : undefined}
                onPointerDown={(event) => pick(event, index)}
              >
                {conditionText(machine, machine.rules[index])}
              </text>
            ))}
          </g>
        )
      })}
    </>
  )
}

/**
 * The machine editor window, opened on the state machine part named in
 * `useChrome.machinePart`. It closes by itself when the part goes.
 */
export function MachineEditor() {
  const open = useChrome((state) => state.overlay === 'machine')
  const partId = useChrome((state) => state.machinePart)
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const part = useEditor((state) => (partId === null ? undefined : state.doc.components[partId]))
  const shown = open && part?.machine !== undefined
  return (
    <dialog {...modal} className="dialog machine-editor" aria-labelledby="machine-title">
      {shown && <MachineBody key={partId} partId={part.id} label={part.label} machine={part.machine!} onClose={close} />}
      {open && !shown && (
        <div className="dialog-box">
          <h2 id="machine-title">{t('State machine')}</h2>
          <p>{t('The part is gone from the open circuit.')}</p>
          <div className="dialog-actions">
            <button type="button" className="button button-main" data-first onClick={close}>
              {t('Close')}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

function MachineBody({
  partId,
  label,
  machine,
  onClose,
}: {
  partId: string
  label: string | undefined
  machine: Machine
  onClose: () => void
}) {
  const radix = useEditor((state) => state.settings.radix)
  useSim((state) => state.revision)
  const { setMachine, machineToCircuit } = useEditor.getState()
  const [selected, setSelected] = useState<string | null>(machine.states[0].id)
  const [selectedRule, setSelectedRule] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: string; pos: Point; offset: Point } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const titleId = 'machine-title'
  const panelId = useId()
  const kindId = useId()

  const change = (next: Machine): void => {
    setProblem(null)
    setMachine(partId, next)
  }
  const state = machine.states.find((item) => item.id === selected)
  const live = readPart(partId)?.stored?.[0]
  const liveId = live !== undefined && live >= 0 ? machine.states[live]?.id : undefined
  const shadowed = shadowedRules(machine)
  const mealy = machine.mealy === true
  // A Moore machine writes what a state gives inside its circle.
  const inStates = !mealy && machine.outputs.length > 0
  const at = (node: MachineNode): Point => (drag?.id === node.id ? drag.pos : node.pos)

  // The drawing shows every state with room around it, and never less than LEAST.
  const xs = machine.states.map((node) => node.pos.x)
  const ys = machine.states.map((node) => node.pos.y)
  const margin = RADIUS + 70
  const left = Math.min(0, Math.min(...xs) - margin)
  const top = Math.min(0, Math.min(...ys) - margin)
  const width = Math.max(LEAST.width, Math.max(...xs) + margin - left)
  const height = Math.max(LEAST.height, Math.max(...ys) + margin - top)

  const toDrawing = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    const fit = (value: number): number => Math.max(0, Math.min(MACHINE_SPACE, Math.round(value)))
    return { x: fit(point.x), y: fit(point.y) }
  }

  const addState = (pos?: Point): void => {
    if (machine.states.length >= MAX_STATES) return
    const rightmost = machine.states.reduce((best, node) => (node.pos.x > best.pos.x ? node : best))
    const place = pos ?? { x: Math.min(MACHINE_SPACE, rightmost.pos.x + 160), y: rightmost.pos.y }
    const node: MachineNode = {
      id: freeStateId(machine),
      name: freeStateName(machine),
      pos: place,
      outputs: machine.outputs.map(() => 0),
    }
    change({ ...machine, states: [...machine.states, node] })
    setSelected(node.id)
    setSelectedRule(null)
    setDeleting(false)
  }

  const putState = (id: string, edit: Partial<MachineNode>): void =>
    change({ ...machine, states: machine.states.map((node) => (node.id === id ? { ...node, ...edit } : node)) })

  const putRule = (index: number, edit: Partial<MachineRule>): void =>
    change({ ...machine, rules: machine.rules.map((rule, place) => (place === index ? { ...rule, ...edit } : rule)) })

  const onStateDown = (event: ReactPointerEvent<SVGGElement>, node: MachineNode): void => {
    event.stopPropagation()
    const point = toDrawing(event.clientX, event.clientY)
    setSelected(node.id)
    setSelectedRule(null)
    setDeleting(false)
    setDrag({ id: node.id, pos: node.pos, offset: { x: point.x - node.pos.x, y: point.y - node.pos.y } })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onStateMove = (event: ReactPointerEvent<SVGGElement>): void => {
    if (!drag) return
    const point = toDrawing(event.clientX, event.clientY)
    const fit = (value: number): number => Math.max(0, Math.min(MACHINE_SPACE, value))
    setDrag({ ...drag, pos: { x: fit(point.x - drag.offset.x), y: fit(point.y - drag.offset.y) } })
  }
  const onStateUp = (): void => {
    if (!drag) return
    const node = machine.states.find((item) => item.id === drag.id)
    if (node && (node.pos.x !== drag.pos.x || node.pos.y !== drag.pos.y)) putState(drag.id, { pos: drag.pos })
    setDrag(null)
  }

  const ownRules = state
    ? machine.rules.flatMap((rule, index) => (rule.from === state.id ? [index] : []))
    : []
  const removeState = (id: string): void => {
    const states = machine.states.filter((node) => node.id !== id)
    change({ ...machine, states, rules: machine.rules.filter((rule) => rule.from !== id && rule.to !== id) })
    setSelected(states[0]?.id ?? null)
    setDeleting(false)
  }
  const moveRuleUp = (index: number): void => {
    const earlier = ownRules.filter((place) => place < index).at(-1)
    if (earlier === undefined) return
    const rules = [...machine.rules]
    ;[rules[earlier], rules[index]] = [rules[index], rules[earlier]]
    change({ ...machine, rules })
    setSelectedRule(earlier)
  }
  const addRule = (): void => {
    if (!state || machine.rules.length >= MAX_RULES) return
    const after = machine.states[(machine.states.indexOf(state) + 1) % machine.states.length]
    const rule: MachineRule = {
      from: state.id,
      to: after.id,
      when: machine.inputs.map((_name, input) => (input === 0 ? radix - 1 : null)),
      ...(machine.mealy ? { outputs: state.outputs } : {}),
    }
    change({ ...machine, rules: [...machine.rules, rule] })
    setSelectedRule(machine.rules.length)
  }

  const renamePin = (side: 'inputs' | 'outputs', index: number, name: string): void =>
    change({ ...machine, [side]: machine[side].map((old, place) => (place === index ? name : old)) })
  const addPin = (side: 'inputs' | 'outputs'): void => {
    const names = new Set(machine[side])
    const prefix = side === 'inputs' ? 'in' : 'out'
    let number = machine[side].length
    while (names.has(`${prefix}${number}`)) number++
    const name = `${prefix}${number}`
    if (side === 'inputs') {
      change({ ...machine, inputs: [...machine.inputs, name], rules: machine.rules.map((rule) => ({ ...rule, when: [...rule.when, null] })) })
    } else {
      change({
        ...machine,
        outputs: [...machine.outputs, name],
        states: machine.states.map((node) => ({ ...node, outputs: [...node.outputs, 0] })),
        rules: machine.rules.map((rule) => (rule.outputs ? { ...rule, outputs: [...rule.outputs, 0] } : rule)),
      })
    }
  }
  const removePin = (side: 'inputs' | 'outputs', index: number): void => {
    const without = <T,>(list: readonly T[]): T[] => list.filter((_item, place) => place !== index)
    if (side === 'inputs') {
      change({ ...machine, inputs: without(machine.inputs), rules: machine.rules.map((rule) => ({ ...rule, when: without(rule.when) })) })
    } else {
      change({
        ...machine,
        outputs: without(machine.outputs),
        states: machine.states.map((node) => ({ ...node, outputs: without(node.outputs) })),
        rules: machine.rules.map((rule) => (rule.outputs ? { ...rule, outputs: without(rule.outputs) } : rule)),
      })
    }
  }

  const build = (): void => {
    const result = machineToCircuit(partId)
    if ('problem' in result) setProblem(t(result.problem))
    else onClose()
  }

  const pinList = (side: 'inputs' | 'outputs', title: string, most: number) => (
    <section className="machine-pins" aria-label={title}>
      <h3>{title}</h3>
      {machine[side].map((name, index) => (
        <div key={`${index}:${name}`} className="machine-row">
          <NameInput
            label={t('{title}: name {number}', { title, number: index + 1 })}
            value={name}
            longest={MAX_PIN_NAME}
            onName={(next) => renamePin(side, index, next)}
          />
          <button
            type="button"
            className="tool"
            aria-label={t('Remove {name}', { name })}
            title={t('Remove {name}', { name })}
            onClick={() => removePin(side, index)}
          >
            <DeleteIcon />
          </button>
        </div>
      ))}
      {machine[side].length < most && (
        <button type="button" className="button" onClick={() => addPin(side)}>
          {side === 'inputs' ? t('Add input') : t('Add output')}
        </button>
      )}
    </section>
  )

  return (
    <div className="machine-body">
      <header className="overlay-head">
        <h2 id={titleId}>{label ? t('State machine {label}', { label }) : t('State machine')}</h2>
        <button
          type="button"
          className="tool"
          aria-label={t('Close the machine editor')}
          title={t('Close the machine editor (Esc)')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="machine-main">
        <svg
          ref={svgRef}
          className="machine-drawing"
          viewBox={`${left} ${top} ${width} ${height}`}
          role="img"
          aria-label={t('{states} states and {rules} rules. Double-click empty space to add a state.', {
            states: machine.states.length,
            rules: machine.rules.length,
          })}
          onPointerDown={() => {
            setSelectedRule(null)
          }}
          onDoubleClick={(event) => {
            if (event.target === event.currentTarget) addState(toDrawing(event.clientX, event.clientY))
          }}
        >
          <defs>
            <marker id="machine-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="machine-head" />
            </marker>
            <marker id="machine-head-chosen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="machine-head chosen" />
            </marker>
          </defs>
          <Arrows
            machine={machine}
            at={at}
            selectedRule={selectedRule}
            onRule={(rule) => {
              setSelected(machine.rules[rule].from)
              setSelectedRule(rule)
              setDeleting(false)
            }}
          />
          {machine.states.map((node, index) => {
            const p = at(node)
            const classes = ['machine-state']
            if (node.id === selected) classes.push('chosen')
            if (node.id === liveId) classes.push('live')
            return (
              <g
                key={node.id}
                className={classes.join(' ')}
                onPointerDown={(event) => onStateDown(event, node)}
                onPointerMove={onStateMove}
                onPointerUp={onStateUp}
              >
                {index === 0 && (
                  <path
                    d={`M ${p.x - RADIUS - 34} ${p.y} L ${p.x - RADIUS - 2} ${p.y}`}
                    className="machine-start"
                    markerEnd="url(#machine-head)"
                  />
                )}
                <circle cx={p.x} cy={p.y} r={RADIUS} />
                <text x={p.x} y={inStates ? p.y - 4 : p.y + 4} className="machine-name">
                  {node.name}
                </text>
                {inStates && (
                  <text x={p.x} y={p.y + 14} className="machine-outputs">
                    {node.outputs.map(hex).join(' ')}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <div className="machine-panel" id={panelId}>
          <section className="machine-pins" aria-label={t('Kind of machine')}>
            <div className="machine-row">
              <label className="field-label" htmlFor={kindId}>
                {t('Outputs on')}
              </label>
              <select
                id={kindId}
                value={mealy ? 'mealy' : 'moore'}
                title={t(
                  'A Moore machine gives its outputs by the state it is in. A Mealy machine gives them by the rule the inputs meet, at once.',
                )}
                onChange={(event) => change(setMealy(machine, event.target.value === 'mealy'))}
              >
                <option value="moore">{t('States (Moore)')}</option>
                <option value="mealy">{t('Rules (Mealy)')}</option>
              </select>
            </div>
          </section>
          {pinList('inputs', t('Inputs'), MAX_MACHINE_INPUTS)}
          {pinList('outputs', t('Outputs'), MAX_MACHINE_OUTPUTS)}
          {state ? (
            <section className="machine-state-panel" aria-label={t('State {name}', { name: state.name })}>
              <h3>
                {t('State')} {machine.states[0].id === state.id && <span className="machine-tag">{t('start')}</span>}
                {state.id === liveId && <span className="machine-tag">{t('now')}</span>}
              </h3>
              <div className="machine-row">
                <NameInput
                  key={state.id}
                  label={t('State name')}
                  value={state.name}
                  longest={MAX_STATE_NAME}
                  first
                  onName={(name) => putState(state.id, { name })}
                />
              </div>
              {mealy && machine.outputs.length > 0 && (
                <p className="note">{t('While no rule matches, {name} gives:', { name: state.name })}</p>
              )}
              {machine.outputs.map((name, output) => (
                <div key={output} className="machine-row">
                  <span className="field-label">{name}</span>
                  <DigitSelect
                    label={
                      mealy
                        ? t('{output} in {state} while no rule matches', { output: name, state: state.name })
                        : t('{output} in {state}', { output: name, state: state.name })
                    }
                    value={state.outputs[output]}
                    radix={radix}
                    onDigit={(digit) =>
                      putState(state.id, {
                        outputs: state.outputs.map((old, place) => (place === output ? (digit ?? 0) : old)),
                      })
                    }
                  />
                </div>
              ))}
              <h3>{t('Rules, the first that matches wins')}</h3>
              {ownRules.length === 0 && (
                <p className="note">{t('No rules: the machine stays in {name}.', { name: state.name })}</p>
              )}
              <ol className="machine-rules">
                {ownRules.map((index, place) => {
                  const rule = machine.rules[index]
                  return (
                    <li key={index} className={index === selectedRule ? 'chosen' : undefined}>
                      <div className="machine-row">
                        <span className="field-label">{t('Go to')}</span>
                        <select
                          aria-label={t('Rule {number}: go to', { number: place + 1 })}
                          value={rule.to}
                          onFocus={() => setSelectedRule(index)}
                          onChange={(event) => putRule(index, { to: event.target.value })}
                        >
                          {machine.states.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="tool"
                          aria-label={t('Rule {number}: try it earlier', { number: place + 1 })}
                          title={t('Try it earlier')}
                          disabled={place === 0}
                          onClick={() => moveRuleUp(index)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="tool"
                          aria-label={t('Delete rule {number}', { number: place + 1 })}
                          title={t('Delete rule')}
                          onClick={() => {
                            change({ ...machine, rules: machine.rules.filter((_rule, other) => other !== index) })
                            setSelectedRule(null)
                          }}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                      {machine.inputs.map((name, input) => (
                        <div key={input} className="machine-row">
                          <span className="field-label">{t('when {name}', { name })}</span>
                          <DigitSelect
                            label={t('Rule {number}: {name}', { number: place + 1, name })}
                            value={rule.when[input]}
                            radix={radix}
                            any={t('any')}
                            onDigit={(digit) =>
                              putRule(index, { when: rule.when.map((old, other) => (other === input ? digit : old)) })
                            }
                          />
                        </div>
                      ))}
                      {mealy &&
                        machine.outputs.map((name, output) => (
                          <div key={`out${output}`} className="machine-row">
                            <span className="field-label">{t('gives {name}', { name })}</span>
                            <DigitSelect
                              label={t('Rule {number}: gives {name}', { number: place + 1, name })}
                              value={ruleOutputs(machine, rule)[output]}
                              radix={radix}
                              onDigit={(digit) =>
                                putRule(index, {
                                  outputs: ruleOutputs(machine, rule).map((old, other) =>
                                    other === output ? (digit ?? 0) : old,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                      {shadowed.has(index) && (
                        <p className="note">{t('Never taken: a rule above it matches first.')}</p>
                      )}
                    </li>
                  )
                })}
              </ol>
              <div className="machine-actions">
                <button type="button" className="button" disabled={machine.rules.length >= MAX_RULES} onClick={addRule}>
                  {t('Add rule')}
                </button>
                {machine.states[0].id !== state.id && (
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      change({ ...machine, states: [state, ...machine.states.filter((node) => node !== state)] })
                    }
                  >
                    {t('Start here')}
                  </button>
                )}
                {machine.states.length > 1 && !deleting && (
                  <button type="button" className="button" onClick={() => setDeleting(true)}>
                    {t('Delete state')}
                  </button>
                )}
              </div>
              {deleting && (
                <div className="machine-confirm" role="group" aria-label={t('Delete the state')}>
                  <p>
                    {(() => {
                      const count = machine.rules.filter((rule) => rule.from === state.id || rule.to === state.id).length
                      const name = state.name
                      if (count === 0) return t('Delete {name}?', { name })
                      if (count === 1) return t('Delete {name} and the 1 rule to and from it?', { name })
                      return t('Delete {name} and the {count} rules to and from it?', { name, count })
                    })()}
                  </p>
                  <div className="machine-actions">
                    <button type="button" className="button button-danger" onClick={() => removeState(state.id)}>
                      {t('Delete {name}', { name: state.name })}
                    </button>
                    <button type="button" className="button" onClick={() => setDeleting(false)}>
                      {t('Keep it')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <p className="note">{t('Pick a state to change it.')}</p>
          )}
        </div>
      </div>
      <footer className="machine-foot">
        <p className="note">
          {t('{count} of {max} states. Double-click empty space to add one; drag a state to move it.', {
            count: machine.states.length,
            max: MAX_STATES,
          })}
        </p>
        {problem && (
          <p className="note machine-problem" role="status">
            {problem}
          </p>
        )}
        <div className="machine-actions">
          <button type="button" className="button" disabled={machine.states.length >= MAX_STATES} onClick={() => addState()}>
            {t('Add state')}
          </button>
          <button
            type="button"
            className="button button-main"
            title={t('Make a new circuit of D flip-flops and gates that does the same')}
            onClick={build}
          >
            {t('Build from gates')}
          </button>
        </div>
      </footer>
    </div>
  )
}
