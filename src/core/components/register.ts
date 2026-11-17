import type { ComponentDef, ParamSpec } from '../component.ts'
import { MAX_WIDTH, X, Z, filled, stepSignal } from '../signal.ts'
import type { Digit, Signal } from '../signal.ts'
import { clockLevel } from './sequential.ts'
import type { ClockLevel } from './sequential.ts'

/*
 * Memory a whole bus wide. Both parts follow the rules of the flip-flops:
 * they act on the rising edge of `clk`, a control input is on only at the
 * top value, Reset acts at once, and the stored value starts at 0. An
 * unknown control input makes the output unknown without destroying what
 * is stored.
 */

const widthParam: ParamSpec = { default: 4, min: 1, max: MAX_WIDTH }

export interface RegisterState {
  readonly q: Signal
  /** Where the clock stood at the last evaluation, to tell an edge. */
  readonly clock: ClockLevel
}

/** True, false, or undefined when the input is unknown. */
type Flag = boolean | undefined

/** A control input: on at the top value. `floating` says what unattached means. */
function flag(digit: Digit, radix: number, floating: boolean): Flag {
  if (digit === Z) return floating
  if (digit < 0 || digit >= radix) return undefined
  return digit === radix - 1
}

/** A data bus as it is stored: a digit that is not a real value becomes X. */
function taken(signal: Signal, radix: number): Signal {
  return signal.map((digit) => (digit < 0 || digit >= radix ? X : digit))
}

/** Where two candidates for the stored value agree, that digit; elsewhere X. */
function either(a: Signal, b: Signal): Signal {
  return a.map((digit, position) => (digit === b[position] ? digit : X))
}

/**
 * What the part shows and keeps once Reset has had its say. `clocked` is the
 * value after the clock edge, if there was one.
 */
function afterReset(
  clocked: Signal,
  reset: Flag,
  clock: ClockLevel,
): { readonly shown: Signal; readonly state: RegisterState } {
  const zero = filled(clocked.length, 0)
  if (reset === true) return { shown: zero, state: { q: zero, clock } }
  if (reset === false) return { shown: clocked, state: { q: clocked, clock } }
  return { shown: either(clocked, zero), state: { q: clocked, clock } }
}

/**
 * A register: on the rising edge of `clk` it takes the value of `d`, if
 * `en` is on. `en` left unattached counts as on, `reset` as off.
 */
export const register: ComponentDef<RegisterState> = {
  type: 'register',
  params: { width: widthParam },
  ports({ width }) {
    return [
      { name: 'd', direction: 'in', width },
      { name: 'clk', direction: 'in', width: 1 },
      { name: 'en', direction: 'in', width: 1 },
      { name: 'reset', direction: 'in', width: 1 },
      { name: 'q', direction: 'out', width },
    ]
  },
  initialState({ width }) {
    return { q: filled(width, 0), clock: 'unknown' }
  },
  evaluate(inputs, _params, state, { radix }) {
    const clock = clockLevel(inputs.clk[0], radix)
    const edge = state.clock === 'low' && clock === 'high'
    const enabled = flag(inputs.en[0], radix, true)
    const loaded = taken(inputs.d, radix)
    // With `en` unknown the part may or may not have loaded: the old value
    // is kept, and the output shows only what both cases agree on.
    const unsure = edge && enabled === undefined
    const kept = edge && enabled === true ? loaded : state.q
    const reset = flag(inputs.reset[0], radix, false)
    const { shown, state: next } = afterReset(kept, reset, clock)
    const q = unsure && reset !== true ? either(shown, loaded) : shown
    return { outputs: { q }, state: next }
  },
}

/**
 * A counter: on the rising edge of `clk` it takes the value of `d` if
 * `load` is on, and otherwise goes one up if `en` is on, from its largest
 * number back to 0. `co` gives the top value while the counter is at its
 * largest number and `en` is on, so it can enable the next counter.
 * Left unattached, `en` counts as on and `load` and `reset` as off.
 */
export const counter: ComponentDef<RegisterState> = {
  type: 'counter',
  params: { width: widthParam },
  ports({ width }) {
    return [
      { name: 'clk', direction: 'in', width: 1 },
      { name: 'en', direction: 'in', width: 1 },
      { name: 'load', direction: 'in', width: 1 },
      { name: 'd', direction: 'in', width },
      { name: 'reset', direction: 'in', width: 1 },
      { name: 'q', direction: 'out', width },
      { name: 'co', direction: 'out', width: 1 },
    ]
  },
  initialState({ width }) {
    return { q: filled(width, 0), clock: 'unknown' }
  },
  evaluate(inputs, { width }, state, { radix }) {
    const clock = clockLevel(inputs.clk[0], radix)
    const edge = state.clock === 'low' && clock === 'high'
    const enabled = flag(inputs.en[0], radix, true)
    const loading = flag(inputs.load[0], radix, false)
    const unsure = edge && (loading === undefined || (loading === false && enabled === undefined))
    const kept = !edge || unsure
      ? state.q
      : loading
        ? taken(inputs.d, radix)
        : enabled
          ? stepSignal(state.q, 1, radix)
          : state.q
    const reset = flag(inputs.reset[0], radix, false)
    const { shown, state: next } = afterReset(kept, reset, clock)
    // Loaded, counted or neither: with that unknown, so is the output.
    const q = unsure && reset !== true ? filled(width, X) : shown
    const known = q.every((digit) => digit >= 0)
    const full = q.every((digit) => digit === radix - 1)
    const co: Digit = !known
      ? X
      : !full
        ? 0
        : enabled === undefined
          ? X
          : enabled
            ? radix - 1
            : 0
    return { outputs: { q, co: [co] }, state: next }
  },
}
