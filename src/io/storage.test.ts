import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chooseLocal,
  createLocal,
  deleteLocal,
  duplicateLocal,
  freshName,
  listLocal,
  loadLocal,
  readLocal,
  renameLocal,
  saveLocal,
  setAsideLocal,
} from './storage.ts'

/** A stand-in for the browser's storage, kept in a map. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

let store: Storage

beforeEach(() => {
  store = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('freshName', () => {
  it('numbers a name that is taken', () => {
    expect(freshName('Adder', [])).toBe('Adder')
    expect(freshName('Adder', ['Adder', 'Adder 2'])).toBe('Adder 3')
    expect(freshName('   ', [])).toBe('Untitled project')
  })
})

describe('projects kept in the browser', () => {
  it('starts empty, and the first save makes an open project', () => {
    expect(listLocal()).toEqual({ open: null, projects: [] })
    expect(loadLocal()).toBeNull()
    expect(saveLocal('one')).toBe(true)
    const { open, projects } = listLocal()
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('Untitled project')
    expect(open).toBe(projects[0].id)
    expect(loadLocal()).toBe('one')
  })

  it('takes over the single project of earlier versions', () => {
    store.setItem('cedar-logic.project', 'old')
    const { open, projects } = listLocal()
    expect(projects.map((project) => project.name)).toEqual(['My project'])
    expect(open).toBe(projects[0].id)
    expect(loadLocal()).toBe('old')
    expect(store.getItem('cedar-logic.project')).toBeNull()
  })

  it('keeps each project apart and switches between them', () => {
    saveLocal('first')
    const first = listLocal().open as string
    const second = createLocal('Second') as string
    expect(listLocal().open).toBe(second)
    saveLocal('second')
    expect(readLocal(first)).toBe('first')
    expect(chooseLocal(first)).toBe(true)
    expect(loadLocal()).toBe('first')
    expect(listLocal().projects.map((project) => project.name)).toEqual([
      'Untitled project',
      'Second',
    ])
  })

  it('renames, duplicates and deletes', () => {
    saveLocal('text')
    const id = listLocal().open as string
    expect(renameLocal(id, '  Counter  ')).toBe(true)
    expect(renameLocal(id, '   ')).toBe(false)
    const copy = duplicateLocal(id, 'Counter copy') as string
    expect(readLocal(copy)).toBe('text')
    expect(listLocal().open).toBe(id)
    expect(listLocal().projects.map((project) => project.name)).toEqual(['Counter', 'Counter copy'])

    expect(deleteLocal(id)).toBe(true)
    expect(listLocal()).toEqual({ open: null, projects: [expect.objectContaining({ id: copy })] })
    expect(readLocal(id)).toBeNull()
  })

  it('sets an unreadable project aside, out of the list', () => {
    saveLocal('garbled')
    setAsideLocal()
    expect(listLocal()).toEqual({ open: null, projects: [] })
    expect(store.getItem('cedar-logic.project.unreadable')).toBe('garbled')
  })

  it('reads a damaged list as empty and never throws without storage', () => {
    store.setItem('cedar-logic.projects', '{not json')
    expect(listLocal()).toEqual({ open: null, projects: [] })
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(saveLocal('x')).toBe(false)
    expect(createLocal('x')).toBeNull()
    expect(loadLocal()).toBeNull()
  })
})
