/*
 * The projects the browser keeps between visits: a list of them, and the
 * text of each one under a key of its own. Storage can be missing, full or
 * switched off, so nothing here ever throws.
 *
 * Every tab has its own open project. The list remembers only the one opened
 * last, which is where a new tab starts.
 */

import { versionsKey } from './versions.ts'

const INDEX_KEY = 'cedar-logic.projects'
/** Where the one project of earlier versions was kept. */
const OLD_KEY = 'cedar-logic.project'
const UNREADABLE_KEY = 'cedar-logic.project.unreadable'
/** Where a list that could not be read is kept. */
const UNREADABLE_INDEX_KEY = 'cedar-logic.projects.unreadable'

/** A name in the list of projects is at most this long. */
export const MAX_PROJECT_NAME = 60

/** One project in the browser's list. */
export interface StoredProject {
  readonly id: string
  readonly name: string
  /** When it was last written, in milliseconds since 1970. */
  readonly saved: number
}

export interface Library {
  /** The project open in this tab, or null when none is yet. */
  readonly open: string | null
  readonly projects: readonly StoredProject[]
}

const EMPTY: Library = { open: null, projects: [] }

function textKey(id: string): string {
  return `${OLD_KEY}.${id}`
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

function parseIndex(text: string): Library {
  const data = JSON.parse(text) as { open?: unknown; projects?: unknown }
  const projects: StoredProject[] = []
  const seen = new Set<string>()
  if (Array.isArray(data.projects)) {
    for (const item of data.projects as Record<string, unknown>[]) {
      if (
        typeof item?.id === 'string' &&
        /^[a-z0-9]+$/.test(item.id) &&
        typeof item.name === 'string' &&
        typeof item.saved === 'number' &&
        !seen.has(item.id)
      ) {
        seen.add(item.id)
        projects.push({ id: item.id, name: item.name, saved: item.saved })
      }
    }
  }
  const open = projects.some((project) => project.id === data.open) ? (data.open as string) : null
  return { open, projects }
}

function writeIndex(store: Storage, library: Library): void {
  store.setItem(INDEX_KEY, JSON.stringify(library))
}

function newId(library: Library): string {
  for (;;) {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    if (!library.projects.some((project) => project.id === id)) return id
  }
}

/**
 * A list made again from the texts in storage, when the list itself could
 * not be read. The damaged list is kept aside.
 */
function rebuildIndex(store: Storage, damaged: string): Library {
  store.setItem(UNREADABLE_INDEX_KEY, damaged)
  const prefix = `${OLD_KEY}.`
  const projects: StoredProject[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key === null || key === UNREADABLE_KEY || !key.startsWith(prefix)) continue
    const id = key.slice(prefix.length)
    if (!/^[a-z0-9]+$/.test(id)) continue
    const name = freshName('Recovered project', projects)
    projects.push({ id, name, saved: Date.now() })
  }
  const library = { open: null, projects }
  writeIndex(store, library)
  return library
}

/**
 * The list as storage has it. The first time, the single project an earlier
 * version kept becomes the first entry.
 */
function readIndex(store: Storage): Library {
  const text = store.getItem(INDEX_KEY)
  if (text !== null) {
    try {
      return parseIndex(text)
    } catch {
      return rebuildIndex(store, text)
    }
  }
  const old = store.getItem(OLD_KEY)
  if (old === null) return EMPTY
  const id = newId(EMPTY)
  const library = { open: id, projects: [{ id, name: 'My project', saved: Date.now() }] }
  store.setItem(textKey(id), old)
  writeIndex(store, library)
  store.removeItem(OLD_KEY)
  return library
}

/**
 * The project open in this tab, and the storage it belongs to. Until the
 * tab opens one of its own, it is the one the list says was opened last.
 */
let here: { readonly store: Storage; readonly id: string | null } | undefined

/** The list as this tab sees it: with this tab's open project. */
function readHere(store: Storage): Library {
  const library = readIndex(store)
  if (here?.store !== store) here = { store, id: library.open }
  const id = here.id
  return { ...library, open: library.projects.some((project) => project.id === id) ? id : null }
}

let listener: ((library: Library) => void) | undefined

/** Calls `onChange` with the list, as this tab sees it, after every change made here. */
export function watchLocal(onChange: (library: Library) => void): void {
  listener = onChange
}

/** Runs `change` on the list and writes what it returns. False if it could not. */
function update(change: (library: Library, store: Storage) => Library): boolean {
  const store = storage()
  if (!store) return false
  let next: Library
  try {
    next = change(readHere(store), store)
    here = { store, id: next.open }
    writeIndex(store, next)
  } catch {
    return false
  }
  listener?.(next)
  return true
}

/** A name that no project of `taken` has: `base`, or `base 2`, `base 3` ... */
export function freshName(base: string, taken: readonly { readonly name: string }[]): string {
  const names = new Set(taken.map((project) => project.name))
  const name = base.trim().slice(0, MAX_PROJECT_NAME) || 'Untitled project'
  if (!names.has(name)) return name
  for (let n = 2; ; n++) {
    if (!names.has(`${name} ${n}`)) return `${name} ${n}`
  }
}

/** The projects the browser keeps, and which one is open in this tab. */
export function listLocal(): Library {
  const store = storage()
  if (!store) return EMPTY
  try {
    return readHere(store)
  } catch {
    return EMPTY
  }
}

/**
 * Keeps the text of the open project in the browser. With none open yet, it
 * becomes a new entry in the list. Returns false if it could not.
 */
export function saveLocal(text: string): boolean {
  return update((library, store) => {
    const current =
      library.open !== null
        ? library
        : createIn(library, freshName('Untitled project', library.projects))
    const open = current.open as string
    store.setItem(textKey(open), text)
    const saved = Date.now()
    return {
      open,
      projects: current.projects.map((project) =>
        project.id === open ? { ...project, saved } : project,
      ),
    }
  })
}

function createIn(library: Library, name: string): Library {
  const id = newId(library)
  return { open: id, projects: [...library.projects, { id, name, saved: Date.now() }] }
}

/** The text of the open project, or null if there is none. */
export function loadLocal(): string | null {
  const { open } = listLocal()
  return open === null ? null : readLocal(open)
}

/** The text of one project in the list, or null if it has none. */
export function readLocal(id: string): string | null {
  try {
    return storage()?.getItem(textKey(id)) ?? null
  } catch {
    return null
  }
}

/**
 * Adds an empty entry to the list and makes it the open one; the next save
 * fills it. Returns its id, or null if storage is not working.
 */
export function createLocal(name: string): string | null {
  let id: string | null = null
  const done = update((library) => {
    const next = createIn(library, name.slice(0, MAX_PROJECT_NAME))
    id = next.open
    return next
  })
  return done ? id : null
}

/** Makes another project of the list the one open in this tab. */
export function chooseLocal(id: string): boolean {
  return update((library) =>
    library.projects.some((project) => project.id === id) ? { ...library, open: id } : library,
  )
}

export function renameLocal(id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, MAX_PROJECT_NAME)
  if (!trimmed) return false
  return update((library) => ({
    ...library,
    projects: library.projects.map((project) =>
      project.id === id ? { ...project, name: trimmed } : project,
    ),
  }))
}

/** Copies a project under a new name, without opening it. Returns the copy's id. */
export function duplicateLocal(id: string, name: string): string | null {
  const text = readLocal(id)
  if (text === null) return null
  let copy: string | null = null
  const done = update((library, store) => {
    copy = newId(library)
    store.setItem(textKey(copy), text)
    return {
      ...library,
      projects: [
        ...library.projects,
        { id: copy, name: name.slice(0, MAX_PROJECT_NAME), saved: Date.now() },
      ],
    }
  })
  return done ? copy : null
}

/** Removes a project, and its versions, from the browser. If it was open, none is open after. */
export function deleteLocal(id: string): boolean {
  return update((library, store) => {
    store.removeItem(textKey(id))
    store.removeItem(versionsKey(id))
    return {
      open: library.open === id ? null : library.open,
      projects: library.projects.filter((project) => project.id !== id),
    }
  })
}

/**
 * Moves the open project out of the list when it could not be read, so no
 * later save overwrites the only copy of it.
 */
export function setAsideLocal(): void {
  update((library, store) => {
    if (library.open === null) return library
    const text = store.getItem(textKey(library.open))
    if (text !== null) store.setItem(UNREADABLE_KEY, text)
    store.removeItem(textKey(library.open))
    return {
      open: null,
      projects: library.projects.filter((project) => project.id !== library.open),
    }
  })
}
