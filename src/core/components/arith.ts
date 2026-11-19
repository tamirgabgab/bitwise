import type { ComponentDef, ParamSpec } from '../component.ts'
import { MAX_WIDTH, X, Z, filled } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Arithmetic on whole buses. A bus is read as a number in the radix, its
 * least significant digit first. A flag (carry in, carry out, the answers of
 * a comparison) is 0 or the top value, like every yes or no on a wire.
 */

const widthParam: ParamSpec = { default: 4, min: 1, max: MAX_WIDTH }

const known = (digit: Digit, radix: number): boolean => digit >= 0 && digit < radix

/** A carry or borrow in: 1 at the top value, 0 otherwise or unattached, unknown for X. */
function flagIn(digit: Digit, radix: number): number | undefined {
  if (digit === Z) return 0
  if (!known(digit, radix)) return undefined
  return digit === radix - 1 ? 1 : 0
}

/** A flag out: 0 or the top value, X when unknown. */
const flagOut = (flag: number | undefined, radix: number): Digit[] => [
  flag === undefined ? X : flag === 1 ? radix - 1 : 0,
]

/** a + b + carry, digit by digit; the carry is undefined once it cannot be told. */
function addDigits(
  a: readonly Digit[],
  b: readonly Digit[],
  carryIn: number | undefined,
  radix: number,
): { digits: Digit[]; carry: number | undefined } {
  let carry = carryIn
  const digits: Digit[] = []
  for (let position = 0; position < a.length; position++) {
    const x = a[position]
    const y = b[position]
    if (!known(x, radix) || !known(y, radix)) {
      digits.push(X)
      carry = undefined
    } else if (carry === undefined) {
      digits.push(X)
      // The two digits alone may already say whether there is a carry.
      carry = x + y >= radix ? 1 : x + y <= radix - 2 ? 0 : undefined
    } else {
      const total = x + y + carry
      digits.push(total % radix)
      carry = total >= radix ? 1 : 0
    }
  }
  return { digits, carry }
}

/** a − b − borrow, digit by digit; the borrow out is 1 when b and the borrow were more than a. */
function subtractDigits(
  a: readonly Digit[],
  b: readonly Digit[],
  borrowIn: number | undefined,
  radix: number,
): { digits: Digit[]; borrow: number | undefined } {
  let borrow = borrowIn
  const digits: Digit[] = []
  for (let position = 0; position < a.length; position++) {
    const x = a[position]
    const y = b[position]
    if (!known(x, radix) || !known(y, radix)) {
      digits.push(X)
      borrow = undefined
    } else if (borrow === undefined) {
      digits.push(X)
      // Whether to borrow is plain when the digits differ.
      borrow = x < y ? 1 : x > y ? 0 : undefined
    } else {
      const difference = x - y - borrow
      digits.push(difference < 0 ? difference + radix : difference)
      borrow = difference < 0 ? 1 : 0
    }
  }
  return { digits, borrow }
}

/** The number some digits stand for, least significant first, or undefined if one is not known. */
function numberOf(digits: readonly Digit[], radix: number): number | undefined {
  let value = 0
  for (let position = digits.length - 1; position >= 0; position--) {
    if (!known(digits[position], radix)) return undefined
    value = value * radix + digits[position]
  }
  return value
}

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
  evaluate(inputs, _params, _state, { radix }) {
    const { digits, carry } = addDigits(inputs.a, inputs.b, flagIn(inputs.cin[0], radix), radix)
    return { outputs: { sum: digits, cout: flagOut(carry, radix) } }
  },
}

/**
 * A subtractor: `diff` is a − b − borrow in, digit by digit in the radix,
 * wrapping around below 0, and `bout` is the borrow out of the top digit:
 * the top value when b and the borrow in were more than a. `bin` counts as 1
 * at the top value and as 0 otherwise, also when nothing is wired to it.
 */
export const subtractor: ComponentDef = {
  type: 'subtractor',
  params: { width: widthParam },
  ports({ width }) {
    return [
      { name: 'a', direction: 'in', width },
      { name: 'b', direction: 'in', width },
      { name: 'bin', direction: 'in', width: 1 },
      { name: 'diff', direction: 'out', width },
      { name: 'bout', direction: 'out', width: 1 },
    ]
  },
  evaluate(inputs, _params, _state, { radix }) {
    const { digits, borrow } = subtractDigits(inputs.a, inputs.b, flagIn(inputs.bin[0], radix), radix)
    return { outputs: { diff: digits, bout: flagOut(borrow, radix) } }
  },
}

/**
 * A multiplier: `p` is a × b in full, twice as wide as a and b, so nothing
 * is lost. One unknown digit leaves the whole product unknown, since every
 * digit of a meets every digit of b.
 */
export const multiplier: ComponentDef = {
  type: 'multiplier',
  params: { width: { default: 4, min: 1, max: MAX_WIDTH / 2 } },
  ports({ width }) {
    return [
      { name: 'a', direction: 'in', width },
      { name: 'b', direction: 'in', width },
      { name: 'p', direction: 'out', width: 2 * width },
    ]
  },
  evaluate(inputs, { width }, _state, { radix }) {
    const a = inputs.a
    const b = inputs.b
    if (![...a, ...b].every((digit) => known(digit, radix))) return { outputs: { p: filled(2 * width, X) } }
    // Long multiplication, a digit of b at a time.
    const product = new Array<number>(2 * width).fill(0)
    for (let j = 0; j < width; j++) {
      let carry = 0
      for (let i = 0; i < width; i++) {
        const total = product[i + j] + a[i] * b[j] + carry
        product[i + j] = total % radix
        carry = Math.floor(total / radix)
      }
      product[j + width] += carry
    }
    return { outputs: { p: product } }
  },
}

/** What the ALU does for each value of `op`. */
export const ALU_OPERATIONS = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR'] as const

/**
 * An arithmetic and logic unit: `y` is what the operation numbered by `op`
 * makes of a and b (`ALU_OPERATIONS`, from 0), digit by digit in the radix.
 * AND is the smaller digit, OR the larger, XOR the sum modulo n and NOT
 * (n − 1) − a, so at radix 2 they are the Boolean ones. SHL and SHR move a
 * one digit up or down, bringing in 0.
 *
 * `carry` is the carry out of ADD, the borrow out of SUB, or, for a shift,
 * whether the digit pushed out was not 0; the logic operations give 0.
 * `zero` is the top value when every digit of y is 0. `op` is read as a
 * number; one past the last operation makes every output X.
 */
export const alu: ComponentDef = {
  type: 'alu',
  params: { width: widthParam, select: { default: 3, min: 1, max: 4 } },
  ports({ width, select }) {
    return [
      { name: 'a', direction: 'in', width },
      { name: 'b', direction: 'in', width },
      { name: 'op', direction: 'in', width: select },
      { name: 'y', direction: 'out', width },
      { name: 'zero', direction: 'out', width: 1 },
      { name: 'carry', direction: 'out', width: 1 },
    ]
  },
  evaluate(inputs, { width }, _state, { radix }) {
    const top = radix - 1
    const a = inputs.a
    const b = inputs.b
    const op = numberOf(inputs.op, radix)
    const digitwise = (both: (x: number, y: number) => number): Digit[] =>
      a.map((x, position) => (known(x, radix) && known(b[position], radix) ? both(x, b[position]) : X))
    let y: Digit[]
    let carry: number | undefined = 0
    switch (op === undefined ? undefined : ALU_OPERATIONS[op]) {
      case 'ADD': {
        const sum = addDigits(a, b, 0, radix)
        y = sum.digits
        carry = sum.carry
        break
      }
      case 'SUB': {
        const difference = subtractDigits(a, b, 0, radix)
        y = difference.digits
        carry = difference.borrow
        break
      }
      case 'AND':
        y = digitwise(Math.min)
        break
      case 'OR':
        y = digitwise(Math.max)
        break
      case 'XOR':
        y = digitwise((x, z) => (x + z) % radix)
        break
      case 'NOT':
        y = a.map((x) => (known(x, radix) ? top - x : X))
        break
      case 'SHL':
      case 'SHR': {
        const left = op === ALU_OPERATIONS.indexOf('SHL')
        const out = left ? a[width - 1] : a[0]
        y = left ? [0, ...a.slice(0, width - 1)] : [...a.slice(1), 0]
        carry = known(out, radix) ? (out === 0 ? 0 : 1) : undefined
        break
      }
      default:
        return { outputs: { y: filled(width, X), zero: [X], carry: [X] } }
    }
    const zero = y.every((digit) => digit === 0) ? 1 : y.some((digit) => known(digit, radix) && digit !== 0) ? 0 : undefined
    return { outputs: { y, zero: flagOut(zero, radix), carry: flagOut(carry, radix) } }
  },
}

/**
 * A shifter: `out` is `in` moved by as many digits as `amt` says, read as a
 * number. `left` 1 moves it up (each digit is worth n times more), 0 down;
 * `rotate` 1 brings the digits pushed out in at the other end, 0 brings in
 * zeros. An unknown amount makes every digit unknown.
 */
export const shifter: ComponentDef = {
  type: 'shifter',
  params: {
    width: widthParam,
    select: { default: 1, min: 1, max: 4 },
    left: { default: 1, min: 0, max: 1 },
    rotate: { default: 0, min: 0, max: 1 },
  },
  ports({ width, select }) {
    return [
      { name: 'in', direction: 'in', width },
      { name: 'amt', direction: 'in', width: select },
      { name: 'out', direction: 'out', width },
    ]
  },
  evaluate(inputs, { width, left, rotate }, _state, { radix }) {
    const amount = numberOf(inputs.amt, radix)
    if (amount === undefined) return { outputs: { out: filled(width, X) } }
    const source = inputs.in.map((digit) => (known(digit, radix) ? digit : X))
    const out: Digit[] = []
    for (let position = 0; position < width; position++) {
      // The digit that lands here came from `from`.
      const from = left === 1 ? position - amount : position + amount
      if (rotate === 1) out.push(source[((from % width) + width) % width])
      else out.push(from >= 0 && from < width ? source[from] : 0)
    }
    return { outputs: { out } }
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
