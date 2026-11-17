/*
 * The projects the browser keeps between visits: a list of them, and the
 * text of each one under a key of its own. One of them is open. Storage can
 * be missing, full or switched off, so nothing here ever throws.
 */

const INDEX_KEY = 'cedar-logic.projects'
/** Where the one project of earlier versions was kept. */
const OLD_KEY = 'cedar-logic.project'
const UNREADABLE_KEY = 'cedar-logic.project.unreadable'

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
  /** The project that is open, or null when none is yet. */
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
  if (Array.isArray(data.projects)) {
    for (const item of data.projects as Record<string, unknown>[]) {
      if (
        typeof item?.id === 'string' &&
        /^[a-z0-9]+$/.test(item.id) &&
        typeof item.name === 'string' &&
        typeof item.saved === 'number' &&
        !projects.some((project) => project.id === item.id)
      ) {
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
 * The list as storage has it. The first time, the single project an earlier
 * version kept becomes the first entry.
 */
function readIndex(store: Storage): Library {
  const text = store.getItem(INDEX_KEY)
  if (text !== null) {
    try {
      return parseIndex(text)
    } catch {
      return EMPTY
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

/** Runs `change` on the list and writes what it returns. False if it could not. */
function update(change: (library: Library, store: Storage) => Library): boolean {
  const store = storage()
  if (!store) return false
  try {
    writeIndex(store, change(readIndex(store), store))
    return true
  } catch {
    return false
  }
}

/** A name for a project that no other in `taken` has: `base`, or `base 2`, `base 3` ... */
export function freshName(base: string, taken: readonly string[]): string {
  const name = base.trim().slice(0, MAX_PROJECT_NAME) || 'Untitled project'
  if (!taken.includes(name)) return name
  for (let n = 2; ; n++) {
    if (!taken.includes(`${name} ${n}`)) return `${name} ${n}`
  }
}

/** The projects the browser keeps, and which one is open. */
export function listLocal(): Library {
  const store = storage()
  if (!store) return EMPTY
  try {
    return readIndex(store)
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
        : createIn(library, freshName('Untitled project', library.projects.map((p) => p.name)))
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

/** Makes another project of the list the open one. */
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

/** Removes a project from the browser. If it was open, none is open after. */
export function deleteLocal(id: string): boolean {
  return update((library, store) => {
    store.removeItem(textKey(id))
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
