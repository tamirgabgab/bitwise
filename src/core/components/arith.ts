import type { ComponentDef, ParamSpec } from '../component.ts'
import { MAX_WIDTH, X, Z, filled } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Arithmetic on whole buses. A bus is read as a number in the radix, its
 * least significant digit first. A flag (carry in, carry out, the answers of
 * a comparison) is 0 or the top value, like every yes or no on a wire.
 */

const widthParam: ParamSpec = { default: 4, min: 1, max: MAX_WIDTH }

/**
 * An adder: `sum` is a + b + carry in, digit by digit in the radix, and
 * `cout` is the carry out of the top digit. `cin` counts as 1 at the top
 * value and as 0 otherwise, also when nothing is wired to it.
 *
 * An unknown digit makes the sum unknown from there upwards, but the carry
 * recovers as soon as two known digits settle it either way.
 */
export const adder: ComponentDef = {
  type: 'adder',
  params: { width: widthParam },
  ports({ width }) {
    return [
      { name: 'a', direction: 'in', width },
      { name: 'b', direction: 'in', width },
      { name: 'cin', direction: 'in', width: 1 },
      { name: 'sum', direction: 'out', width },
      { name: 'cout', direction: 'out', width: 1 },
    ]
  },
  evaluate(inputs, { width }, _state, { radix }) {
    const cin = inputs.cin[0]
    let carry: number | undefined =
      cin === Z ? 0 : cin < 0 || cin >= radix ? undefined : cin === radix - 1 ? 1 : 0
    const sum: Digit[] = []
    for (let position = 0; position < width; position++) {
      const a = inputs.a[position]
      const b = inputs.b[position]
      if (a < 0 || a >= radix || b < 0 || b >= radix) {
        sum.push(X)
        carry = undefined
      } else if (carry === undefined) {
        sum.push(X)
        // The two digits alone may already say whether there is a carry.
        carry = a + b >= radix ? 1 : a + b <= radix - 2 ? 0 : undefined
      } else {
        const total = a + b + carry
        sum.push(total % radix)
        carry = total >= radix ? 1 : 0
      }
    }
    return {
      outputs: { sum, cout: [carry === undefined ? X : carry === 1 ? radix - 1 : 0] },
    }
  },
}

/**
 * A comparator: of `lt` (a is less), `eq` and `gt` exactly one gives the top
 * value. Digits are compared from the most significant down, so an unknown
 * digit below the first difference does no harm.
 */
export const comparator: ComponentDef = {
  type: 'compare',
  params: { width: widthParam },
  ports({ width }) {
    return [
      { name: 'a', direction: 'in', width },
      { name: 'b', direction: 'in', width },
      { name: 'lt', direction: 'out', width: 1 },
      { name: 'eq', direction: 'out', width: 1 },
      { name: 'gt', direction: 'out', width: 1 },
    ]
  },
  evaluate(inputs, { width }, _state, { radix }) {
    const top = radix - 1
    for (let position = width - 1; position >= 0; position--) {
      const a = inputs.a[position]
      const b = inputs.b[position]
      if (a < 0 || a >= radix || b < 0 || b >= radix) {
        return { outputs: { lt: filled(1, X), eq: filled(1, X), gt: filled(1, X) } }
      }
      if (a !== b) return { outputs: { lt: [a < b ? top : 0], eq: [0], gt: [a > b ? top : 0] } }
    }
    return { outputs: { lt: [0], eq: [top], gt: [0] } }
  },
}
