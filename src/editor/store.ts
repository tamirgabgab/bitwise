import { create } from 'zustand'
import {
  MAX_RADIX,
  MIN_RADIX,
  defaultPresetId,
  findPreset,
  presetAvailable,
} from '../core/index.ts'
import { alignItems, distributeItems } from './arrange.ts'
import type { AlignEdge, Axis } from './arrange.ts'
import {
  FRAME_TYPE,
  NET_TYPE,
  SUB_TYPE,
  TEXT_TYPE,
  addComponent,
  addFrame,
  addNetLabel,
  addSubcircuit,
  addText,
  bendWire,
  connectEnds,
  copyItems,
  deleteItems,
  duplicateItems,
  frameAround,
  freeNetName,
  moveItems,
  pasteFragment,
  resizeFrame,
  rotateComponents,
  setComponentDelay,
  setComponentKey,
  setComponentLabel,
  setComponentParams,
  setComponentText,
} from './document.ts'
import type { BusFormat, CircuitDoc, Fragment, Terminal, WireEnd } from './document.ts'
import { setBusFormat } from './busFormat.ts'
import { autoLayout } from './layout.ts'
import { extractCircuit } from './extract.ts'
import { changeStep, cleanNote, insertStep, removeStep } from './steps.ts'
import { placementParams } from './placement.ts'
import { applySplice, moveAndSplice, spliceTarget } from './splice.ts'
import type { InputValue, Step } from './steps.ts'
import { samePoint } from './geometry.ts'
import { docBounds } from './hitTest.ts'
import type { Point } from './geometry.ts'
import { DEFAULT_SETTINGS, emptyProject, fromProjectData } from './project.ts'
import type { LoadedProject, ProjectData, ProjectSettings } from './project.ts'
import { canPlace, cleanCircuitName, reconcileAll, subRefOf } from './subcircuit.ts'
import type { Circuits } from './subcircuit.ts'
import { DEFAULT_PALETTE } from './valueStyle.ts'
import { DEFAULT_VIEW, fitView, zoomAt } from './view.ts'
import type { View } from './view.ts'

export { DEFAULT_SETTINGS }
export type { ProjectSettings }

export type ThemeChoice = 'system' | 'light' | 'dark'

/** A part picked from the palette that has not been dropped yet. */
export interface Placing {
  readonly type: string
  /** For a named circuit (`SUB_TYPE`): the id of the circuit. */
  readonly circuit?: string
  /** Grid position under the pointer, or null while it is off the canvas. */
  readonly pos: Point | null
}

/** What a circuit keeps of its editing session while another one is open. */
interface Parked {
  readonly past: readonly CircuitDoc[]
  readonly future: readonly CircuitDoc[]
  readonly view: View
  readonly selection: ReadonlySet<string>
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
  /** The drawing of the circuit that is open. */
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

  /** Every circuit of the project. The open one is always current here too. */
  readonly circuits: Circuits
  /** The circuit ids, in the order of their tabs. */
  readonly order: readonly string[]
  /** Id of the circuit that is open. */
  readonly active: string
  readonly nextCircuit: number
  readonly parked: Readonly<Record<string, Parked>>
  /** Goes up whenever a whole project is loaded or started. */
  readonly epoch: number
  /** The switch values a loaded project came with, by circuit and part id. */
  readonly restoredInputs: Readonly<Record<string, Readonly<Record<string, InputValue>>>>
  /** Circuits that came without a view and were not on screen yet. */
  readonly unframed: ReadonlySet<string>
  /** Whether the presentation steps of the open circuit are on screen. */
  readonly stepsOpen: boolean
  /** Which step of the open circuit is being shown. */
  readonly stepIndex: number

  /**
   * Adds a part at `pos`, nudging it along if that exact spot is taken. For
   * a named circuit, `type` is `SUB_TYPE` and `circuit` says which one.
   * With `splice`, a part dropped onto a wire goes into it.
   */
  addComponent(type: string, pos: Point, circuit?: string, splice?: boolean): void
  /** Draws a wire between two ends. Returns false if it could not be made. */
  connect(a: WireEnd, b: WireEnd): boolean
  /** Moves the selection. With `splice`, one part dropped onto a wire goes into it. */
  moveSelection(dx: number, dy: number, splice?: boolean): void
  /** Drags a stretch of a wire by the junctions put in at `at`; selects them. */
  bendWire(wireId: string, at: readonly Point[], dx: number, dy: number): void
  /** Makes a second copy of the selection, that far away, and selects it. */
  duplicateSelection(dx: number, dy: number): void
  /** Lines the selected parts up on one edge or one middle line. */
  alignSelection(edge: AlignEdge): void
  /** Spaces the selected parts evenly along an axis. */
  distributeSelection(axis: Axis): void
  /**
   * Moves the selected parts into a new circuit and puts one part that
   * stands for it in their place. Returns the id of the new circuit, or
   * null when nothing selected can move.
   */
  selectionToCircuit(): string | null
  rotateSelection(): void
  deleteSelection(): void
  /** Changes parameters of one part, such as its number of inputs. */
  setParams(id: string, changes: Readonly<Record<string, number>>): void
  /** Names a part. A blank label takes the name away. */
  setLabel(id: string, label: string): void
  /** Changes what a text label says, or the title of a frame. */
  setText(id: string, text: string): void
  /** Writes the bus at `terminal` in `format`, on every wire of its net. */
  setBusFormat(terminal: Terminal, format: BusFormat): void
  /** Puts a frame around the selection and selects it. */
  frameSelection(): void
  /** Arranges the whole open circuit left to right by depth (`layout.ts`), as one edit. */
  arrangeAll(): void
  /** Changes the size of a frame. */
  resizeFrame(id: string, size: Point): void
  /** Gives a switch or a push button a keyboard key, or none for null. */
  setKey(id: string, code: string | null): void
  /** Sets how many ticks a part takes to answer. */
  setDelay(id: string, delay: number): void
  setSelection(ids: Iterable<string>): void
  toggleSelected(id: string): void
  selectAll(): void
  undo(): void
  redo(): void
  /**
   * Goes straight to a step of the history: 0 is the oldest drawing kept,
   * `past.length` the one on screen now, and beyond it the steps of redo.
   */
  jumpHistory(index: number): void
  copy(): void
  cut(): void
  paste(): void
  setView(view: View): void
  zoomAt(factor: number, x: number, y: number): void
  /**
   * Shows the whole open circuit, if this is the first time it is on screen
   * and nothing says where to look. The canvas calls this with its size.
   */
  frame(width: number, height: number): void
  /** Shows the whole open circuit on a canvas of the given size. */
  fitToScreen(width: number, height: number): void
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

  setStepsOpen(open: boolean): void
  /** Says which step is on show. The switches are set by the session. */
  setStepIndex(index: number): void
  /** Adds a step after the one on show and shows it. */
  addStep(inputs: Readonly<Record<string, InputValue>>): void
  setStepNote(index: number, note: string): void
  setStepInputs(index: number, inputs: Readonly<Record<string, InputValue>>): void
  deleteStep(index: number): void

  /** Adds an empty circuit and opens it. Returns its id. */
  addCircuit(name?: string): string
  /** Opens another circuit of the project. */
  selectCircuit(id: string): void
  /** Renames a circuit. A blank name is ignored. */
  renameCircuit(id: string, name: string): void
  /**
   * Deletes a circuit, and with it every part that stands for it in the
   * other circuits. The last circuit of a project cannot be deleted.
   */
  removeCircuit(id: string): void
  /** Replaces everything with the given project. */
  loadProject(data: ProjectData): void
  /** Replaces everything with an empty project. */
  newProject(): void
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
  | 'circuits'
  | 'order'
  | 'active'
  | 'nextCircuit'
  | 'parked'
  | 'restoredInputs'
  | 'unframed'
  | 'stepsOpen'
  | 'stepIndex'
>

/** The state for a freshly opened project, looking at it through `view`. */
function projectData(project: LoadedProject, view: View): Data {
  const parked: Record<string, Parked> = {}
  for (const id of project.order) {
    const stored = project.views[id]
    if (id !== project.active && stored) {
      parked[id] = { past: [], future: [], view: stored, selection: new Set() }
    }
  }
  return {
    doc: project.circuits[project.active].doc,
    past: [],
    future: [],
    selection: new Set(),
    view: project.views[project.active] ?? view,
    clipboard: null,
    pasteCount: 0,
    placing: null,
    settings: project.settings,
    circuits: project.circuits,
    order: project.order,
    active: project.active,
    nextCircuit: project.nextCircuit,
    parked,
    restoredInputs: project.inputs,
    stepsOpen: false,
    stepIndex: 0,
    unframed: new Set(
      project.order.filter(
        (id) => !project.views[id] && Object.keys(project.circuits[id].doc.components).length > 0,
      ),
    ),
  }
}

export const useEditor = create<EditorState>()((set, get) => {
  /**
   * Puts `doc` in place as the open circuit's drawing. Parts that stand for
   * a named circuit are brought up to date everywhere, since the edit may
   * have changed the pins of this circuit.
   */
  const place = (doc: CircuitDoc): Pick<EditorState, 'doc' | 'circuits'> => {
    const state = get()
    const circuits = reconcileAll({
      ...state.circuits,
      [state.active]: { ...state.circuits[state.active], doc },
    })
    return { doc: circuits[state.active].doc, circuits }
  }

  /** Makes `doc` current and records the previous one for undo. */
  const commit = (doc: CircuitDoc, selection?: Iterable<string>): void => {
    const state = get()
    if (doc === state.doc) return
    const placed = place(doc)
    set({
      ...placed,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      selection: existingIds(placed.doc, selection ?? state.selection),
    })
  }

  /** Puts a new list of steps on the open circuit. Not a step of undo. */
  const putSteps = (steps: readonly Step[], stepIndex: number): void => {
    const state = get()
    const circuit = state.circuits[state.active]
    if (steps === (circuit.steps ?? [])) return
    set({
      circuits: { ...state.circuits, [state.active]: { ...circuit, steps } },
      stepIndex: Math.max(0, Math.min(steps.length - 1, stepIndex)),
    })
  }
  const stepsNow = (): readonly Step[] => get().circuits[get().active].steps ?? []

  return {
    ...projectData(emptyProject(), DEFAULT_VIEW),
    epoch: 0,
    theme: loadTheme(),

    setStepsOpen(stepsOpen) {
      set({ stepsOpen })
    },

    setStepIndex(index) {
      const last = stepsNow().length - 1
      set({ stepIndex: Math.max(0, Math.min(last, index)) })
    },

    addStep(inputs) {
      const steps = stepsNow()
      const at = steps.length === 0 ? -1 : get().stepIndex
      const next = insertStep(steps, at, { note: '', inputs })
      if (next.length > steps.length) putSteps(next, at + 1)
    },

    setStepNote(index, note) {
      putSteps(changeStep(stepsNow(), index, { note: cleanNote(note) }), get().stepIndex)
    },

    setStepInputs(index, inputs) {
      putSteps(changeStep(stepsNow(), index, { inputs }), get().stepIndex)
    },

    deleteStep(index) {
      const { stepIndex } = get()
      putSteps(removeStep(stepsNow(), index), index < stepIndex ? stepIndex - 1 : stepIndex)
    },

    addComponent(type, pos, circuit, splice) {
      const { doc, circuits, active } = get()
      const put = (added: { doc: CircuitDoc; id: string }): void => {
        const target = splice ? spliceTarget(doc, added.doc.components[added.id]) : undefined
        commit((target && applySplice(added.doc, added.id, target)) ?? added.doc, [added.id])
      }
      let spot = pos
      const taken = (p: Point) =>
        Object.values(doc.components).some((component) => samePoint(component.pos, p))
      while (taken(spot)) spot = { x: spot.x + 1, y: spot.y + 1 }
      if (type === SUB_TYPE) {
        if (circuit === undefined || !canPlace(circuits, active, circuit)) return
        put(addSubcircuit(doc, subRefOf(circuits[circuit]), spot))
        return
      }
      const added =
        type === TEXT_TYPE
          ? addText(doc, spot)
          : type === FRAME_TYPE
            ? addFrame(doc, spot)
            : type === NET_TYPE
              ? addNetLabel(doc, spot, freeNetName(doc))
              : addComponent(doc, type, spot, {
              params: placementParams(type, get().settings.radix),
            })
      put(added)
    },

    connect(a, b) {
      const next = connectEnds(get().doc, a, b)
      if (!next) return false
      commit(next)
      return true
    },

    moveSelection(dx, dy, splice) {
      const { doc, selection } = get()
      commit(splice ? moveAndSplice(doc, selection, dx, dy) : moveItems(doc, selection, dx, dy))
    },

    bendWire(wireId, at, dx, dy) {
      if (dx === 0 && dy === 0) return
      const bent = bendWire(get().doc, wireId, at, dx, dy)
      if (bent) commit(bent.doc, bent.junctions)
    },

    duplicateSelection(dx, dy) {
      const { doc, selection } = get()
      if (dx === 0 && dy === 0) return
      const copied = duplicateItems(doc, selection, { x: dx, y: dy })
      if (copied.ids.length > 0) commit(copied.doc, copied.ids)
    },

    frameSelection() {
      const { doc, selection } = get()
      const framed = frameAround(doc, selection)
      if (framed) commit(framed.doc, [framed.id])
    },

    arrangeAll() {
      commit(autoLayout(get().doc))
    },

    resizeFrame(id, size) {
      commit(resizeFrame(get().doc, id, size))
    },

    alignSelection(edge) {
      const { doc, selection } = get()
      commit(alignItems(doc, selection, edge))
    },

    distributeSelection(axis) {
      const { doc, selection } = get()
      commit(distributeItems(doc, selection, axis))
    },

    selectionToCircuit() {
      const state = get()
      const id = `k${state.nextCircuit}`
      const names = new Set(Object.values(state.circuits).map((circuit) => circuit.name))
      let number = state.order.length + 1
      while (names.has(`Circuit ${number}`)) number++
      const name = `Circuit ${number}`
      const result = extractCircuit(state.doc, state.selection, id, name)
      if (!result) return null
      set({
        circuits: { ...state.circuits, [id]: { id, name, doc: result.inner } },
        order: [...state.order, id],
        nextCircuit: state.nextCircuit + 1,
        unframed: new Set([...state.unframed, id]),
      })
      commit(result.doc, [result.part])
      return id
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

    setLabel(id, label) {
      commit(setComponentLabel(get().doc, id, label))
    },

    setText(id, text) {
      commit(setComponentText(get().doc, id, text))
    },

    setBusFormat(terminal, format) {
      commit(setBusFormat(get().doc, terminal, format))
    },

    setKey(id, code) {
      commit(setComponentKey(get().doc, id, code))
    },

    setDelay(id, delay) {
      commit(setComponentDelay(get().doc, id, delay))
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
      // An old drawing can hold parts of circuits that changed since.
      const placed = place(previous)
      set({
        ...placed,
        past: past.slice(0, -1),
        future: [doc, ...future],
        selection: existingIds(placed.doc, selection),
      })
    },

    redo() {
      const { doc, past, future, selection } = get()
      const next = future[0]
      if (!next) return
      const placed = place(next)
      set({
        ...placed,
        past: [...past, doc],
        future: future.slice(1),
        selection: existingIds(placed.doc, selection),
      })
    },

    jumpHistory(index) {
      const { doc, past, future, selection } = get()
      const steps = [...past, doc, ...future]
      if (index === past.length || index < 0 || index >= steps.length) return
      const placed = place(steps[index])
      set({
        ...placed,
        past: steps.slice(0, index),
        future: steps.slice(index + 1),
        selection: existingIds(placed.doc, selection),
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
      const { doc, clipboard, pasteCount, circuits, active } = get()
      if (!clipboard) return
      // Copied in another circuit, a part may not be allowed in this one.
      const fits = clipboard.components.filter(
        (component) => !component.sub || canPlace(circuits, active, component.sub.circuit),
      )
      const fragment =
        fits.length === clipboard.components.length ? clipboard : { ...clipboard, components: fits }
      const shift = 2 * (pasteCount + 1)
      const pasted = pasteFragment(doc, fragment, { x: shift, y: shift })
      commit(pasted.doc, pasted.ids)
      set({ pasteCount: pasteCount + 1 })
    },

    setView(view) {
      set({ view })
    },

    zoomAt(factor, x, y) {
      set({ view: zoomAt(get().view, factor, x, y) })
    },

    frame(width, height) {
      const state = get()
      if (!state.unframed.has(state.active)) return
      const unframed = new Set(state.unframed)
      unframed.delete(state.active)
      const bounds = docBounds(state.doc)
      set({ unframed, view: bounds ? fitView(bounds, width, height) : state.view })
    },

    fitToScreen(width, height) {
      const bounds = docBounds(get().doc)
      if (bounds && width > 0 && height > 0) set({ view: fitView(bounds, width, height) })
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

    addCircuit(name) {
      const state = get()
      const id = `k${state.nextCircuit}`
      const names = new Set(Object.values(state.circuits).map((circuit) => circuit.name))
      let chosen = cleanCircuitName(name ?? '')
      for (let number = state.order.length + 1; chosen === undefined; number++) {
        if (!names.has(`Circuit ${number}`)) chosen = `Circuit ${number}`
      }
      const doc: CircuitDoc = { components: {}, junctions: {}, wires: {}, nextId: 1 }
      set({
        circuits: { ...state.circuits, [id]: { id, name: chosen, doc } },
        order: [...state.order, id],
        nextCircuit: state.nextCircuit + 1,
      })
      get().selectCircuit(id)
      return id
    },

    selectCircuit(id) {
      const state = get()
      if (id === state.active || !(id in state.circuits)) return
      const parked: Record<string, Parked> = {
        ...state.parked,
        [state.active]: {
          past: state.past,
          future: state.future,
          view: state.view,
          selection: state.selection,
        },
      }
      const mine = parked[id]
      delete parked[id]
      const doc = state.circuits[id].doc
      set({
        active: id,
        doc,
        past: mine?.past ?? [],
        future: mine?.future ?? [],
        view: mine?.view ?? state.view,
        selection: existingIds(doc, mine?.selection ?? []),
        parked,
        placing: null,
        stepIndex: 0,
      })
    },

    renameCircuit(id, name) {
      const state = get()
      const circuit = state.circuits[id]
      const chosen = cleanCircuitName(name)
      if (!circuit || chosen === undefined || chosen === circuit.name) return
      const circuits = reconcileAll({ ...state.circuits, [id]: { ...circuit, name: chosen } })
      set({ circuits, doc: circuits[state.active].doc })
    },

    removeCircuit(id) {
      if (!(id in get().circuits) || get().order.length <= 1) return
      if (id === get().active) {
        const { order } = get()
        const index = order.indexOf(id)
        get().selectCircuit(order[index + 1] ?? order[index - 1])
      }
      const state = get()
      const rest = { ...state.circuits }
      delete rest[id]
      const parked = { ...state.parked }
      delete parked[id]
      const circuits = reconcileAll(rest)
      const doc = circuits[state.active].doc
      set({
        circuits,
        doc,
        order: state.order.filter((other) => other !== id),
        parked,
        selection: existingIds(doc, state.selection),
      })
    },

    loadProject(data) {
      const state = get()
      set({ ...projectData(fromProjectData(data), state.view), epoch: state.epoch + 1 })
    },

    newProject() {
      const state = get()
      set({ ...projectData(emptyProject(), state.view), epoch: state.epoch + 1 })
    },
  }
})

applyTheme(useEditor.getState().theme)

/** Puts the editor back to an empty project. Meant for tests. */
export function resetEditor(): void {
  useEditor.setState({ ...projectData(emptyProject(), DEFAULT_VIEW), epoch: 0 })
}
