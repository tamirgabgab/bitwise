/**
 * The value of one wire position.
 *
 * A wire carries a digit from 0 to radix - 1. With a radix of 2 that is an
 * ordinary bit. Two more values exist at every radix:
 *
 * - X (unknown): driven, but the value cannot be determined.
 * - Z (high impedance): not driven at all (floating).
 */
export type Digit = number

export const X = -1
export const Z = -2

/** The names of the binary values, for code that reads better with them. */
export const Bit = { Low: 0, High: 1, Unknown: X, HiZ: Z } as const
export type Bit = (typeof Bit)[keyof typeof Bit]

/**
 * The value on a wire or pin. A plain wire has one digit; a bus has several.
 * Index 0 is the least significant digit.
 */
export type Signal = readonly Digit[]

/** Widest bus the simulator accepts. */
export const MAX_WIDTH = 64

export const MIN_RADIX = 2
/** One written character per digit (0-9, A-F) sets the upper limit. */
export const MAX_RADIX = 16

export function checkRadix(radix: number): void {
  if (!Number.isInteger(radix) || radix < MIN_RADIX || radix > MAX_RADIX) {
    throw new Error(`Radix must be an integer from ${MIN_RADIX} to ${MAX_RADIX}, got ${radix}`)
  }
}

/** True for a real digit, false for X and Z. */
export function isKnown(digit: Digit): boolean {
  return digit >= 0
}

export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false
  }
  return true
}

/** A signal of `width` digits, all set to `digit`. */
export function filled(width: number, digit: Digit): Signal {
  return new Array<Digit>(width).fill(digit)
}

export function signalsEqual(a: Signal, b: Signal): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const DIGIT_CHARS = '0123456789ABCDEF'

/** The written form of one digit: 0-9, A-F, X or Z. */
export function digitChar(digit: Digit): string {
  if (digit === Z) return 'Z'
  return DIGIT_CHARS[digit] ?? 'X'
}

function parseDigit(char: string, radix: number): Digit | undefined {
  if (char === 'X' || char === 'x') return X
  if (char === 'Z' || char === 'z') return Z
  const digit = DIGIT_CHARS.indexOf(char.toUpperCase())
  return digit >= 0 && digit < radix ? digit : undefined
}

/**
 * Parses text such as "1", "10XZ" or, with a radix of 3, "2101". The most
 * significant digit comes first, like a written number.
 */
export function parseSignal(text: string, radix = 2): Signal {
  checkRadix(radix)
  if (text.length === 0) throw new Error('A signal needs at least one digit')
  const digits: Digit[] = []
  for (let i = text.length - 1; i >= 0; i--) {
    const digit = parseDigit(text[i], radix)
    if (digit === undefined) {
      throw new Error(`Invalid signal character "${text[i]}" in "${text}" (radix ${radix})`)
    }
    digits.push(digit)
  }
  return digits
}

/** The inverse of `parseSignal`: most significant digit first. */
export function formatSignal(signal: Signal): string {
  let text = ''
  for (let i = signal.length - 1; i >= 0; i--) text += digitChar(signal[i])
  return text
}

/**
 * A signal read as a number in the radix, plus `by`, wrapping around at both
 * ends. `by` may be negative. An unknown digit makes the whole result X.
 */
export function stepSignal(signal: Signal, by: number, radix: number): Signal {
  if (signal.some((digit) => digit < 0 || digit >= radix)) return filled(signal.length, X)
  const digits: Digit[] = []
  let carry = by
  for (const digit of signal) {
    const sum = digit + carry
    const rest = ((sum % radix) + radix) % radix
    digits.push(rest)
    carry = (sum - rest) / radix
  }
  return digits
}

/*
 * Gate logic on one digit. An input that is X or Z counts as unknown, so the
 * result is X unless the other input already decides it (the smaller of 0
 * and anything is 0).
 */

/** AND at any radix: the smaller of the two. */
export function minDigit(a: Digit, b: Digit): Digit {
  if (a === 0 || b === 0) return 0
  if (a < 0 || b < 0) return X
  return Math.min(a, b)
}

/** OR at any radix: the larger of the two. */
export function maxDigit(a: Digit, b: Digit, radix: number): Digit {
  const top = radix - 1
  if (a === top || b === top) return top
  if (a < 0 || b < 0) return X
  return Math.max(a, b)
}

/** Logical NOT at any radix: 0 and radix - 1 swap, and so on inwards. */
export function mirrorDigit(a: Digit, radix: number): Digit {
  return a < 0 ? X : radix - 1 - a
}

/** Adds `by` and wraps around. With a radix of 2 and `by` 1 this is NOT. */
export function shiftDigit(a: Digit, radix: number, by = 1): Digit {
  return a < 0 ? X : (a + by) % radix
}

/** Sum modulo the radix. With a radix of 2 this is XOR. */
export function addDigit(a: Digit, b: Digit, radix: number): Digit {
  if (a < 0 || b < 0) return X
  return (a + b) % radix
}

/** Product modulo the radix. With a radix of 2 this is AND. */
export function mulDigit(a: Digit, b: Digit, radix: number): Digit {
  if (a === 0 || b === 0) return 0
  if (a < 0 || b < 0) return X
  return (a * b) % radix
}

/** radix - 1 (true) when `a` is exactly `target`, otherwise 0. */
export function isDigit(a: Digit, target: number, radix: number): Digit {
  if (a < 0) return X
  return a === target ? radix - 1 : 0
}

/* The binary gates by their usual names. */

export function notBit(a: Digit): Digit {
  return mirrorDigit(a, 2)
}

export function andBit(a: Digit, b: Digit): Digit {
  return minDigit(a, b)
}

export function orBit(a: Digit, b: Digit): Digit {
  return maxDigit(a, b, 2)
}

export function xorBit(a: Digit, b: Digit): Digit {
  return addDigit(a, b, 2)
}

export interface Resolution {
  readonly value: Signal
  /** True when two drivers force the same position to different digits. */
  readonly conflict: boolean
}

/**
 * Works out the value of a net from everything driving it.
 *
 * Per position: Z drivers are ignored. If nobody drives it, it floats (Z).
 * Two different digits are a conflict and read as X. Any X driver makes the
 * position X.
 */
export function resolve(width: number, drivers: readonly Signal[]): Resolution {
  const value: Digit[] = []
  let conflict = false
  for (let i = 0; i < width; i++) {
    let seen: Digit = Z
    let clash = false
    let unknown = false
    for (const driver of drivers) {
      const digit = driver[i]
      if (digit === X) unknown = true
      else if (digit >= 0) {
        if (seen >= 0 && seen !== digit) clash = true
        seen = digit
      }
    }
    if (clash) {
      conflict = true
      value.push(X)
    } else if (unknown) {
      value.push(X)
    } else {
      value.push(seen)
    }
  }
  return { value, conflict }
}
