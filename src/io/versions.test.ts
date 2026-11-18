import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocal, deleteLocal } from './storage.ts'
import {
  MAX_VERSIONS,
  addVersion,
  deleteVersion,
  listVersions,
  readVersion,
  versionsKey,
} from './versions.ts'

/** A stand-in for the browser's storage, kept in a map, that holds at most `room` characters. */
function memoryStorage(room = Infinity): Storage {
  const items = new Map<string, string>()
  const used = (): number => [...items.values()].reduce((sum, value) => sum + value.length, 0)
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => {
      const before = items.get(key)?.length ?? 0
      if (used() - before + String(value).length > room) throw new Error('QuotaExceededError')
      items.set(key, String(value))
    },
  }
}

function useStorage(store: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
}

beforeEach(() => useStorage(memoryStorage()))

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('versions of a project', () => {
  it('keeps versions, the latest first, and reads one back', () => {
    const first = addVersion('p1', 'text one', 'First', false)!
    const second = addVersion('p1', 'text two', '  Second  ', true)!
    expect(listVersions('p1').map((version) => version.name)).toEqual(['Second', 'First'])
    expect(second.saved).toBeGreaterThan(first.saved)
    expect(second.auto).toBe(true)
    expect(readVersion('p1', first.id)).toBe('text one')
    expect(readVersion('p1', 'nope')).toBeNull()
    expect(listVersions('p2')).toEqual([])
  })

  it('adds no automatic version with the same text as the latest, but always one by hand', () => {
    const first = addVersion('p1', 'same', 'A', true)!
    expect(addVersion('p1', 'same', 'B', true)).toEqual(first)
    expect(listVersions('p1')).toHaveLength(1)
    expect(addVersion('p1', 'same', 'Mine', false)!.name).toBe('Mine')
    expect(listVersions('p1').map((version) => version.name)).toEqual(['Mine', 'A'])
  })

  it('names a version that has no name', () => {
    expect(addVersion('p1', 'x', '   ', false)!.name).toBe('Version')
  })

  it('keeps at most MAX_VERSIONS, letting the oldest automatic one go first', () => {
    addVersion('p1', 'by hand', 'Kept by hand', false)
    for (let i = 0; i < MAX_VERSIONS + 5; i++) addVersion('p1', `auto ${i}`, `Auto ${i}`, true)
    const versions = listVersions('p1')
    expect(versions).toHaveLength(MAX_VERSIONS)
    expect(versions.some((version) => version.name === 'Kept by hand')).toBe(true)
    expect(versions[0].name).toBe(`Auto ${MAX_VERSIONS + 4}`)
  })

  it('makes room when storage is full, and gives up only when one version does not fit', () => {
    useStorage(memoryStorage(1200))
    for (let i = 0; i < 10; i++) expect(addVersion('p1', `${i}`.repeat(150), `V${i}`, true)).not.toBeNull()
    const versions = listVersions('p1')
    expect(versions.length).toBeGreaterThan(1)
    expect(versions.length).toBeLessThan(10)
    expect(versions[0].name).toBe('V9')
    expect(addVersion('p1', 'y'.repeat(5000), 'Too big', false)).toBeNull()
  })

  it('deletes one version, and all of them with the project', () => {
    const one = addVersion('p1', 'a', 'A', false)!
    addVersion('p1', 'b', 'B', false)
    expect(deleteVersion('p1', one.id)).toBe(true)
    expect(listVersions('p1').map((version) => version.name)).toEqual(['B'])

    const id = createLocal('Adder')!
    addVersion(id, 'c', 'C', false)
    expect(globalThis.localStorage.getItem(versionsKey(id))).not.toBeNull()
    deleteLocal(id)
    expect(globalThis.localStorage.getItem(versionsKey(id))).toBeNull()
  })

  it('reads damaged versions as none, and works without storage', () => {
    globalThis.localStorage.setItem(versionsKey('p1'), '{not json')
    expect(listVersions('p1')).toEqual([])
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(addVersion('p1', 'a', 'A', false)).toBeNull()
    expect(listVersions('p1')).toEqual([])
    expect(deleteVersion('p1', 'v1')).toBe(false)
  })
})
