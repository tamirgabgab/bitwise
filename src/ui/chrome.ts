import { create } from 'zustand'
import { canvasRuntime } from '../editor/index.ts'
import type { Point } from '../editor/index.ts'
import { withRecent } from './paletteModel.ts'

/*
 * The state of the app's own chrome: which window is open over the app,
 * and what the palette remembers. None of it belongs to the project, so it
 * is kept apart from the editor and saved under its own key.
 */

/** A window over the app. Only one is open at a time. */
export type Overlay = 'commands' | 'shortcuts' | 'tour' | 'projects' | 'calculator' | 'history'

interface ChromeState {
  readonly overlay: Overlay | null
  /** What the command search starts with when it opens. */
  readonly commandQuery: string
  /**
   * Set when the search was opened to add a part: it lists only parts, and
   * puts the one picked at `at`, or mid-canvas when that is null.
   */
  readonly quickAdd: { readonly at: Point | null } | null
  /** The logic settings panel beside the canvas. */
  readonly settingsOpen: boolean
  /** The strip of problems under the canvas. Not kept from one visit to the next. */
  readonly problemsOpen: boolean
  /** Ids of the palette sections that are folded away. */
  readonly collapsed: readonly string[]
  /** Types of the parts placed last, the latest first. */
  readonly recent: readonly string[]
  /** The height the timing diagram was dragged to, or null for its own. */
  readonly timingHeight: number | null
  /** True once the tour of a first visit has been shown. */
  readonly tourDone: boolean

  openCommands(query?: string): void
  openQuickAdd(at: Point | null): void
  openShortcuts(): void
  openProjects(): void
  openCalculator(): void
  openHistory(): void
  startTour(): void
  endTour(): void
  closeOverlay(): void
  setSettingsOpen(open: boolean): void
  setProblemsOpen(open: boolean): void
  toggleSection(id: string): void
  noteUsed(type: string): void
  setTimingHeight(height: number | null): void
}

const KEY = 'cedar-logic.chrome'

type Kept = Pick<ChromeState, 'collapsed' | 'recent' | 'timingHeight' | 'tourDone'>

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 32) : []
}

function load(): Kept {
  try {
    const stored = globalThis.localStorage?.getItem(KEY)
    if (stored) {
      const data = JSON.parse(stored) as Record<string, unknown>
      const height = data.timingHeight
      return {
        collapsed: strings(data.collapsed),
        recent: strings(data.recent),
        timingHeight: typeof height === 'number' && height > 0 ? height : null,
        tourDone: data.tourDone === true,
      }
    }
  } catch {
    // Storage can be unavailable or hold something else; start fresh.
  }
  return { collapsed: [], recent: [], timingHeight: null, tourDone: false }
}

function save({ collapsed, recent, timingHeight, tourDone }: Kept): void {
  try {
    globalThis.localStorage?.setItem(
      KEY,
      JSON.stringify({ collapsed, recent, timingHeight, tourDone }),
    )
  } catch {
    // Not being able to remember the palette is harmless.
  }
}

export const useChrome = create<ChromeState>()((set, get) => ({
  overlay: null,
  commandQuery: '',
  quickAdd: null,
  settingsOpen: false,
  problemsOpen: false,
  ...load(),

  openCommands(query = '') {
    set({ overlay: 'commands', commandQuery: query, quickAdd: null })
  },
  openQuickAdd(at) {
    set({ overlay: 'commands', commandQuery: '', quickAdd: { at } })
  },
  openShortcuts() {
    set({ overlay: 'shortcuts' })
  },
  openProjects() {
    set({ overlay: 'projects' })
  },
  openCalculator() {
    set({ overlay: 'calculator' })
  },
  openHistory() {
    set({ overlay: 'history' })
  },
  startTour() {
    // Seen once is enough: it does not come back by itself after this.
    set({ overlay: 'tour', tourDone: true })
    save(get())
  },
  endTour() {
    if (get().overlay === 'tour') set({ overlay: null })
  },
  closeOverlay() {
    set({ overlay: null })
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen })
  },
  setProblemsOpen(problemsOpen) {
    set({ problemsOpen })
  },
  toggleSection(id) {
    const { collapsed } = get()
    set({
      collapsed: collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id],
    })
    save(get())
  },
  noteUsed(type) {
    set({ recent: withRecent(get().recent, type) })
    save(get())
  },
  setTimingHeight(timingHeight) {
    set({ timingHeight })
    save(get())
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
    const { overlay, openCommands, openQuickAdd, openShortcuts, closeOverlay } =
      useChrome.getState()
    const command = event.ctrlKey || event.metaKey
    if (command && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
      event.preventDefault()
      if (overlay === 'commands') closeOverlay()
      else openCommands()
      return
    }
    // Shift and the slash key: the question mark, on any layout. The slash
    // key alone adds a part where the pointer is.
    if (event.code === 'Slash' && !command && !event.altKey) {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return
      event.preventDefault()
      if (event.shiftKey) openShortcuts()
      else openQuickAdd(canvasRuntime.current?.pointerGrid() ?? null)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
