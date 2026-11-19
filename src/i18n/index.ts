/*
 * The words of the interface in the language the user chose.
 *
 * The key of every message is its English text, so the code reads as it
 * always did and English needs no table. A value goes into a message as
 * `{name}`, and a translation may move it: `t('Delete “{name}”?', { name })`.
 *
 * Text kept in a constant, read later by a key, is marked with `msg` where
 * it is written and translated with `t` where it is shown. Both mark a
 * message for `scanMessages`, which a test uses to check that every message
 * has a translation.
 *
 * This layer imports nothing, so every other layer may use it. Only the
 * chrome (`src/ui/language.ts`) chooses the language.
 */

/** The languages of the interface. English is the language of the code. */
export const LANGUAGES = ['en', 'he'] as const
export type Language = (typeof LANGUAGES)[number]

/** A language's messages: English text to its translation. */
export type Dictionary = Readonly<Record<string, string>>

let current: Language = 'en'
let words: Dictionary = {}

/** The language the interface speaks now. */
export function language(): Language {
  return current
}

/** Whether the interface reads from right to left. */
export function rightToLeft(): boolean {
  return current === 'he'
}

/** Speaks `next` from now on, with its messages. English needs none. */
export function setLanguage(next: Language, dictionary: Dictionary = {}): void {
  current = next
  words = next === 'en' ? {} : dictionary
}

const PLACE = /\{(\w+)\}/g

/**
 * `text` in the language of the interface, with `values` put in for their
 * places. A message with no translation is shown in English.
 */
export function t(text: string, values?: Readonly<Record<string, string | number>>): string {
  const said = Object.hasOwn(words, text) ? words[text] : text
  if (values === undefined) return said
  return said.replace(PLACE, (place, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : place,
  )
}

/** Marks `text` as a message to be translated where it is shown, with `t`. */
export function msg(text: string): string {
  return text
}

/** The places `{name}` in a message, sorted, so a translation can be checked to keep them. */
export function placesOf(text: string): string[] {
  return [...text.matchAll(PLACE)].map((match) => match[1]).sort()
}

const CALL = /\b(?:t|msg)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g

/** Reads a quoted string the way JavaScript would, for the escapes a message uses. */
function unquote(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16))
    if (escape.startsWith('u') && escape.length === 5) return String.fromCharCode(parseInt(escape.slice(1), 16))
    if (escape === 'n') return '\n'
    return escape
  })
}

/** Every message a source file asks for with `t('…')` or `msg('…')`, in order. */
export function scanMessages(source: string): string[] {
  return [...source.matchAll(CALL)].map((match) => unquote(match[1] ?? match[2] ?? match[3]))
}
