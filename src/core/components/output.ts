import type { ComponentDef } from '../component.ts'
import { MAX_WIDTH } from '../signal.ts'

/**
 * A place to look at a value: a lamp or a display. It drives nothing; the
 * editor reads what arrives at its input.
 */
export const outputSink: ComponentDef = {
  type: 'output',
  params: { width: { default: 1, min: 1, max: MAX_WIDTH } },
  ports({ width }) {
    return [{ name: 'in', direction: 'in', width }]
  },
  evaluate() {
    return { outputs: {} }
  },
}

/** The most digits a number display shows. */
export const MAX_DISPLAY_DIGITS = 8

/**
 * A number display: inputs in0 (the least significant digit), in1, ... that
 * the editor shows together as one number. Like a lamp it drives nothing.
 */
export const displaySink: ComponentDef = {
  type: 'display',
  params: { digits: { default: 4, min: 1, max: MAX_DISPLAY_DIGITS } },
  ports({ digits }) {
    return Array.from({ length: digits }, (_, index) => ({
      name: `in${index}`,
      direction: 'in' as const,
      width: 1,
    }))
  },
  evaluate() {
    return { outputs: {} }
  },
}

/**
 * What a row of digits, least significant first, is worth as a number in
 * the given radix. Undefined when a digit is X or Z or does not fit.
 */
export function numberValue(digits: readonly number[], radix: number): number | undefined {
  let value = 0
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i]
    if (digit < 0 || digit >= radix) return undefined
    value = value * radix + digit
  }
  return value
}
