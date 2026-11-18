import { builtinComponents, nextState, resolveParams } from '../core/index.ts'
import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { autoLayout } from './layout.ts'
import { MACHINE_TYPE, compileMachine } from './machine.ts'
import type { Machine } from './machine.ts'

/*
 * A state machine built from parts the user knows: D flip-flops keep the
 * state, and gates work out the next state and the outputs.
 *
 * State k is kept as the digits of k, so the start state, 0, is where the
 * flip-flops start and where Reset puts them. Each digit of the next state
 * and each output is a function of the inputs and the state digits, and is
 * written as a sum of products: for every value v above 0, the cubes where
 * the function is v, each an AND of literals (an input or state digit is a
 * given value) and of the constant v, and then an OR of them all. AND is
 * min and OR is max, so at radix 2 this is the usual sum of products, and
 * at any radix the largest v that holds wins.
 *
 * The cubes are found the way Quine and McCluskey taught: cubes that differ
 * in one variable and between them cover all its values merge, the ones that
 * merge no more are the prime ones, and a few of them are chosen to cover
 * the rows. A row may also be covered where it does not matter: a state code
 * no state has, or, for value v, a row whose function is above v, since the
 * OR takes the larger value there anyway.
 */

/** The most rows of inputs and state digits the conversion works through. */
export const MAX_MACHINE_ROWS = 4096

/** A product: for each variable the value it must have, or -1 for any. */
export type Cube = readonly number[]

/** Whether a row matters for a value: it must be covered, must not be, or may be. */
export type RowKind = 'on' | 'off' | 'free'

/** The digits of a number, the least significant first. */
function digitsOf(value: number, radix: number, count: number): number[] {
  const digits: number[] = []
  let rest = value
  for (let index = 0; index < count; index++) {
    digits.push(rest % radix)
    rest = Math.floor(rest / radix)
  }
  return digits
}

const covers = (cube: Cube, row: readonly number[]): boolean =>
  cube.every((value, variable) => value === -1 || value === row[variable])

/**
 * A small set of cubes that covers every row of kind `on` and no row of
 * kind `off`, over `variables` variables of `radix` values.
 */
export function minimize(variables: number, radix: number, kind: (row: readonly number[]) => RowKind): Cube[] {
  const rows = Array.from({ length: radix ** variables }, (_, index) => digitsOf(index, radix, variables))
  const on = rows.filter((row) => kind(row) === 'on')
  if (on.length === 0) return []

  // The prime cubes: merge until nothing merges.
  const primes: Cube[] = []
  let level = new Map<string, Cube>()
  for (const row of rows) if (kind(row) !== 'off') level.set(row.join(), row)
  while (level.size > 0) {
    const next = new Map<string, Cube>()
    const merged = new Set<string>()
    for (const [key, cube] of level) {
      cube.forEach((value, variable) => {
        if (value === -1) return
        const variants = Array.from({ length: radix }, (_, digit) => cube.with(variable, digit))
        if (!variants.every((variant) => level.has(variant.join()))) return
        const wider = cube.with(variable, -1)
        next.set(wider.join(), wider)
        merged.add(key)
      })
    }
    for (const [key, cube] of level) if (!merged.has(key)) primes.push(cube)
    level = next
  }

  // Cover the rows that must be covered: first the cubes that alone cover a
  // row, then each time the one that covers most of what is left.
  const chosen: Cube[] = []
  let left = on
  const take = (cube: Cube): void => {
    chosen.push(cube)
    left = left.filter((row) => !covers(cube, row))
  }
  for (const row of on) {
    const only = primes.filter((cube) => covers(cube, row))
    if (only.length === 1 && !chosen.includes(only[0])) take(only[0])
  }
  while (left.length > 0) {
    let best = primes[0]
    let most = -1
    for (const cube of primes) {
      const count = left.filter((row) => covers(cube, row)).length
      const literals = cube.filter((value) => value !== -1).length
      const bestLiterals = best.filter((value) => value !== -1).length
      if (count > most || (count === most && literals < bestLiterals)) {
        best = cube
        most = count
      }
    }
    take(best)
  }
  return chosen
}

/** How many digits keep the state of a machine with `states` states. */
export function stateDigits(states: number, radix: number): number {
  let digits = 1
  while (radix ** digits < states) digits++
  return digits
}

interface Pin {
  readonly component: string
  readonly port: string
}

/** The most inputs of one gate. */
const GATE_INPUTS = 8

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

  let doc = emptyDoc()
  let column = 0
  const place = (type: string, options: { params?: Record<string, number>; label?: string } = {}): string => {
    const added = addComponent(doc, type, { x: 6 * column++, y: 0 }, options)
    doc = added.doc
    return added.id
  }
  const connect = (from: Pin, to: Pin): void => {
    const added = addWire(doc, { kind: 'pin', ...from }, { kind: 'pin', ...to })
    if (added) doc = added.doc
  }

  const sources = machine.inputs.map((name) => ({ component: place('input', { label: name }), port: 'out' }))
  const clock = { component: place('input', { label: 'clk' }), port: 'out' }
  const reset = { component: place('input', { label: 'reset' }), port: 'out' }
  const flops = Array.from({ length: digits }, (_, digit) => {
    const id = place('dff', { label: `Q${digit}` })
    connect(clock, { component: id, port: 'clk' })
    connect(reset, { component: id, port: 'reset' })
    return id
  })
  const variablePins: Pin[] = [...sources, ...flops.map((id) => ({ component: id, port: 'q' }))]

  // Shared parts: one literal for each variable and value, one constant for each value.
  const literals = new Map<string, Pin>()
  const literal = (variable: number, value: number): Pin => {
    const key = `${variable}:${value}`
    let pin = literals.get(key)
    if (!pin) {
      const source = variablePins[variable]
      if (radix === 2 && value === 1) {
        pin = source
      } else if (radix === 2 && variable >= inputs) {
        // A flip-flop already gives its state the other way round.
        pin = { component: source.component, port: 'nq' }
      } else {
        const id = radix === 2 ? place('not') : place('is', { params: { match: value } })
        connect(source, { component: id, port: 'in' })
        pin = { component: id, port: 'out' }
      }
      literals.set(key, pin)
    }
    return pin
  }
  const constants = new Map<number, Pin>()
  const constant = (value: number): Pin => {
    let pin = constants.get(value)
    if (!pin) {
      pin = { component: place('const', { params: { value } }), port: 'out' }
      constants.set(value, pin)
    }
    return pin
  }
  // A gate of many inputs, made a tree when there are more than one gate takes.
  const gate = (type: 'and' | 'or', pins: readonly Pin[]): Pin => {
    if (pins.length === 1) return pins[0]
    const groups: Pin[] = []
    for (let start = 0; start < pins.length; start += GATE_INPUTS) {
      const group = pins.slice(start, start + GATE_INPUTS)
      if (group.length === 1) {
        groups.push(group[0])
        continue
      }
      const id = place(type, { params: { inputs: group.length } })
      group.forEach((pin, index) => connect(pin, { component: id, port: `in${index}` }))
      groups.push({ component: id, port: 'out' })
    }
    return gate(type, groups)
  }

  /**
   * The circuit of a function of `count` variables from `first` on, `value(row)`
   * giving its digit, or undefined where it does not matter.
   */
  const build = (first: number, count: number, value: (row: readonly number[]) => number | undefined): Pin => {
    const terms: Pin[] = []
    for (let level = 1; level <= top; level++) {
      const cubes = minimize(count, radix, (row) => {
        const digit = value(row)
        return digit === undefined || digit > level ? 'free' : digit === level ? 'on' : 'off'
      })
      for (const cube of cubes) {
        const pins = cube.flatMap((want, variable) => (want === -1 ? [] : [literal(first + variable, want)]))
        if (level < top) pins.push(constant(level))
        terms.push(pins.length === 0 ? constant(top) : gate('and', pins))
      }
    }
    return terms.length === 0 ? constant(0) : gate('or', terms)
  }

  // The state a row of input and state digits stands for, if any.
  const stateOf = (row: readonly number[]): number | undefined => {
    let code = 0
    for (let digit = digits - 1; digit >= 0; digit--) code = code * radix + row[inputs + digit]
    return code < machine.states.length ? code : undefined
  }

  flops.forEach((id, digit) => {
    const next = build(0, variables, (row) => {
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
    const pin = build(inputs, digits, (row) => {
      const state = stateOf([...Array<number>(inputs).fill(0), ...row])
      return state === undefined ? undefined : machine.states[state].outputs[output]
    })
    connect(pin, { component: sink, port: 'in' })
  })
  return autoLayout(doc)
}
