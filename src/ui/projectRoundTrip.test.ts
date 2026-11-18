import { describe, expect, it } from 'vitest'
import * as editor from '../editor/index.ts'
import { EXAMPLES } from '../editor/index.ts'
import { DEFAULT_SETTINGS, fromProjectData, toProjectData } from '../editor/project.ts'
import * as io from '../io/index.ts'
import { parseProject, serializeProject } from '../io/index.ts'

/*
 * The editor and the file format describe the same shapes without importing
 * each other. This is where they meet, so this is where they are held together.
 */

describe('a project through the file format', () => {
  it('reads every example back as it was written', () => {
    for (const example of EXAMPLES) {
      const data = example.build()
      const text = serializeProject(data)
      expect(parseProject(text)).toEqual(data)
      const loaded = fromProjectData(parseProject(text))
      expect(toProjectData(loaded)).toEqual(toProjectData(fromProjectData(data)))
    }
  })

  it('reads frames and net labels back as they were written', () => {
    const data = EXAMPLES[0].build()
    const [first, ...rest] = data.circuits
    const frame = {
      id: 'c900',
      type: 'frame',
      params: {},
      delay: 1,
      pos: { x: -4, y: -6 },
      rotation: 0,
      text: 'Inputs',
      size: { x: 12, y: 9 },
    }
    const label = {
      id: 'c901',
      type: 'net',
      params: {},
      delay: 1,
      pos: { x: -8, y: 4 },
      rotation: 2,
      label: 'CARRY',
    }
    const withExtras = {
      ...data,
      circuits: [{ ...first, nextId: 902, components: [...first.components, frame, label] }, ...rest],
    }
    const text = serializeProject(withExtras)
    expect(parseProject(text)).toEqual(withExtras)
    const loaded = fromProjectData(parseProject(text))
    expect(toProjectData(loaded)).toEqual(toProjectData(fromProjectData(withExtras)))
    const parts = loaded.circuits[first.id].doc.components
    expect(parts.c900).toMatchObject({ text: 'Inputs', size: { x: 12, y: 9 } })
    expect(parts.c901).toMatchObject({ type: 'net', label: 'CARRY', rotation: 2 })
  })

  it('reads the format of a bus back, and refuses one it does not know', () => {
    const data = EXAMPLES[0].build()
    const [first, ...rest] = data.circuits
    const [wire, ...others] = first.wires
    const withFormat = {
      ...data,
      circuits: [{ ...first, wires: [{ ...wire, format: 'hex' as const }, ...others] }, ...rest],
    }
    const text = serializeProject(withFormat)
    expect(parseProject(text)).toEqual(withFormat)
    const loaded = fromProjectData(parseProject(text))
    expect(loaded.circuits[first.id].doc.wires[wire.id].format).toBe('hex')
    expect(toProjectData(loaded)).toEqual(toProjectData(fromProjectData(withFormat)))
    expect(() => parseProject(text.replace('"hex"', '"octal"'))).toThrow(/written in a way/)
  })

  it('gives a file without colors the colors a new project starts with', () => {
    const data = EXAMPLES[0].build()
    const text = serializeProject({ ...data, settings: { ...data.settings, palette: [] } })
    expect(parseProject(text).settings.palette).toEqual(DEFAULT_SETTINGS.palette)
  })
})

describe('the limits of a file', () => {
  it('are the same in the strict reader and in the editor', () => {
    expect(io.MAX_COORD).toBe(editor.MAX_COORD)
    expect(io.MAX_ITEMS).toBe(editor.MAX_ITEMS)
    expect(io.MAX_CIRCUITS).toBe(editor.MAX_CIRCUITS)
    expect(io.MAX_FLAT_PARTS).toBe(editor.MAX_FLAT_PARTS)
    expect(io.MAX_ID_NUMBER).toBe(editor.MAX_ID_NUMBER)
    expect(io.MAX_FILE_DELAY).toBe(editor.MAX_DELAY)
    for (const id of ['k1', 'c12', 'constructor', '__proto__', '1a', 'a'.repeat(33)]) {
      expect(io.isSafeId(id)).toBe(editor.isSafeId(id))
    }
  })
})
