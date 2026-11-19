import { formatSignal, packWord, parseSignal, unpackWord } from '../core/index.ts'
import type { Digit } from '../core/index.ts'
import { t } from '../i18n/index.ts'

/*
 * The words of a ROM or RAM as the inspector writes and reads them: digits
 * of the project's radix, the most significant first, like the value of a
 * wide switch.
 */

/** An address written with `digits` digits of the radix. */
export function addressText(address: number, digits: number, radix: number): string {
  const signal: Digit[] = []
  let rest = address
  for (let index = 0; index < digits; index++) {
    signal.push(rest % radix)
    rest = Math.floor(rest / radix)
  }
  return formatSignal(signal)
}

/** A word as the memory keeps it, written out `width` digits wide. */
export function wordText(value: number, width: number, radix: number): string {
  return formatSignal(unpackWord(value, width, radix))
}

/**
 * The word a text stands for, or undefined when it is not one: up to
 * `width` digits of the radix, filled with zeros in front. A memory keeps
 * values only, so X and Z are refused.
 */
export function typedWord(text: string, width: number, radix: number): number | undefined {
  const typed = text.trim()
  if (typed === '' || typed.length > width || /[xz]/i.test(typed)) return undefined
  try {
    return packWord(parseSignal(typed.padStart(width, '0'), radix))
  } catch {
    return undefined
  }
}

/**
 * The words of a pasted text, from address 0: words apart by spaces, commas
 * or new lines. A message for the user when a word does not fit or there
 * are more words than the memory holds.
 */
export function wordsFromText(
  text: string,
  width: number,
  radix: number,
  count: number,
): readonly number[] | string {
  const pieces = text.split(/[\s,;]+/).filter((piece) => piece !== '')
  if (pieces.length === 0) return t('Write at least one word.')
  if (pieces.length > count) {
    return t('This memory holds {count} words; the text has {given}.', { count, given: pieces.length })
  }
  const words: number[] = []
  for (const piece of pieces) {
    const word = typedWord(piece, width, radix)
    if (word === undefined) {
      const shown = piece.length > 12 ? `${piece.slice(0, 11)}…` : piece
      return t('“{word}” is not a word of up to {width} digits from 0 to {top}.', {
        word: shown,
        width,
        top: (radix - 1).toString(16).toUpperCase(),
      })
    }
    words.push(word)
  }
  return words
}
