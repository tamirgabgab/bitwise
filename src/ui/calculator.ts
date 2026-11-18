/*
 * The arithmetic behind the base calculator: reading a whole number written
 * in base n or in decimal, and writing it back in base n, in decimal and in
 * balanced form. Numbers stay within the safe integers of JavaScript.
 */

const DIGITS = '0123456789ABCDEF'

/** How a number is typed into the calculator. */
export type Written = 'radix' | 'decimal'

/**
 * The number `text` stands for, or undefined when it is no whole number in
 * that form or is too large to compute with exactly. A leading minus sign
 * is allowed, and spaces are ignored.
 */
export function readNumber(text: string, radix: number, written: Written): number | undefined {
  const clean = text.replace(/\s+/g, '').replace('−', '-').toUpperCase()
  const match = /^(-?)([0-9A-F]+)$/.exec(clean)
  if (!match) return undefined
  const base = written === 'decimal' ? 10 : radix
  let value = 0
  for (const char of match[2]) {
    const digit = DIGITS.indexOf(char)
    if (digit >= base) return undefined
    value = value * base + digit
    if (!Number.isSafeInteger(value)) return undefined
  }
  return match[1] === '-' && value !== 0 ? -value : value
}

/** `value` written in base `radix`, the most significant digit first. */
export function writeInRadix(value: number, radix: number): string {
  if (value === 0) return '0'
  let rest = Math.abs(value)
  let text = ''
  while (rest > 0) {
    text = DIGITS[rest % radix] + text
    rest = Math.floor(rest / radix)
  }
  return value < 0 ? `−${text}` : text
}

/**
 * `value` in balanced form for an odd radix: every digit lies between
 * -(n - 1) / 2 and (n - 1) / 2, so no sign is needed in front. The digits
 * are written as the app writes balanced values, +1, 0, −1, most
 * significant first. Undefined for an even radix, which has no balanced form.
 */
export function writeBalanced(value: number, radix: number): string | undefined {
  if (radix % 2 === 0) return undefined
  if (value === 0) return '0'
  const half = (radix - 1) / 2
  const digits: number[] = []
  let rest = value
  while (rest !== 0) {
    let digit = ((rest % radix) + radix) % radix
    if (digit > half) digit -= radix
    digits.unshift(digit)
    rest = (rest - digit) / radix
  }
  return digits
    .map((digit) => (digit === 0 ? '0' : digit > 0 ? `+${digit}` : `−${0 - digit}`))
    .join(' ')
}

/** One line of the calculator: a name and the number it stands for. */
export interface CalcLine {
  readonly name: string
  readonly value: number | undefined
}

/**
 * The lines the calculator shows for two numbers: each of them, their sum
 * and their product. A result too large to compute exactly is undefined.
 */
export function calcLines(a: number | undefined, b: number | undefined): CalcLine[] {
  const exact = (value: number | undefined): number | undefined =>
    value !== undefined && Number.isSafeInteger(value) ? value : undefined
  const both = a !== undefined && b !== undefined
  return [
    { name: 'A', value: a },
    { name: 'B', value: b },
    { name: 'A + B', value: both ? exact(a + b) : undefined },
    { name: 'A × B', value: both ? exact(a * b) : undefined },
  ]
}
