/**
 * The digit a key types at `radix`: 0-9 on the main row or the number pad,
 * and A-F for the values ten to fifteen. Undefined for any other key, and
 * for a digit the radix has no room for. Matches on `KeyboardEvent.code`,
 * so it works on any keyboard layout.
 */
export function digitOfKey(code: string, radix: number): number | undefined {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  const letter = /^Key([A-F])$/.exec(code)
  const value = digit
    ? Number(digit[1])
    : letter
      ? 10 + letter[1].charCodeAt(0) - 'A'.charCodeAt(0)
      : undefined
  return value !== undefined && value < radix ? value : undefined
}

const DIGIT_CHARS = '0123456789ABCDEF'

/**
 * The value of a bus switch after a digit is typed over it: the digits move
 * up one place and the new one comes in at the bottom, as on a calculator.
 * `current` is the switch's value as text, the most significant digit first.
 */
export function typedBusValue(current: string | undefined, digit: number, width: number): string {
  const kept = (current ?? '').replace(/[^0-9A-F]/gi, '0').toUpperCase()
  return (kept + DIGIT_CHARS[digit]).padStart(width, '0').slice(-width)
}

/** How far the wheel must turn, in pixels, to step a switch once. */
export const WHEEL_STEP = 60

/**
 * Steps a switch with the wheel. A mouse wheel moves about 100 pixels a
 * notch, a touchpad a few at a time; both are added up, and every
 * `WHEEL_STEP` of them is one step. Up steps the value up.
 */
export class WheelSteps {
  private rest = 0
  private target: string | null = null

  /** The steps a turn of `pixels` over switch `id` makes: positive is up. */
  turn(id: string, pixels: number): number {
    if (id !== this.target) {
      this.target = id
      this.rest = 0
    }
    this.rest -= pixels
    const steps = Math.trunc(this.rest / WHEEL_STEP)
    this.rest -= steps * WHEEL_STEP
    return steps
  }
}
