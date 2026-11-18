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
