/**
 * Four-valued logic for a single wire bit.
 *
 * - Low / High: a driven 0 or 1.
 * - Unknown (X): driven, but the value cannot be determined.
 * - HiZ (Z): not driven at all (floating).
 */
export const Bit = { Low: 0, High: 1, Unknown: 2, HiZ: 3 } as const
export type Bit = (typeof Bit)[keyof typeof Bit]

/**
 * The value on a wire or pin. A plain wire has one bit; a bus has several.
 * Index 0 is the least significant bit.
 */
export type Signal = readonly Bit[]

/** Widest bus the simulator accepts. */
export const MAX_WIDTH = 64

/** A signal of `width` bits, all set to `bit`. */
export function filled(width: number, bit: Bit): Signal {
  return new Array<Bit>(width).fill(bit)
}

export function signalsEqual(a: Signal, b: Signal): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const CHAR_TO_BIT: Readonly<Record<string, Bit>> = {
  '0': Bit.Low,
  '1': Bit.High,
  X: Bit.Unknown,
  x: Bit.Unknown,
  Z: Bit.HiZ,
  z: Bit.HiZ,
}

const BIT_TO_CHAR = ['0', '1', 'X', 'Z'] as const

/**
 * Parses text such as "1", "10XZ" or "0110". The most significant bit comes
 * first, like a written binary number.
 */
export function parseSignal(text: string): Signal {
  if (text.length === 0) throw new Error('A signal needs at least one bit')
  const bits: Bit[] = []
  for (let i = text.length - 1; i >= 0; i--) {
    const bit = CHAR_TO_BIT[text[i]]
    if (bit === undefined) {
      throw new Error(`Invalid signal character "${text[i]}" in "${text}"`)
    }
    bits.push(bit)
  }
  return bits
}

/** The inverse of `parseSignal`: most significant bit first. */
export function formatSignal(signal: Signal): string {
  let text = ''
  for (let i = signal.length - 1; i >= 0; i--) text += BIT_TO_CHAR[signal[i]]
  return text
}

/*
 * Gate logic. An input that is X or Z counts as unknown, so the result is X
 * unless the other inputs already decide it (0 AND anything is 0).
 */

export function notBit(a: Bit): Bit {
  if (a === Bit.Low) return Bit.High
  if (a === Bit.High) return Bit.Low
  return Bit.Unknown
}

export function andBit(a: Bit, b: Bit): Bit {
  if (a === Bit.Low || b === Bit.Low) return Bit.Low
  if (a === Bit.High && b === Bit.High) return Bit.High
  return Bit.Unknown
}

export function orBit(a: Bit, b: Bit): Bit {
  if (a === Bit.High || b === Bit.High) return Bit.High
  if (a === Bit.Low && b === Bit.Low) return Bit.Low
  return Bit.Unknown
}

export function xorBit(a: Bit, b: Bit): Bit {
  if (a > Bit.High || b > Bit.High) return Bit.Unknown
  return a === b ? Bit.Low : Bit.High
}

export interface Resolution {
  readonly value: Signal
  /** True when two drivers force the same bit to 0 and to 1. */
  readonly conflict: boolean
}

/**
 * Works out the value of a net from everything driving it.
 *
 * Per bit: Z drivers are ignored. If nobody drives the bit it floats (Z). A 0
 * against a 1 is a conflict and reads as X. Any X driver makes the bit X.
 */
export function resolve(width: number, drivers: readonly Signal[]): Resolution {
  const value: Bit[] = []
  let conflict = false
  for (let i = 0; i < width; i++) {
    let low = false
    let high = false
    let unknown = false
    for (const driver of drivers) {
      const bit = driver[i]
      if (bit === Bit.Low) low = true
      else if (bit === Bit.High) high = true
      else if (bit === Bit.Unknown) unknown = true
    }
    if (low && high) {
      conflict = true
      value.push(Bit.Unknown)
    } else if (unknown) {
      value.push(Bit.Unknown)
    } else if (low) {
      value.push(Bit.Low)
    } else if (high) {
      value.push(Bit.High)
    } else {
      value.push(Bit.HiZ)
    }
  }
  return { value, conflict }
}
