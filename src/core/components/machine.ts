import type { ComponentDef, ParamSpec, Params, PortSpec } from '../component.ts'
import { MAX_RADIX, X } from '../signal.ts'
import type { Digit, Signal } from '../signal.ts'
import { either, flag } from './register.ts'
import { clockLevel } from './sequential.ts'
import type { ClockLevel } from './sequential.ts'

/*
 * A state machine in the manner of Moore: each state gives a digit on every
 * output, and on the rising edge of `clk` the machine follows the first of
 * its rules that leaves the state it is in and whose condition the inputs
 * meet. With none it stays. State 0 is where it starts, and `reset` at the
 * top value takes it there at once.
 *
 * The machine is drawn in the editor; what the engine needs of it is kept
 * in parameters: `states`, `inputs`, `outputs` and `rules`, then for rule r
 * `r<r>from`, `r<r>to` and for each input `r<r>c<i>` (the digit it must
 * be, or -1 for any), and for state s and output k `s<s>o<k>`. Digits are
 * kept as written, so a digit the radix has no room for never matches and
 * gives X.
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

const params: Record<string, ParamSpec> = {
  states: { default: 1, min: 1, max: MAX_STATES },
  inputs: { default: 0, min: 0, max: MAX_MACHINE_INPUTS },
  outputs: { default: 1, min: 0, max: MAX_MACHINE_OUTPUTS },
  rules: { default: 0, min: 0, max: MAX_RULES },
}
const stateParam: ParamSpec = { default: 0, min: 0, max: MAX_STATES - 1 }
const digitParam: ParamSpec = { default: 0, min: 0, max: MAX_RADIX - 1 }
const whenParam: ParamSpec = { default: ANY, min: ANY, max: MAX_RADIX - 1 }
for (let rule = 0; rule < MAX_RULES; rule++) {
  params[ruleFrom(rule)] = stateParam
  params[ruleTo(rule)] = stateParam
  for (let input = 0; input < MAX_MACHINE_INPUTS; input++) params[ruleWhen(rule, input)] = whenParam
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

/** What the outputs give in a state; a digit the radix has no room for is X. */
function outputsIn(state: number, params: Params, radix: number): Signal {
  return Array.from({ length: params.outputs }, (_, output) => {
    const digit = params[stateOutput(state, output)]
    return digit < radix ? digit : X
  })
}

/**
 * The state the inputs lead to from `state`: the target of the first rule
 * that leaves it and matches, `state` when none does, or undefined when an
 * unknown input decides it.
 */
export function nextState(state: number, inputs: readonly Digit[], params: Params, radix: number): number | undefined {
  for (let rule = 0; rule < params.rules; rule++) {
    if (params[ruleFrom(rule)] !== state || params[ruleTo(rule)] >= params.states) continue
    let meets: boolean | undefined = true
    for (let input = 0; input < params.inputs && meets !== false; input++) {
      const want = params[ruleWhen(rule, input)]
      if (want === ANY) continue
      const digit = inputs[input]
      if (digit < 0 || digit >= radix) meets = undefined
      else if (digit !== want) meets = false
    }
    if (meets === undefined) return undefined
    if (meets) return params[ruleTo(rule)]
  }
  return state
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
    let shown = outputsIn(kept, params, radix)
    if (next === undefined) {
      for (let rule = 0; rule < params.rules; rule++) {
        if (params[ruleFrom(rule)] !== state.state || params[ruleTo(rule)] >= params.states) continue
        shown = either(shown, outputsIn(params[ruleTo(rule)], params, radix))
      }
    }
    const reset = flag(inputs.reset[0], radix, false)
    if (reset === true) {
      shown = outputsIn(0, params, radix)
    } else if (reset === undefined) {
      shown = either(shown, outputsIn(0, params, radix))
    }
    const outputs: Record<string, Signal> = {}
    shown.forEach((digit, output) => {
      outputs[`out${output}`] = [digit]
    })
    return { outputs, state: { state: reset === true ? 0 : kept, clock } }
  },
}
