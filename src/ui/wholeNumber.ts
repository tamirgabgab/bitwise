/** What came of reading a number the user typed into a stepper. */
export type WholeNumber =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string }

/** The sentence that names the values a field takes. */
export function rangeText(min: number, max: number): string {
  return `Use a whole number from ${min} to ${max}.`
}

/**
 * Reads a whole number typed into a field that takes `min` to `max`. Spaces
 * around it are ignored; anything else that is not a plain decimal number in
 * the range is refused with a sentence that says what the field takes.
 */
export function readWholeNumber(text: string, min: number, max: number): WholeNumber {
  const trimmed = text.trim()
  if (!/^\d{1,9}$/.test(trimmed)) return { ok: false, message: rangeText(min, max) }
  const value = Number(trimmed)
  if (value < min || value > max) return { ok: false, message: rangeText(min, max) }
  return { ok: true, value }
}
