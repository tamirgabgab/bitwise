import { create } from 'zustand'
import { canvasRuntime, projectSnapshot, useEditor, useSim } from '../editor/index.ts'
import type { Example } from '../editor/index.ts'
import {
  ProjectFileError,
  downloadText,
  loadLocal,
  parseProject,
  pickTextFile,
  safeFileName,
  saveLocal,
  serializeProject,
  setAsideLocal,
} from '../io/index.ts'
import { ask } from './dialogs.ts'

/*
 * Where the editor and the file format meet. The project is kept in the
 * browser as the user works, and goes to and from a file when they ask.
 */

/** Whether the last attempt to keep the project in the browser worked. */
export const useStorage = create<{ ok: boolean }>()(() => ({ ok: true }))

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
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  useStorage.setState({ ok: saveLocal(projectText()) })
}

function saveSoon(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(saveNow, SAVE_DELAY)
}

function flush(): void {
  if (timer !== undefined) saveNow()
}

function reasonOf(error: unknown): string {
  return error instanceof ProjectFileError ? error.message : 'It is not a project file this app can read.'
}

/**
 * Brings back the project the browser kept from the last visit, and from
 * then on keeps the browser's copy current. Call once, before the first
 * render.
 */
export function startPersistence(): void {
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

function isEmpty(): boolean {
  return Object.values(useEditor.getState().circuits).every(
    (circuit) => Object.keys(circuit.doc.components).length === 0,
  )
}

/** Asks before something replaces a project that has work in it. */
function mayReplace(withWhat: string): Promise<boolean> {
  if (isEmpty()) return Promise.resolve(true)
  return ask({
    title: 'Replace this project?',
    body: `${withWhat} takes the place of the project you have open. To keep it, save it to a file first.`,
    confirm: 'Replace project',
    cancel: 'Keep this project',
    danger: true,
  })
}

/** Saves the project as a file on the user's computer. */
export function saveProjectFile(): void {
  const { circuits, order } = useEditor.getState()
  const name = safeFileName(circuits[order[0]].name, 'project')
  downloadText(`${name}.cedar.json`, projectText(true))
}

/** Saves a picture of the open circuit, as it looks now, as an SVG file. */
export function exportCircuitSvg(): void {
  const svg = canvasRuntime.current?.svg()
  if (svg === undefined) return
  const { circuits, active } = useEditor.getState()
  downloadText(`${safeFileName(circuits[active].name, 'circuit')}.svg`, svg, 'image/svg+xml')
}

/** Lets the user pick a project file and opens it. */
export async function openProjectFile(): Promise<void> {
  const file = await pickTextFile('.json,application/json')
  if (!file) return
  if (!(await mayReplace(`“${file.name}”`))) return
  try {
    openProjectText(file.text)
  } catch (error) {
    await ask({
      title: `“${file.name}” could not be opened`,
      body: `${reasonOf(error)}\nYour project is unchanged.`,
      confirm: 'Close',
    })
  }
}

/** Starts over with one empty circuit. */
export async function startNewProject(): Promise<void> {
  if (await mayReplace('A new, empty project')) useEditor.getState().newProject()
}

export async function openExample(example: Example): Promise<void> {
  if (await mayReplace(`The example “${example.name}”`)) {
    useEditor.getState().loadProject(example.build())
  }
}
