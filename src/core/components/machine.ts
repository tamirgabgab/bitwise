import type { ComponentDef, ParamSpec, Params, PortSpec } from '../component.ts'
import { MAX_RADIX, X } from '../signal.ts'
import type { Digit, Signal } from '../signal.ts'
import { either, flag } from './register.ts'
import { clockLevel } from './sequential.ts'
import type { ClockLevel } from './sequential.ts'

/*
 * A state machine. On the rising edge of `clk` it follows the first of its
 * rules that leaves the state it is in and whose condition the inputs meet.
 * With none it stays. State 0 is where it starts, and `reset` at the top
 * value takes it there at once.
 *
 * In the manner of Moore (`mealy` 0) each state gives a digit on every
 * output. In the manner of Mealy (`mealy` 1) the digits sit on the rules:
 * the outputs are those of the first rule of the state that the inputs meet
 * now, without waiting for the clock, and those of the state itself when
 * none does.
 *
 * The machine is drawn in the editor; what the engine needs of it is kept
 * in parameters: `states`, `inputs`, `outputs`, `rules` and `mealy`, then
 * for rule r `r<r>from`, `r<r>to`, for each input `r<r>c<i>` (the digit it
 * must be, or -1 for any) and for each output `r<r>o<k>` (read only by a
 * Mealy machine), and for state s and output k `s<s>o<k>`. Digits are kept
 * as written, so a digit the radix has no room for never matches and gives
 * X.
 *
 * As with the flip-flops, an unknown input that a rule depends on, or an
 * unknown `reset`, makes the outputs unknown where the choices differ but
 * never destroys the state.
 */

export const MAX_STATES = 16
export const MAX_MACHINE_INPUTS = 4
export const MAX_MACHINE_OUTPUTS = 4
export const MAX_RULES = 64

/** A condition that any digit meets. */
export const ANY = -1

export const ruleFrom = (rule: number): string => `r${rule}from`
export const ruleTo = (rule: number): string => `r${rule}to`
export const ruleWhen = (rule: number, input: number): string => `r${rule}c${input}`
export const stateOutput = (state: number, output: number): string => `s${state}o${output}`
export const ruleOutput = (rule: number, output: number): string => `r${rule}o${output}`

const params: Record<string, ParamSpec> = {
  states: { default: 1, min: 1, max: MAX_STATES },
  inputs: { default: 0, min: 0, max: MAX_MACHINE_INPUTS },
  outputs: { default: 1, min: 0, max: MAX_MACHINE_OUTPUTS },
  rules: { default: 0, min: 0, max: MAX_RULES },
  mealy: { default: 0, min: 0, max: 1 },
}
const stateParam: ParamSpec = { default: 0, min: 0, max: MAX_STATES - 1 }
const digitParam: ParamSpec = { default: 0, min: 0, max: MAX_RADIX - 1 }
const whenParam: ParamSpec = { default: ANY, min: ANY, max: MAX_RADIX - 1 }
for (let rule = 0; rule < MAX_RULES; rule++) {
  params[ruleFrom(rule)] = stateParam
  params[ruleTo(rule)] = stateParam
  for (let input = 0; input < MAX_MACHINE_INPUTS; input++) params[ruleWhen(rule, input)] = whenParam
  for (let output = 0; output < MAX_MACHINE_OUTPUTS; output++) params[ruleOutput(rule, output)] = digitParam
}
for (let state = 0; state < MAX_STATES; state++) {
  for (let output = 0; output < MAX_MACHINE_OUTPUTS; output++) params[stateOutput(state, output)] = digitParam
}

export interface MachineState {
  /** The state the machine is in. */
  readonly state: number
  /** Where the clock stood at the last evaluation, to tell an edge. */
  readonly clock: ClockLevel
}

/** The digits kept under `name`, one for each output; one the radix has no room for is X. */
function digitsAt(name: (output: number) => string, params: Params, radix: number): Signal {
  return Array.from({ length: params.outputs }, (_, output) => {
    const digit = params[name(output)]
    return digit < radix ? digit : X
  })
}

/** Whether the inputs meet the condition of a rule; undefined when an unknown input decides it. */
function meets(rule: number, inputs: readonly Digit[], params: Params, radix: number): boolean | undefined {
  let met: boolean | undefined = true
  for (let input = 0; input < params.inputs; input++) {
    const want = params[ruleWhen(rule, input)]
    if (want === ANY) continue
    const digit = inputs[input]
    if (digit < 0 || digit >= radix) met = undefined
    else if (digit !== want) return false
  }
  return met
}

/** Whether a rule leaves `state` for a state the machine has. */
const leaves = (rule: number, state: number, params: Params): boolean =>
  params[ruleFrom(rule)] === state && params[ruleTo(rule)] < params.states

/**
 * The state the inputs lead to from `state`: the target of the first rule
 * that leaves it and matches, `state` when none does, or undefined when an
 * unknown input decides it.
 */
export function nextState(state: number, inputs: readonly Digit[], params: Params, radix: number): number | undefined {
  for (let rule = 0; rule < params.rules; rule++) {
    if (!leaves(rule, state, params)) continue
    const met = meets(rule, inputs, params, radix)
    if (met === undefined) return undefined
    if (met) return params[ruleTo(rule)]
  }
  return state
}

/**
 * What the outputs give while the machine is in `state` with these inputs.
 * A Moore machine gives the digits of the state. A Mealy machine gives
 * those of the first rule of the state that the inputs meet, and those of
 * the state when none does; where an unknown input leaves several rules
 * open, only the digits they agree on.
 */
export function machineOutputs(state: number, inputs: readonly Digit[], params: Params, radix: number): Signal {
  const own = digitsAt((output) => stateOutput(state, output), params, radix)
  if (params.mealy !== 1) return own
  let shown: Signal | undefined
  for (let rule = 0; rule < params.rules; rule++) {
    if (!leaves(rule, state, params)) continue
    const met = meets(rule, inputs, params, radix)
    if (met === false) continue
    const given = digitsAt((output) => ruleOutput(rule, output), params, radix)
    shown = shown === undefined ? given : either(shown, given)
    if (met) return shown
  }
  return shown === undefined ? own : either(shown, own)
}

export const stateMachine: ComponentDef<MachineState> = {
  type: 'fsm',
  params,
  ports({ inputs, outputs }) {
    const ports: PortSpec[] = []
    for (let input = 0; input < inputs; input++) ports.push({ name: `in${input}`, direction: 'in', width: 1 })
    ports.push({ name: 'clk', direction: 'in', width: 1 }, { name: 'reset', direction: 'in', width: 1 })
    for (let output = 0; output < outputs; output++) ports.push({ name: `out${output}`, direction: 'out', width: 1 })
    return ports
  },
  initialState() {
    return { state: 0, clock: 'unknown' }
  },
  stored: (state) => [state.state],
  evaluate(inputs, params, state, { radix }) {
    const clock = clockLevel(inputs.clk[0], radix)
    const edge = state.clock === 'low' && clock === 'high'
    const digits = Array.from({ length: params.inputs }, (_, input) => inputs[`in${input}`][0])
    const next = edge ? nextState(state.state, digits, params, radix) : state.state
    // Unknown where it goes: it stays, and shows only what both agree on.
    const kept = next ?? state.state
    const shownIn = (where: number): Signal => machineOutputs(where, digits, params, radix)
    let shown = shownIn(kept)
    if (next === undefined) {
      for (let rule = 0; rule < params.rules; rule++) {
        if (leaves(rule, state.state, params)) shown = either(shown, shownIn(params[ruleTo(rule)]))
      }
    }
    const reset = flag(inputs.reset[0], radix, false)
    if (reset === true) {
      shown = shownIn(0)
    } else if (reset === undefined) {
      shown = either(shown, shownIn(0))
    }
    const outputs: Record<string, Signal> = {}
    shown.forEach((digit, output) => {
      outputs[`out${output}`] = [digit]
    })
    return { outputs, state: { state: reset === true ? 0 : kept, clock } }
  },
}
