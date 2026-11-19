import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'

/*
 * A function of digits built from gates as a sum of products: for every
 * value v above 0, the cubes where the function is v, each an AND of
 * literals (a variable is a given value) and of the constant v, and then an
 * OR of them all. AND is min and OR is max, so at radix 2 this is the usual
 * sum of products, and at any radix the largest v that holds wins.
 *
 * The cubes are found the way Quine and McCluskey taught: cubes that differ
 * in one variable and between them cover all its values merge, the ones that
 * merge no more are the prime ones, and a few of them are chosen to cover
 * the rows. A row may also be covered where it does not matter: a row the
 * caller marks free, or, for value v, a row whose function is above v, since
 * the OR takes the larger value there anyway.
 *
 * The state machine (`machineCircuit.ts`) and the expressions
 * (`expression.ts`) are both built this way.
 */

/** A product: for each variable the value it must have, or -1 for any. */
export type Cube = readonly number[]

/** Whether a row matters for a value: it must be covered, must not be, or may be. */
export type RowKind = 'on' | 'off' | 'free'

/** The digits of a number, the least significant first. */
export function digitsOf(value: number, radix: number, count: number): number[] {
  const digits: number[] = []
  let rest = value
  for (let index = 0; index < count; index++) {
    digits.push(rest % radix)
    rest = Math.floor(rest / radix)
  }
  return digits
}

export const covers = (cube: Cube, row: readonly number[]): boolean =>
  cube.every((value, variable) => value === -1 || value === row[variable])

/**
 * A small set of cubes that covers every row of kind `on` and no row of
 * kind `off`, over `variables` variables of `radix` values. A row lists the
 * value of each variable, the first variable first.
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

/** The cubes of each value above 0 of a function, as `minimize` finds them. */
export function sumOfProducts(
  variables: number,
  radix: number,
  value: (row: readonly number[]) => number | undefined,
): { readonly level: number; readonly cubes: readonly Cube[] }[] {
  const terms: { level: number; cubes: Cube[] }[] = []
  for (let level = 1; level < radix; level++) {
    const cubes = minimize(variables, radix, (row) => {
      const digit = value(row)
      return digit === undefined || digit > level ? 'free' : digit === level ? 'on' : 'off'
    })
    if (cubes.length > 0) terms.push({ level, cubes })
  }
  return terms
}

export interface Pin {
  readonly component: string
  readonly port: string
}

/** A variable of a function, and at radix 2 a pin that already gives it the other way round. */
export interface Variable {
  readonly pin: Pin
  readonly inverted?: Pin
}

/** The most inputs of one gate. */
const GATE_INPUTS = 8

/** Places parts in a drawing of its own and builds functions from them. */
export interface GateBuilder {
  /** The drawing as built so far. */
  doc(): CircuitDoc
  place(type: string, options?: { params?: Record<string, number>; label?: string }): string
  connect(from: Pin, to: Pin): void
  /** The circuit of a function of `variables`, `value(row)` giving its digit, or undefined where it does not matter. */
  build(variables: readonly Variable[], value: (row: readonly number[]) => number | undefined): Pin
}

/** A builder of gates at `radix`. Parts go in a row; lay the drawing out afterwards. */
export function gateBuilder(radix: number): GateBuilder {
  const top = radix - 1
  let doc = emptyDoc()
  let column = 0
  const place: GateBuilder['place'] = (type, options = {}) => {
    const added = addComponent(doc, type, { x: 6 * column++, y: 0 }, options)
    doc = added.doc
    return added.id
  }
  const connect = (from: Pin, to: Pin): void => {
    const added = addWire(doc, { kind: 'pin', ...from }, { kind: 'pin', ...to })
    if (added) doc = added.doc
  }

  // Shared parts: one literal for each variable and value, one constant for each value.
  const literals = new Map<string, Pin>()
  const literal = (variable: Variable, value: number): Pin => {
    const key = `${variable.pin.component}.${variable.pin.port}:${value}`
    let pin = literals.get(key)
    if (!pin) {
      if (radix === 2 && value === 1) {
        pin = variable.pin
      } else if (radix === 2 && variable.inverted) {
        pin = variable.inverted
      } else {
        const id = radix === 2 ? place('not') : place('is', { params: { match: value } })
        connect(variable.pin, { component: id, port: 'in' })
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

  return {
    doc: () => doc,
    place,
    connect,
    build(variables, value) {
      const terms: Pin[] = []
      for (const { level, cubes } of sumOfProducts(variables.length, radix, value)) {
        for (const cube of cubes) {
          const pins = cube.flatMap((want, index) => (want === -1 ? [] : [literal(variables[index], want)]))
          if (level < top) pins.push(constant(level))
          terms.push(pins.length === 0 ? constant(top) : gate('and', pins))
        }
      }
      return terms.length === 0 ? constant(0) : gate('or', terms)
    },
  }
}
