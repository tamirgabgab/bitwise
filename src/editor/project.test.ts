import { describe, expect, it } from 'vitest'
import { addComponent, addSubcircuit, addText, addWire, emptyDoc } from './document.ts'
import type { Terminal } from './document.ts'
import {
  DEFAULT_SETTINGS,
  cleanSettings,
  emptyProject,
  fromProjectData,
  isBlankProject,
  toProjectData,
} from './project.ts'
import type { ProjectData } from './project.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit } from './subcircuit.ts'
import { DEFAULT_PALETTE } from './valueStyle.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** k2 "Pass": switch c1 "A" wired to lamp c2. k1 "Main" uses it as part c1. */
function sample(): ProjectData {
  let inner = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  inner = addComponent(inner, 'output', { x: 8, y: 0 }).doc
  inner = addWire(inner, pin('c1', 'out'), pin('c2', 'in'))!.doc
  const pass: Circuit = { id: 'k2', name: 'Pass', doc: inner }
  const main: Circuit = { id: 'k1', name: 'Main', doc: addSubcircuit(emptyDoc(), subRefOf(pass), { x: 0, y: 0 }).doc }
  return toProjectData(
    { circuits: { k1: main, k2: pass }, order: ['k1', 'k2'], active: 'k2', settings: DEFAULT_SETTINGS },
    { views: { k1: { panX: 1, panY: 2, zoom: 1.5 } }, inputs: { k2: { c1: 1 } } },
  )
}

/** Writes `data` as JSON and reads it back, as a file would be. */
const throughText = (data: unknown): ProjectData => JSON.parse(JSON.stringify(data))

describe('toProjectData and fromProjectData', () => {
  it('give back the same project', () => {
    const loaded = fromProjectData(throughText(sample()))
    expect(loaded.order).toEqual(['k1', 'k2'])
    expect(loaded.active).toBe('k2')
    expect(loaded.circuits.k1.doc.components.c1.sub).toEqual({
      circuit: 'k2',
      name: 'Pass',
      inputs: [{ port: 'c1', label: 'A' }],
      outputs: [{ port: 'c2', label: 'out1' }],
    })
    expect(loaded.views).toEqual({ k1: { panX: 1, panY: 2, zoom: 1.5 } })
    expect(loaded.inputs).toEqual({ k1: {}, k2: { c1: 1 } })
    expect(loaded.nextCircuit).toBe(3)
    expect(toProjectData(loaded, { views: loaded.views, inputs: loaded.inputs })).toEqual(sample())
  })

  it('store a named-circuit part by the id of its circuit only', () => {
    const part = sample().circuits[0].components[0]
    expect(part).toMatchObject({ type: 'circuit', circuit: 'k2', params: {} })
    expect('sub' in part).toBe(false)
  })
})

describe('fromProjectData is lenient', () => {
  it('opens an empty project when there are no circuits', () => {
    const loaded = fromProjectData({ settings: DEFAULT_SETTINGS, circuits: [], active: '' })
    expect(loaded.order).toEqual(emptyProject().order)
    expect(loaded.circuits.k1.name).toBe('Main')
  })

  it('leaves out unknown parts, and the wires on them', () => {
    const data = throughText(sample())
    const pass = data.circuits[1] as unknown as { components: { type: string }[] }
    pass.components[1].type = 'laser'
    const loaded = fromProjectData(data)
    expect(Object.keys(loaded.circuits.k2.doc.components)).toEqual(['c1'])
    expect(loaded.circuits.k2.doc.wires).toEqual({})
  })

  it('removes a part standing for a circuit that is missing or holds its host', () => {
    const data = throughText(sample())
    const pass = data.circuits[1] as unknown as { components: unknown[] }
    pass.components.push({ id: 'c9', type: 'circuit', params: {}, delay: 1, pos: { x: 0, y: 9 }, rotation: 0, circuit: 'k1' })
    pass.components.push({ id: 'c8', type: 'circuit', params: {}, delay: 1, pos: { x: 0, y: 12 }, rotation: 0, circuit: 'k7' })
    const loaded = fromProjectData(data)
    expect(loaded.circuits.k2.doc.components.c8).toBeUndefined()
    // k1 and k2 would hold each other: one of the two uses has to go.
    const uses = [loaded.circuits.k1.doc.components.c1, loaded.circuits.k2.doc.components.c9]
    expect(uses.filter(Boolean)).toHaveLength(1)
  })

  it('drops switch values the radix has no room for', () => {
    const data = throughText(sample())
    const pass = data.circuits[1] as unknown as { inputs: Record<string, number> }
    pass.inputs = { c1: 5, c2: 1 }
    expect(fromProjectData(data).inputs.k2).toEqual({})
  })

  it('names a circuit that has no name, and opens the first when the open one is unknown', () => {
    const data = throughText(sample())
    ;(data.circuits[0] as unknown as { name: string }).name = ''
    const loaded = fromProjectData({ ...data, active: 'k9' })
    expect(loaded.circuits.k1.name).toBe('Circuit 1')
    expect(loaded.active).toBe('k1')
  })
})

describe('cleanSettings', () => {
  it('fills in what is missing, as binary', () => {
    expect(cleanSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(cleanSettings({ radix: 3 })).toMatchObject({ radix: 3, showDigits: true })
  })

  it('throws out values that make no sense', () => {
    expect(cleanSettings({ radix: 40, palette: ['x'], sandbox: 'yes' })).toMatchObject({
      radix: 2,
      palette: DEFAULT_PALETTE,
      sandbox: false,
    })
  })
})

describe('a text label in a project', () => {
  it('survives being written out and read back', () => {
    const added = addText(emptyDoc(), { x: 2, y: 3 }, 'Carry chain')
    const data = toProjectData({
      circuits: { k1: { id: 'k1', name: 'Main', doc: added.doc } },
      order: ['k1'],
      active: 'k1',
      settings: DEFAULT_SETTINGS,
    })
    expect(data.circuits[0].components[0]).toMatchObject({ type: 'text', text: 'Carry chain' })
    const loaded = fromProjectData(data)
    expect(loaded.circuits.k1.doc.components[added.id]).toEqual(added.doc.components[added.id])
  })

  it('is dropped when it says nothing', () => {
    const added = addText(emptyDoc(), { x: 2, y: 3 })
    const data = toProjectData({
      circuits: { k1: { id: 'k1', name: 'Main', doc: added.doc } },
      order: ['k1'],
      active: 'k1',
      settings: DEFAULT_SETTINGS,
    })
    const blank = {
      ...data,
      circuits: [{ ...data.circuits[0], components: [{ ...data.circuits[0].components[0], text: ' ' }] }],
    }
    expect(Object.keys(fromProjectData(blank).circuits.k1.doc.components)).toHaveLength(0)
  })
})

describe('isBlankProject', () => {
  it('is true only for a project as a new one starts', () => {
    const blank = emptyProject()
    expect(isBlankProject(blank)).toBe(true)
    const main = blank.circuits.k1
    const withMain = (circuit: Circuit) => ({ ...blank, circuits: { k1: circuit } })
    expect(isBlankProject({ ...blank, settings: { ...DEFAULT_SETTINGS } })).toBe(true)
    expect(isBlankProject({ ...blank, settings: { ...DEFAULT_SETTINGS, radix: 3 } })).toBe(false)
    expect(isBlankProject(withMain({ ...main, name: 'Adder' }))).toBe(false)
    expect(isBlankProject(withMain({ ...main, steps: [{ note: 'a', inputs: {} }] }))).toBe(false)
    const doc = addComponent(emptyDoc(), 'output', { x: 0, y: 0 }).doc
    expect(isBlankProject(withMain({ ...main, doc }))).toBe(false)
    expect(
      isBlankProject({
        ...blank,
        circuits: { ...blank.circuits, k2: { ...main, id: 'k2' } },
        order: ['k1', 'k2'],
      }),
    ).toBe(false)
  })
})
