import { builtinComponents, nextState, resolveParams } from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import { autoLayout } from './layout.ts'
import { MACHINE_TYPE, compileMachine } from './machine.ts'
import type { Machine } from './machine.ts'
import { digitsOf, gateBuilder } from './sumOfProducts.ts'
import type { Variable } from './sumOfProducts.ts'

export { minimize } from './sumOfProducts.ts'
export type { Cube, RowKind } from './sumOfProducts.ts'

/*
 * A state machine built from parts the user knows: D flip-flops keep the
 * state, and gates work out the next state and the outputs.
 *
 * State k is kept as the digits of k, so the start state, 0, is where the
 * flip-flops start and where Reset puts them. Each digit of the next state
 * and each output is a function of the inputs and the state digits, built as
 * a sum of products (`sumOfProducts.ts`). A state code no state has is a row
 * that does not matter.
 */

/** The most rows of inputs and state digits the conversion works through. */
export const MAX_MACHINE_ROWS = 4096

/** How many digits keep the state of a machine with `states` states. */
export function stateDigits(states: number, radix: number): number {
  let digits = 1
  while (radix ** digits < states) digits++
  return digits
}

/**
 * The machine built from D flip-flops and gates, as the drawing of a
 * circuit: a switch for each input and for `clk` and `reset`, an output
 * part for each output, all named as in the machine. A message for the
 * user when it cannot be built.
 */
export function machineCircuit(machine: Machine, radix: number): CircuitDoc | string {
  const top = radix - 1
  const hex = (digit: number): string => digit.toString(16).toUpperCase()
  for (const state of machine.states) {
    const output = state.outputs.findIndex((digit) => digit > top)
    if (output !== -1) {
      return `State “${state.name}” gives ${machine.outputs[output]} the digit ${hex(state.outputs[output])}, which radix ${radix} has no room for.`
    }
  }
  const inputs = machine.inputs.length
  const digits = stateDigits(machine.states.length, radix)
  const variables = inputs + digits
  if (radix ** variables > MAX_MACHINE_ROWS) {
    return `This machine has ${radix ** variables} rows of inputs and states, and gates are built for at most ${MAX_MACHINE_ROWS}. Give it fewer inputs or states.`
  }
  const params = resolveParams(builtinComponents.get(MACHINE_TYPE), compileMachine(machine))

  const builder = gateBuilder(radix)
  const { place, connect } = builder
  const sources = machine.inputs.map((name) => ({ component: place('input', { label: name }), port: 'out' }))
  const clock = { component: place('input', { label: 'clk' }), port: 'out' }
  const reset = { component: place('input', { label: 'reset' }), port: 'out' }
  const flops = Array.from({ length: digits }, (_, digit) => {
    const id = place('dff', { label: `Q${digit}` })
    connect(clock, { component: id, port: 'clk' })
    connect(reset, { component: id, port: 'reset' })
    return id
  })
  const all: Variable[] = [
    ...sources.map((pin) => ({ pin })),
    // A flip-flop already gives its state the other way round.
    ...flops.map((id) => ({ pin: { component: id, port: 'q' }, inverted: { component: id, port: 'nq' } })),
  ]

  // The state a row of input and state digits stands for, if any.
  const stateOf = (row: readonly number[]): number | undefined => {
    let code = 0
    for (let digit = digits - 1; digit >= 0; digit--) code = code * radix + row[inputs + digit]
    return code < machine.states.length ? code : undefined
  }

  flops.forEach((id, digit) => {
    const next = builder.build(all, (row) => {
      const state = stateOf(row)
      if (state === undefined) return undefined
      const target = nextState(state, row.slice(0, inputs), params, radix) ?? state
      return digitsOf(target, radix, digits)[digit]
    })
    connect(next, { component: id, port: 'd' })
  })
  machine.outputs.forEach((name, output) => {
    const sink = place('output', { label: name })
    // An output depends on the state alone: its rows are the state digits.
    const pin = builder.build(all.slice(inputs), (row) => {
      const state = stateOf([...Array<number>(inputs).fill(0), ...row])
      return state === undefined ? undefined : machine.states[state].outputs[output]
    })
    connect(pin, { component: sink, port: 'in' })
  })
  return autoLayout(builder.doc())
}
