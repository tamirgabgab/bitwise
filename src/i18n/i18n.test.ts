import { afterEach, describe, expect, it } from 'vitest'
import { HEBREW_PARTS, hebrew } from './he/index.ts'
import { msg, placesOf, scanMessages, setLanguage, t } from './index.ts'

/** Every source file of the app outside this folder, by its path. */
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx', '!./**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
)

/** Every message the app asks for, with the first file that asks for it. */
function messages(): Map<string, string> {
  const found = new Map<string, string>()
  for (const [path, source] of Object.entries(SOURCES)) {
    for (const message of scanMessages(source)) if (!found.has(message)) found.set(message, path)
  }
  return found
}

afterEach(() => setLanguage('en'))

describe('t', () => {
  it('gives the English text while the interface speaks English', () => {
    expect(t('Delete “{name}”?', { name: 'top' })).toBe('Delete “top”?')
    expect(msg('Buffer')).toBe('Buffer')
  })

  it('gives the translation, with the values where the translation puts them', () => {
    setLanguage('he', { 'Delete “{name}”?': 'למחוק את “{name}”?', '{a} of {b}': '{b} מתוך {a}' })
    expect(t('Delete “{name}”?', { name: 'top' })).toBe('למחוק את “top”?')
    expect(t('{a} of {b}', { a: 1, b: 2 })).toBe('2 מתוך 1')
    // A message without a translation stays in English, and a place nobody filled stays as it is.
    expect(t('Open {what}', {})).toBe('Open {what}')
  })

  it('reads a key from the dictionary only as its own field', () => {
    setLanguage('he', {})
    expect(t('constructor')).toBe('constructor')
    expect(t('__proto__')).toBe('__proto__')
  })
})

describe('scanMessages', () => {
  it('finds the messages of t and msg in every kind of quote', () => {
    const source = [
      `t('Plain') + t("Double") + t(\`Back\`)`,
      `msg('It\\'s') + t('Line\\nbreak', { a })`,
      `const width = t2('no') + at('no') + t(name)`,
    ].join('\n')
    expect(scanMessages(source)).toEqual(['Plain', 'Double', 'Back', "It's", 'Line\nbreak'])
  })
})

describe('the Hebrew interface', () => {
  it('has a translation for every message the app asks for', () => {
    const missing = [...messages()].filter(([message]) => !Object.hasOwn(hebrew, message))
    expect(missing.map(([message, path]) => `${path}: ${message}`)).toEqual([])
  })

  it('keeps no translation the app no longer asks for', () => {
    const asked = messages()
    expect(Object.keys(hebrew).filter((message) => !asked.has(message))).toEqual([])
  })

  it('keeps the places of every message', () => {
    const changed = Object.entries(hebrew).filter(
      ([message, said]) => placesOf(message).join() !== placesOf(said).join(),
    )
    expect(changed).toEqual([])
  })

  it('translates each message in one dictionary only', () => {
    const seen = new Map<string, string>()
    const twice: string[] = []
    for (const [part, dictionary] of Object.entries(HEBREW_PARTS)) {
      for (const message of Object.keys(dictionary)) {
        if (seen.has(message)) twice.push(`${message} (${seen.get(message)}, ${part})`)
        else seen.set(message, part)
      }
    }
    expect(twice).toEqual([])
  })

  it('writes a template message without code in it', () => {
    // `t(\`…${x}…\`)` would look up a different key for every value.
    const coded = Object.entries(SOURCES).filter(([, source]) => /\b(?:t|msg)\(\s*`[^`]*\$\{/.test(source))
    expect(coded.map(([path]) => path)).toEqual([])
  })
})
