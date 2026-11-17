import { create } from 'zustand'
import { withRecent } from './paletteModel.ts'

/*
 * The state of the app's own chrome: which window is open over the app,
 * and what the palette remembers. None of it belongs to the project, so it
 * is kept apart from the editor and saved under its own key.
 */

/** A window over the app. Only one is open at a time. */
export type Overlay = 'commands' | 'shortcuts'

interface ChromeState {
  readonly overlay: Overlay | null
  /** What the command search starts with when it opens. */
  readonly commandQuery: string
  /** The logic settings panel beside the canvas. */
  readonly settingsOpen: boolean
  /** Ids of the palette sections that are folded away. */
  readonly collapsed: readonly string[]
  /** Types of the parts placed last, the latest first. */
  readonly recent: readonly string[]

  openCommands(query?: string): void
  openShortcuts(): void
  closeOverlay(): void
  setSettingsOpen(open: boolean): void
  toggleSection(id: string): void
  noteUsed(type: string): void
}

const KEY = 'cedar-logic.chrome'

type Kept = Pick<ChromeState, 'collapsed' | 'recent'>

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 32) : []
}

function load(): Kept {
  try {
    const stored = globalThis.localStorage?.getItem(KEY)
    if (stored) {
      const data = JSON.parse(stored) as Record<string, unknown>
      return { collapsed: strings(data.collapsed), recent: strings(data.recent) }
    }
  } catch {
    // Storage can be unavailable or hold something else; start fresh.
  }
  return { collapsed: [], recent: [] }
}

function save(kept: Kept): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Not being able to remember the palette is harmless.
  }
}

export const useChrome = create<ChromeState>()((set, get) => ({
  overlay: null,
  commandQuery: '',
  settingsOpen: false,
  ...load(),

  openCommands(query = '') {
    set({ overlay: 'commands', commandQuery: query })
  },
  openShortcuts() {
    set({ overlay: 'shortcuts' })
  },
  closeOverlay() {
    set({ overlay: null })
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen })
  },
  toggleSection(id) {
    const { collapsed, recent } = get()
    const next = collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id]
    set({ collapsed: next })
    save({ collapsed: next, recent })
  },
  noteUsed(type) {
    const { collapsed, recent } = get()
    const next = withRecent(recent, type)
    set({ recent: next })
    save({ collapsed, recent: next })
  },
}))

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Listens for the keys that open the command search and the list of
 * shortcuts. Returns a function that stops listening.
 */
export function listenForChromeKeys(): () => void {
  const onKey = (event: KeyboardEvent): void => {
    const { overlay, openCommands, openShortcuts, closeOverlay } = useChrome.getState()
    const command = event.ctrlKey || event.metaKey
    if (command && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
      event.preventDefault()
      if (overlay === 'commands') closeOverlay()
      else openCommands()
      return
    }
    // Shift and the slash key: the question mark, on any layout.
    if (event.code === 'Slash' && event.shiftKey && !command && !event.altKey) {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return
      event.preventDefault()
      openShortcuts()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
