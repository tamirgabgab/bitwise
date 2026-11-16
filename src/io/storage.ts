/*
 * The copy of the project that the browser keeps between visits. Storage can
 * be missing, full or switched off, so nothing here ever throws.
 */

const PROJECT_KEY = 'cedar-logic.project'
const UNREADABLE_KEY = 'cedar-logic.project.unreadable'

/** Keeps the text of the project in the browser. Returns false if it could not. */
export function saveLocal(text: string): boolean {
  try {
    globalThis.localStorage.setItem(PROJECT_KEY, text)
    return true
  } catch {
    return false
  }
}

/** The text kept by `saveLocal`, or null if there is none. */
export function loadLocal(): string | null {
  try {
    return globalThis.localStorage.getItem(PROJECT_KEY)
  } catch {
    return null
  }
}

/**
 * Moves a saved project that could not be read out of the way, so the next
 * save does not overwrite the only copy of it.
 */
export function setAsideLocal(): void {
  try {
    const text = globalThis.localStorage.getItem(PROJECT_KEY)
    if (text === null) return
    globalThis.localStorage.setItem(UNREADABLE_KEY, text)
    globalThis.localStorage.removeItem(PROJECT_KEY)
  } catch {
    // Nothing more can be done without storage.
  }
}
