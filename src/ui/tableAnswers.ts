import { X } from '../core/index.ts'
import { digitOfKey } from '../editor/index.ts'

/* How the answers of a table gate are stepped and typed in the inspector. */

/** The answer after `digit` when stepping by `step`: 0, 1, ..., n - 1, X, 0, ... */
export function nextAnswer(digit: number, step: number, radix: number): number {
  // X sits after the top value, as one more stop on the round.
  const stop = digit >= 0 && digit < radix ? digit : radix
  const next = (((stop + step) % (radix + 1)) + radix + 1) % (radix + 1)
  return next === radix ? X : next
}

/** The answer a key types: a digit, or X for the X key. Undefined for any other key. */
export function typedAnswer(code: string, radix: number): number | undefined {
  return code === 'KeyX' ? X : digitOfKey(code, radix)
}
