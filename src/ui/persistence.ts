import { create } from 'zustand'
import { canvasRuntime, isBlankProject, projectSnapshot, useEditor, useSim } from '../editor/index.ts'
import type { Example, ProjectData } from '../editor/index.ts'
import {
  ProjectFileError,
  chooseLocal,
  createLocal,
  deleteLocal,
  downloadText,
  duplicateLocal,
  freshName,
  listLocal,
  loadLocal,
  parseProject,
  pickTextFile,
  readLocal,
  renameLocal,
  safeFileName,
  saveLocal,
  serializeProject,
  setAsideLocal,
  watchLocal,
} from '../io/index.ts'
import type { Library } from '../io/index.ts'
import { ask } from './dialogs.ts'
import { latestFirst } from './projectList.ts'
import { toast } from './toasts.ts'

/*
 * Where the editor and the file format meet. The browser keeps a list of
 * projects, and the open one is written to it as the user works. A project
 * goes to and from a file when they ask.
 */

interface StorageState {
  /** Whether the last attempt to keep the project in the browser worked. */
  readonly ok: boolean
  /** The projects the browser keeps, as they were last read. */
  readonly library: Library
}

export const useStorage = create<StorageState>()(() => ({
  ok: true,
  library: { open: null, projects: [] },
}))

/** How long the project is left to settle before it is written. */
const SAVE_DELAY = 400

let timer: ReturnType<typeof setTimeout> | undefined

/** The project as it is now, as the text of a project file. */
export function projectText(pretty = false): string {
  return serializeProject(projectSnapshot(), pretty)
}

/** Opens the project a file's text describes. Throws if it cannot be read. */
export function openProjectText(text: string): void {
  useEditor.getState().loadProject(parseProject(text))
}

function saveNow(): void {
  forgetPendingSave()
  useStorage.setState({ ok: saveLocal(projectText()) })
}

function saveSoon(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(saveNow, SAVE_DELAY)
}

function flush(): void {
  if (timer !== undefined) saveNow()
}

/** Drops a save that is waiting, for a project that is going away. */
function forgetPendingSave(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function reasonOf(error: unknown): string {
  return error instanceof ProjectFileError ? error.message : 'It is not a project file this app can read.'
}

/**
 * Brings back the project that was open on the last visit, and from then
 * on keeps the browser's copy current. Call once, before the first render.
 */
export function startPersistence(): void {
  // Every change to the list reaches the projects window from here on.
  watchLocal((library) => useStorage.setState({ library }))
  const stored = loadLocal()
  if (stored !== null) {
    try {
      openProjectText(stored)
    } catch (error) {
      // Kept under another name, so the next save does not wipe it out.
      setAsideLocal()
      void ask({
        title: 'Your saved project could not be read',
        body: `${reasonOf(error)}\nYou have a new, empty project now. The copy that could not be read is still kept in this browser.`,
        confirm: 'Start with the empty project',
      })
    }
  }
  useStorage.setState({ library: listLocal() })

  useEditor.subscribe((state, previous) => {
    if (
      state.circuits !== previous.circuits ||
      state.order !== previous.order ||
      state.active !== previous.active ||
      state.settings !== previous.settings ||
      state.view !== previous.view
    ) {
      saveSoon()
    }
  })
  // A switch is not part of the drawing, but what it is on is saved too.
  useSim.subscribe((state, previous) => {
    if (state.pokes !== previous.pokes) saveSoon()
  })

  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush()
  })
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    if (event.code === 'KeyS') {
      event.preventDefault()
      saveProjectFile()
    } else if (event.code === 'KeyO') {
      event.preventDefault()
      void openProjectFile()
    }
  })
}

/** The name the open project goes by: its name in the list, or its first circuit's. */
function openName(): string {
  const { circuits, order } = useEditor.getState()
  const { library } = useStorage.getState()
  return library.projects.find((project) => project.id === library.open)?.name ?? circuits[order[0]].name
}

/** Asks before something replaces a project that has work in it. */
function mayReplace(withWhat: string): Promise<boolean> {
  if (isBlankProject(useEditor.getState())) return Promise.resolve(true)
  const name = openName()
  return ask({
    title: `Replace “${name}”?`,
    body: `${withWhat} takes the place of “${name}”. To keep it, save it to a file first.`,
    confirm: 'Replace project',
    cancel: 'Keep this project',
    danger: true,
  })
}

/**
 * Opens a project as a new entry in the browser's list, so the one that was
 * open stays in the list untouched. An open project that is still blank is
 * reused rather than left behind. Only when the browser keeps nothing does it ask first.
 */
async function openAsNew(base: string, what: string, apply: () => void): Promise<boolean> {
  flush()
  const { open, projects } = listLocal()
  const reuse = open !== null && isBlankProject(useEditor.getState())
  const name = freshName(
    base,
    projects.filter((project) => !(reuse && project.id === open)),
  )
  if (reuse) renameLocal(open, name)
  else if (createLocal(name) === null && !(await mayReplace(what))) return false
  apply()
  saveNow()
  return true
}

/** Saves the project as a file on the user's computer. */
export function saveProjectFile(): void {
  const name = safeFileName(openName(), 'project')
  downloadText(`${name}.cedar.json`, projectText(true))
  toast(`Saved the project as ${name}.cedar.json`)
}

/** Saves a picture of the open circuit, as it looks now, as an SVG file. */
export function exportCircuitSvg(): void {
  const svg = canvasRuntime.current?.svg()
  if (svg === undefined) return
  const { circuits, active } = useEditor.getState()
  const name = `${safeFileName(circuits[active].name, 'circuit')}.svg`
  downloadText(name, svg, 'image/svg+xml')
  toast(`Exported the circuit as ${name}`)
}

/** Lets the user pick a project file and opens it as a new project. */
export async function openProjectFile(): Promise<void> {
  const file = await pickTextFile('.json,application/json')
  if (!file) return
  let data: ProjectData
  try {
    data = parseProject(file.text)
  } catch (error) {
    await ask({
      title: `“${file.name}” could not be opened`,
      body: `${reasonOf(error)}\nYour project is unchanged.`,
      confirm: 'Close',
    })
    return
  }
  const base = file.name.replace(/(\.cedar)?\.json$/i, '')
  if (await openAsNew(base, `“${file.name}”`, () => useEditor.getState().loadProject(data))) {
    toast(`Opened “${file.name}”`)
  }
}

/** Starts a new project with one empty circuit. */
export async function startNewProject(): Promise<void> {
  if (await openAsNew('Untitled project', 'A new, empty project', useEditor.getState().newProject)) {
    toast('Started a new project')
  }
}

/** Opens an example as a project of its own. */
export async function openExample(example: Example): Promise<void> {
  const what = `The example “${example.name}”`
  if (await openAsNew(example.name, what, () => useEditor.getState().loadProject(example.build()))) {
    toast(`Opened the example “${example.name}”`)
  }
}

function nameOf(id: string, library = listLocal()): string {
  return library.projects.find((project) => project.id === id)?.name ?? 'the project'
}

/** Opens another project of the browser's list. False if it could not be read. */
export async function switchProject(id: string): Promise<boolean> {
  const library = listLocal()
  const { open } = library
  if (id === open) return true
  flush()
  const name = nameOf(id, library)
  const text = readLocal(id)
  // Chosen first, so the save that loading sets off goes to the right place.
  chooseLocal(id)
  try {
    if (text === null) throw new Error('missing')
    openProjectText(text)
  } catch (error) {
    if (open !== null) chooseLocal(open)
    await ask({
      title: `“${name}” could not be opened`,
      body: `${reasonOf(error)}\nThe project you had open is unchanged.`,
      confirm: 'Close',
    })
    return false
  }
  toast(`Opened “${name}”`)
  return true
}

export function renameProject(id: string, name: string): void {
  renameLocal(id, name)
}

/** Copies a project of the list under a new name. The open one stays open. */
export function duplicateProject(id: string): void {
  // The open project's copy should have the latest changes.
  flush()
  const library = listLocal()
  const copy = freshName(`${nameOf(id, library)} copy`, library.projects)
  if (duplicateLocal(id, copy) !== null) toast(`Made a copy, “${copy}”`)
}

/**
 * Removes a project from the browser. The caller has asked the user first,
 * by name. When it is the open one, the latest of the others opens, or a new
 * empty project.
 */
export async function deleteProject(id: string): Promise<void> {
  const name = nameOf(id)
  const wasOpen = id === listLocal().open
  if (wasOpen) forgetPendingSave()
  deleteLocal(id)
  if (wasOpen) {
    const { projects } = listLocal()
    const next = latestFirst(projects)[0]
    if (!next || !(await switchProject(next.id))) {
      createLocal(freshName('Untitled project', projects))
      useEditor.getState().newProject()
      saveNow()
    }
  }
  toast(`Deleted “${name}”`)
}
