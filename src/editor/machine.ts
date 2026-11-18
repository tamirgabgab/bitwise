import {
  ANY,
  MAX_MACHINE_INPUTS,
  MAX_MACHINE_OUTPUTS,
  MAX_RADIX,
  MAX_RULES,
  MAX_STATES,
  ruleFrom,
  ruleTo,
  ruleWhen,
  stateOutput,
} from '../core/index.ts'
import type { Point } from './geometry.ts'

/*
 * A state machine as the user draws it, kept on its part (type `fsm`): the
 * names of its inputs and outputs, its states with a name, a place in the
 * machine editor and a digit for every output, and its rules. The first
 * state is where the machine starts. A rule takes the machine from one
 * state to another when every input it names has the digit it asks for;
 * the first rule of a state that matches wins.
 *
 * The engine does not see this: `compileMachine` turns it into the
 * parameters of the part, and every change goes through it again.
 */

export const MACHINE_TYPE = 'fsm'

/** The longest name of a state. */
export const MAX_STATE_NAME = 12
/** The longest name of an input or output, so it fits beside its pin. */
export const MAX_PIN_NAME = 6
/** The machine editor's drawing runs from 0 to this, in pixels, both ways. */
export const MACHINE_SPACE = 2000

export interface MachineNode {
  readonly id: string
  readonly name: string
  /** Its middle in the machine editor. */
  readonly pos: Point
  /** The digit it gives on each output, written for radix 16. */
  readonly outputs: readonly number[]
}

export interface MachineRule {
  readonly from: string
  readonly to: string
  /** For each input, the digit it must be, or null for any. */
  readonly when: readonly (number | null)[]
}

export interface Machine {
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  /** The first is the start state. */
  readonly states: readonly MachineNode[]
  /** In order: the first that matches wins. */
  readonly rules: readonly MachineRule[]
}

/** What a new state machine part starts with: a light that a button turns on and off. */
export function defaultMachine(): Machine {
  return {
    inputs: ['go'],
    outputs: ['on'],
    states: [
      { id: 's1', name: 'Off', pos: { x: 120, y: 140 }, outputs: [0] },
      { id: 's2', name: 'On', pos: { x: 360, y: 140 }, outputs: [1] },
    ],
    rules: [
      { from: 's1', to: 's2', when: [1] },
      { from: 's2', to: 's1', when: [1] },
    ],
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDigit = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_RADIX

function cleanName(value: unknown, longest: number, fallback: string): string {
  const name = typeof value === 'string' ? value.trim().slice(0, longest) : ''
  return name === '' ? fallback : name
}

function cleanPos(value: unknown): Point {
  const fit = (coord: unknown): number =>
    typeof coord === 'number' && Number.isFinite(coord)
      ? Math.max(0, Math.min(MACHINE_SPACE, Math.round(coord)))
      : 0
  return isObject(value) ? { x: fit(value.x), y: fit(value.y) } : { x: 0, y: 0 }
}

/**
 * A machine out of anything, such as what a file holds: what makes no sense
 * is left out or cut to the limits. Undefined when no state is left.
 */
export function cleanMachine(value: unknown): Machine | undefined {
  if (!isObject(value)) return undefined
  const names = (list: unknown, most: number, prefix: string): string[] =>
    (Array.isArray(list) ? list : [])
      .slice(0, most)
      .map((name, index) => cleanName(name, MAX_PIN_NAME, `${prefix}${index}`))
  const inputs = names(value.inputs, MAX_MACHINE_INPUTS, 'in')
  const outputs = names(value.outputs, MAX_MACHINE_OUTPUTS, 'out')

  const states: MachineNode[] = []
  const ids = new Set<string>()
  for (const item of Array.isArray(value.states) ? value.states : []) {
    if (states.length === MAX_STATES) break
    if (!isObject(item) || typeof item.id !== 'string' || !/^[A-Za-z]\w{0,15}$/.test(item.id)) continue
    if (ids.has(item.id)) continue
    ids.add(item.id)
    const given = Array.isArray(item.outputs) ? item.outputs : []
    states.push({
      id: item.id,
      name: cleanName(item.name, MAX_STATE_NAME, `S${states.length}`),
      pos: cleanPos(item.pos),
      outputs: outputs.map((_name, output) => (isDigit(given[output]) ? given[output] : 0)),
    })
  }
  if (states.length === 0) return undefined

  const rules: MachineRule[] = []
  for (const item of Array.isArray(value.rules) ? value.rules : []) {
    if (rules.length === MAX_RULES) break
    if (!isObject(item) || typeof item.from !== 'string' || typeof item.to !== 'string') continue
    if (!ids.has(item.from) || !ids.has(item.to)) continue
    const given = Array.isArray(item.when) ? item.when : []
    rules.push({
      from: item.from,
      to: item.to,
      when: inputs.map((_name, input) => (isDigit(given[input]) ? given[input] : null)),
    })
  }
  return { inputs, outputs, states, rules }
}

/** The parameters of the `fsm` part that runs the machine. */
export function compileMachine(machine: Machine): Record<string, number> {
  const place = new Map(machine.states.map((state, index) => [state.id, index]))
  const params: Record<string, number> = {
    states: machine.states.length,
    inputs: machine.inputs.length,
    outputs: machine.outputs.length,
    rules: machine.rules.length,
  }
  machine.rules.forEach((rule, index) => {
    params[ruleFrom(index)] = place.get(rule.from) ?? 0
    params[ruleTo(index)] = place.get(rule.to) ?? 0
    rule.when.forEach((digit, input) => {
      params[ruleWhen(index, input)] = digit ?? ANY
    })
  })
  machine.states.forEach((state, index) =>
    state.outputs.forEach((digit, output) => {
      params[stateOutput(index, output)] = digit
    }),
  )
  return params
}

/** An id no state of the machine has yet. */
export function freeStateId(machine: Machine): string {
  const ids = new Set(machine.states.map((state) => state.id))
  let number = machine.states.length + 1
  while (ids.has(`s${number}`)) number++
  return `s${number}`
}

/** A name no state of the machine has yet: S0, S1, ... */
export function freeStateName(machine: Machine): string {
  const names = new Set(machine.states.map((state) => state.name))
  let number = machine.states.length
  while (names.has(`S${number}`)) number++
  return `S${number}`
}

/** Whether two rules can both match the same inputs. */
export function overlaps(a: MachineRule, b: MachineRule): boolean {
  return a.when.every((digit, input) => digit === null || b.when[input] === null || digit === b.when[input])
}

/**
 * The rules that never take effect: a rule after another of the same state
 * that matches whatever it matches. Given by their place in the list.
 */
export function shadowedRules(machine: Machine): Set<number> {
  const covers = (a: MachineRule, b: MachineRule): boolean =>
    a.when.every((digit, input) => digit === null || digit === b.when[input])
  const shadowed = new Set<number>()
  machine.rules.forEach((rule, index) => {
    const earlier = machine.rules.slice(0, index)
    if (earlier.some((other) => other.from === rule.from && covers(other, rule))) shadowed.add(index)
  })
  return shadowed
}
