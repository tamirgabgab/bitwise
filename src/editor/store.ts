import { create } from 'zustand'
import {
  addComponent,
  connectEnds,
  copyItems,
  deleteItems,
  emptyDoc,
  moveItems,
  pasteFragment,
  rotateComponents,
} from './document.ts'
import type { CircuitDoc, Fragment, WireEnd } from './document.ts'
import { samePoint } from './geometry.ts'
import type { Point } from './geometry.ts'
import { DEFAULT_VIEW, zoomAt } from './view.ts'
import type { View } from './view.ts'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** A part picked from the palette that has not been dropped yet. */
export interface Placing {
  readonly type: string
  /** Grid position under the pointer, or null while it is off the canvas. */
  readonly pos: Point | null
}

const HISTORY_LIMIT = 200
const THEME_KEY = 'cedar-logic.theme'

function loadTheme(): ThemeChoice {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable; the system theme is a fine fallback.
  }
  return 'system'
}

function saveTheme(theme: ThemeChoice): void {
  try {
    if (theme === 'system') globalThis.localStorage?.removeItem(THEME_KEY)
    else globalThis.localStorage?.setItem(THEME_KEY, theme)
  } catch {
    // Not being able to remember the theme is harmless.
  }
}

/**
 * Puts the choice on the page, where the CSS picks it up. Done here and not
 * in a React effect so the colors are already in place when subscribers run.
 */
function applyTheme(theme: ThemeChoice): void {
  const root = globalThis.document?.documentElement
  if (!root) return
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

function existingIds(doc: CircuitDoc, ids: Iterable<string>): Set<string> {
  const kept = new Set<string>()
  for (const id of ids) {
    if (id in doc.components || id in doc.junctions || id in doc.wires) kept.add(id)
  }
  return kept
}

export interface EditorState {
  readonly doc: CircuitDoc
  readonly past: readonly CircuitDoc[]
  readonly future: readonly CircuitDoc[]
  readonly selection: ReadonlySet<string>
  readonly view: View
  readonly clipboard: Fragment | null
  /** How many times the current clipboard was pasted, to stagger the copies. */
  readonly pasteCount: number
  readonly placing: Placing | null
  readonly theme: ThemeChoice

  /** Adds a part at `pos`, nudging it along if that exact spot is taken. */
  addComponent(type: string, pos: Point): void
  /** Draws a wire between two ends. Returns false if it could not be made. */
  connect(a: WireEnd, b: WireEnd): boolean
  moveSelection(dx: number, dy: number): void
  rotateSelection(): void
  deleteSelection(): void
  setSelection(ids: Iterable<string>): void
  toggleSelected(id: string): void
  selectAll(): void
  undo(): void
  redo(): void
  copy(): void
  cut(): void
  paste(): void
  setView(view: View): void
  zoomAt(factor: number, x: number, y: number): void
  setPlacing(placing: Placing | null): void
  setTheme(theme: ThemeChoice): void
}

type Data = Pick<
  EditorState,
  'doc' | 'past' | 'future' | 'selection' | 'view' | 'clipboard' | 'pasteCount' | 'placing'
>

function initialData(): Data {
  return {
    doc: emptyDoc(),
    past: [],
    future: [],
    selection: new Set(),
    view: DEFAULT_VIEW,
    clipboard: null,
    pasteCount: 0,
    placing: null,
  }
}

export const useEditor = create<EditorState>()((set, get) => {
  /** Makes `doc` current and records the previous one for undo. */
  const commit = (doc: CircuitDoc, selection?: Iterable<string>): void => {
    const state = get()
    if (doc === state.doc) return
    set({
      doc,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      selection: selection ? new Set(selection) : existingIds(doc, state.selection),
    })
  }

  return {
    ...initialData(),
    theme: loadTheme(),

    addComponent(type, pos) {
      const { doc } = get()
      let spot = pos
      const taken = (p: Point) =>
        Object.values(doc.components).some((component) => samePoint(component.pos, p))
      while (taken(spot)) spot = { x: spot.x + 1, y: spot.y + 1 }
      const added = addComponent(doc, type, spot)
      commit(added.doc, [added.id])
    },

    connect(a, b) {
      const next = connectEnds(get().doc, a, b)
      if (!next) return false
      commit(next)
      return true
    },

    moveSelection(dx, dy) {
      const { doc, selection } = get()
      commit(moveItems(doc, selection, dx, dy))
    },

    rotateSelection() {
      const { doc, selection } = get()
      commit(rotateComponents(doc, selection))
    },

    deleteSelection() {
      const { doc, selection } = get()
      commit(deleteItems(doc, selection))
    },

    setSelection(ids) {
      set({ selection: existingIds(get().doc, ids) })
    },

    toggleSelected(id) {
      const selection = new Set(get().selection)
      if (!selection.delete(id)) selection.add(id)
      set({ selection: existingIds(get().doc, selection) })
    },

    selectAll() {
      const { doc } = get()
      set({
        selection: new Set([
          ...Object.keys(doc.components),
          ...Object.keys(doc.junctions),
          ...Object.keys(doc.wires),
        ]),
      })
    },

    undo() {
      const { doc, past, future, selection } = get()
      const previous = past[past.length - 1]
      if (!previous) return
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future],
        selection: existingIds(previous, selection),
      })
    },

    redo() {
      const { doc, past, future, selection } = get()
      const next = future[0]
      if (!next) return
      set({
        doc: next,
        past: [...past, doc],
        future: future.slice(1),
        selection: existingIds(next, selection),
      })
    },

    copy() {
      const { doc, selection } = get()
      const fragment = copyItems(doc, selection)
      if (fragment.components.length === 0 && fragment.junctions.length === 0) return
      set({ clipboard: fragment, pasteCount: 0 })
    },

    cut() {
      get().copy()
      get().deleteSelection()
    },

    paste() {
      const { doc, clipboard, pasteCount } = get()
      if (!clipboard) return
      const shift = 2 * (pasteCount + 1)
      const pasted = pasteFragment(doc, clipboard, { x: shift, y: shift })
      commit(pasted.doc, pasted.ids)
      set({ pasteCount: pasteCount + 1 })
    },

    setView(view) {
      set({ view })
    },

    zoomAt(factor, x, y) {
      set({ view: zoomAt(get().view, factor, x, y) })
    },

    setPlacing(placing) {
      set({ placing })
    },

    setTheme(theme) {
      saveTheme(theme)
      applyTheme(theme)
      set({ theme })
    },
  }
})

applyTheme(useEditor.getState().theme)

/** Puts the editor back to an empty drawing. Meant for tests. */
export function resetEditor(): void {
  useEditor.setState(initialData())
}
