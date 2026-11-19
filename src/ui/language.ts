import { create } from 'zustand'
import { LANGUAGES, setLanguage } from '../i18n/index.ts'
import type { Dictionary, Language } from '../i18n/index.ts'

/*
 * The language of the interface: an app preference, like the theme, kept
 * under its own storage key. Until the user picks one it follows the
 * browser. The Hebrew messages are a chunk of their own, loaded only for
 * Hebrew, and the page turns right to left with them.
 */

const LANGUAGE_KEY = 'cedar-logic.language'

/** The language the user picked, or the browser's when it is one the app speaks. */
export function preferredLanguage(): Language {
  try {
    const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY)
    if ((LANGUAGES as readonly string[]).includes(saved ?? '')) return saved as Language
  } catch {
    // Storage can be unavailable; the browser's language is a fine fallback.
  }
  const asked = globalThis.navigator?.languages ?? []
  return asked.some((tag) => /^(he|iw)\b/i.test(tag)) ? 'he' : 'en'
}

async function dictionaryOf(language: Language): Promise<Dictionary> {
  if (language === 'en') return {}
  const { hebrew } = await import('../i18n/he/index.ts')
  return hebrew
}

interface LanguageState {
  readonly language: Language
}

/** The language the chrome is drawn in. The app is drawn again from scratch when it changes. */
export const useLanguageStore = create<LanguageState>(() => ({ language: 'en' }))

/** Speaks `language`: loads its messages, turns the page and draws the app again. */
export async function speak(language: Language): Promise<void> {
  const dictionary = await dictionaryOf(language)
  setLanguage(language, dictionary)
  const root = document.documentElement
  root.lang = language
  root.dir = language === 'he' ? 'rtl' : 'ltr'
  useLanguageStore.setState({ language })
}

/** Speaks `language` from now on, and remembers it. */
export async function chooseLanguage(language: Language): Promise<void> {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_KEY, language)
  } catch {
    // Not being able to remember the language is harmless.
  }
  await speak(language)
}
