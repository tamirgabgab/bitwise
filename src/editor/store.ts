import { create } from 'zustand'
import {
  MAX_RADIX,
  MIN_RADIX,
  defaultPresetId,
  findPreset,
  presetAvailable,
} from '../core/index.ts'
import {
  addComponent,
  connectEnds,
  copyItems,
  deleteItems,
  emptyDoc,
  moveItems,
  pasteFragment,
  rotateComponents,
  setComponentParams,
} from './document.ts'
import type { CircuitDoc, Fragment, WireEnd } from './document.ts'
import { samePoint } from './geometry.ts'
import type { Point } from './geometry.ts'
import { DEFAULT_PALETTE } from './valueStyle.ts'
import { DEFAULT_VIEW, zoomAt } from './view.ts'
import type { View } from './view.ts'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** A part picked from the palette that has not been dropped yet. */
export interface Placing {
  readonly type: string
  /** Grid position under the pointer, or null while it is off the canvas. */
  readonly pos: Point | null
}

/**
 * What belongs to the project as a whole rather than to one part: the radix
 * its wires work in, the gates it is built from, and how values are shown.
 */
export interface ProjectSettings {
  /** How many values a wire can carry: 2 for ordinary binary logic. */
  readonly radix: number
  /** Id of the gate kit (see `GATE_PRESETS`) the palette offers. */
  readonly preset: string
  /** Offer every gate, whatever the kit. */
  readonly sandbox: boolean
  /** Wire colors for the values 0 to 9. */
  readonly palette: readonly string[]
  /** At radix 2, use the classic off and on colors instead of the palette. */
  readonly classicColors: boolean
  /** Write each output's value next to its pin. */
  readonly showDigits: boolean
  /** Write the values of an odd radix around zero: -1, 0, +1. */
  readonly balanced: boolean
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  radix: 2,
  preset: defaultPresetId(2),
  sandbox: false,
  palette: DEFAULT_PALETTE,
  classicColors: true,
  showDigits: false,
  balanced: false,
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
  readonly settings: ProjectSettings

  /** Adds a part at `pos`, nudging it along if that exact spot is taken. */
  addComponent(type: string, pos: Point): void
  /** Draws a wire between two ends. Returns false if it could not be made. */
  connect(a: WireEnd, b: WireEnd): boolean
  moveSelection(dx: number, dy: number): void
  rotateSelection(): void
  deleteSelection(): void
  /** Changes parameters of one part, such as its number of inputs. */
  setParams(id: string, changes: Readonly<Record<string, number>>): void
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
  /**
   * Changes the radix. The kit changes with it if it does not fit the new
   * radix, and digits on wires turn on when there are more than two values.
   */
  setRadix(radix: number): void
  /** Picks a gate kit. Ignored if the kit does not fit the radix. */
  setPreset(id: string): void
  updateSettings(
    changes: Partial<Pick<ProjectSettings, 'sandbox' | 'classicColors' | 'showDigits' | 'balanced'>>,
  ): void
  setPaletteColor(value: number, color: string): void
  resetPalette(): void
}

type Data = Pick<
  EditorState,
  | 'doc'
  | 'past'
  | 'future'
  | 'selection'
  | 'view'
  | 'clipboard'
  | 'pasteCount'
  | 'placing'
  | 'settings'
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
    settings: DEFAULT_SETTINGS,
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

    setParams(id, changes) {
      commit(setComponentParams(get().doc, id, changes))
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

    setRadix(radix) {
      const { settings } = get()
      if (!Number.isInteger(radix) || radix < MIN_RADIX || radix > MAX_RADIX) return
      if (radix === settings.radix) return
      const current = findPreset(settings.preset)
      const preset =
        current && presetAvailable(current, radix) ? current.id : defaultPresetId(radix)
      // Crossing between two values and more is when the look should follow.
      const crossed = radix > 2 !== settings.radix > 2
      const showDigits = crossed ? radix > 2 : settings.showDigits
      set({ settings: { ...settings, radix, preset, showDigits } })
    },

    setPreset(id) {
      const { settings } = get()
      const preset = findPreset(id)
      if (!preset || !presetAvailable(preset, settings.radix)) return
      set({ settings: { ...settings, preset: id } })
    },

    updateSettings(changes) {
      set({ settings: { ...get().settings, ...changes } })
    },

    setPaletteColor(value, color) {
      const { settings } = get()
      if (value < 0 || value >= settings.palette.length) return
      const palette = [...settings.palette]
      palette[value] = color
      set({ settings: { ...settings, palette } })
    },

    resetPalette() {
      set({ settings: { ...get().settings, palette: DEFAULT_PALETTE } })
    },
  }
})

applyTheme(useEditor.getState().theme)

/** Puts the editor back to an empty drawing. Meant for tests. */
export function resetEditor(): void {
  useEditor.setState(initialData())
}
