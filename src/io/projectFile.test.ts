import { describe, expect, it } from 'vitest'
import {
  FILE_FORMAT,
  FILE_FORMAT_VERSION,
  ProjectFileError,
  parseProject,
  serializeProject,
} from './projectFile.ts'
import type { ProjectFile } from './projectFile.ts'

type Json = Record<string, unknown>

/** A circuit k2 with a switch wired to a lamp, used as part c1 of k1. */
function sample(): Json {
  return {
    format: FILE_FORMAT,
    version: FILE_FORMAT_VERSION,
    settings: { radix: 3, preset: 'kleene', showDigits: true },
    active: 'k1',
    circuits: [
      {
        id: 'k1',
        name: 'Main',
        nextId: 2,
        components: [{ id: 'c1', type: 'circuit', params: {}, delay: 1, pos: { x: 0, y: 0 }, rotation: 0, circuit: 'k2' }],
        junctions: [],
        wires: [],
        view: { panX: 10, panY: 20, zoom: 2 },
      },
      {
        id: 'k2',
        name: 'Pass',
        nextId: 5,
        components: [
          { id: 'c1', type: 'input', params: {}, delay: 1, pos: { x: 0, y: 0 }, rotation: 0, label: 'A' },
          { id: 'c2', type: 'output', params: {}, delay: 1, pos: { x: 8, y: 0 }, rotation: 0 },
        ],
        junctions: [{ id: 'c3', pos: { x: 4, y: 0 } }],
        wires: [
          { id: 'w4', from: { kind: 'pin', component: 'c1', port: 'out' }, to: { kind: 'junction', junction: 'c3' } },
          { id: 'w5', from: { kind: 'junction', junction: 'c3' }, to: { kind: 'pin', component: 'c2', port: 'in' } },
        ],
        inputs: { c1: 2 },
      },
    ],
  }
}

const text = (data: unknown): string => JSON.stringify(data)

/** The message `parseProject` gives for `data`, which must be refused. */
function refusal(data: unknown): string {
  try {
    parseProject(typeof data === 'string' ? data : text(data))
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError)
    return (error as Error).message
  }
  throw new Error('The file was accepted')
}

/** `sample()` with one circuit changed. */
function withCircuit(index: number, changes: Json): Json {
  const data = sample()
  const circuits = [...(data.circuits as Json[])]
  circuits[index] = { ...circuits[index], ...changes }
  return { ...data, circuits }
}

function withPart(changes: Json): Json {
  const circuit = (sample().circuits as Json[])[1]
  const parts = [...(circuit.components as Json[])]
  parts[0] = { ...parts[0], ...changes }
  return withCircuit(1, { components: parts })
}

describe('parseProject', () => {
  it('reads every circuit, part, junction and wire', () => {
    const project = parseProject(text(sample()))
    expect(project.active).toBe('k1')
    expect(project.circuits.map((circuit) => circuit.name)).toEqual(['Main', 'Pass'])
    expect(project.circuits[0].components[0]).toMatchObject({ type: 'circuit', circuit: 'k2' })
    expect(project.circuits[0].view).toEqual({ panX: 10, panY: 20, zoom: 2 })
    expect(project.circuits[1].components[0].label).toBe('A')
    expect(project.circuits[1].junctions).toHaveLength(1)
    expect(project.circuits[1].wires).toHaveLength(2)
    expect(project.circuits[1].inputs).toEqual({ c1: 2 })
    expect(project.settings).toMatchObject({ radix: 3, preset: 'kleene', showDigits: true })
  })

  it('gives a round trip through text the same project', () => {
    const project = parseProject(text(sample()))
    expect(parseProject(serializeProject(project))).toEqual(project)
    expect(parseProject(serializeProject(project, true))).toEqual(project)
  })

  it('writes the format name and version on every file', () => {
    const saved = JSON.parse(serializeProject(parseProject(text(sample()))))
    expect(saved.format).toBe(FILE_FORMAT)
    expect(saved.version).toBe(FILE_FORMAT_VERSION)
  })

  it('opens a file without settings as binary, with the default colors', () => {
    const data = sample()
    delete data.settings
    const { settings } = parseProject(text(data))
    expect(settings.radix).toBe(2)
    expect(settings.showDigits).toBe(false)
    expect(settings.palette).toHaveLength(10)
  })

  it('swaps a kit it does not know for the default one', () => {
    const data = { ...sample(), settings: { radix: 3, preset: 'no-such-kit' } }
    expect(parseProject(text(data)).settings.preset).toBe(parseProject(text({ ...sample(), settings: { radix: 3 } })).settings.preset)
  })

  it('falls back on the default colors for a damaged palette', () => {
    const data = { ...sample(), settings: { palette: ['red'] } }
    expect(parseProject(text(data)).settings.palette).toHaveLength(10)
  })

  it('opens the first circuit when the open one is unknown', () => {
    expect(parseProject(text({ ...sample(), active: 'k9' })).active).toBe('k1')
  })

  it('sets the next id past every id in use', () => {
    const data = withCircuit(1, { nextId: 1 })
    expect(parseProject(text(data)).circuits[1].nextId).toBe(6)
  })

  it('ignores a damaged view and switch values for parts that are not there', () => {
    const data = withCircuit(1, { view: { panX: 0, panY: 0, zoom: 0 }, inputs: { c1: 1, c9: 1, c2: -1 } })
    const circuit = parseProject(text(data)).circuits[1]
    expect(circuit.view).toBeUndefined()
    expect(circuit.inputs).toEqual({ c1: 1 })
  })

  it('drops a blank label', () => {
    expect(parseProject(text(withPart({ label: '  ' }))).circuits[1].components[0].label).toBeUndefined()
  })
})

describe('parseProject refuses', () => {
  it('text that is not JSON', () => {
    expect(refusal('{ nope')).toMatch(/not valid JSON/)
  })

  it('JSON that is not a project', () => {
    expect(refusal({ hello: 1 })).toBe('This is not a Cedar Logic project file.')
    expect(refusal([1, 2])).toBe('This is not a Cedar Logic project file.')
  })

  it('a file without a valid version', () => {
    expect(refusal({ ...sample(), version: 0 })).toMatch(/no valid format version/)
    expect(refusal({ ...sample(), version: '1' })).toMatch(/no valid format version/)
  })

  it('a file from a newer version, and says so', () => {
    expect(refusal({ ...sample(), version: FILE_FORMAT_VERSION + 1 })).toMatch(/newer version/)
  })

  it('a radix out of range', () => {
    expect(refusal({ ...sample(), settings: { radix: 1 } })).toMatch(/radix must be a whole number/)
    expect(refusal({ ...sample(), settings: { radix: 17 } })).toMatch(/radix/)
    expect(refusal({ ...sample(), settings: { radix: 2.5 } })).toMatch(/radix/)
  })

  it('a project without circuits', () => {
    expect(refusal({ ...sample(), circuits: [] })).toMatch(/no circuits/)
    expect(refusal({ ...sample(), circuits: 'k1' })).toMatch(/must be a list/)
  })

  it('two circuits with one id', () => {
    expect(refusal(withCircuit(1, { id: 'k1' }))).toMatch(/circuit id k1 is used twice/)
  })

  it('a circuit without a name', () => {
    expect(refusal(withCircuit(1, { name: '  ' }))).toMatch(/Circuit k2 has no name/)
  })

  it('a part of an unknown type', () => {
    expect(refusal(withPart({ type: 'laser' }))).toMatch(/unknown type "laser"/)
  })

  it('a part with bad parameters', () => {
    expect(refusal(withPart({ type: 'and', params: { inputs: 'two' } }))).toMatch(/not numbers/)
    expect(refusal(withPart({ type: 'and', params: { inputs: 99 } }))).toMatch(/part c1/)
  })

  it('a part with a bad position, rotation, delay or label', () => {
    expect(refusal(withPart({ pos: { x: 'a', y: 0 } }))).toMatch(/no valid position/)
    expect(refusal(withPart({ rotation: 4 }))).toMatch(/invalid rotation/)
    expect(refusal(withPart({ delay: 0 }))).toMatch(/delay of at least 1/)
    expect(refusal(withPart({ label: 7 }))).toMatch(/label that is not text/)
  })

  it('a part standing for a circuit that is not in the file', () => {
    expect(refusal(withCircuit(0, {
      components: [{ id: 'c1', type: 'circuit', pos: { x: 0, y: 0 }, circuit: 'k9' }],
    }))).toMatch(/circuit that is not in the file/)
  })

  it('an id used twice in one circuit', () => {
    expect(refusal(withPart({ id: 'c2' }))).toMatch(/id c2 is used twice/)
  })

  it('a wire to a part or junction that is not there', () => {
    const circuit = (sample().circuits as Json[])[1]
    const wires = circuit.wires as Json[]
    const toPart = { ...wires[0], from: { kind: 'pin', component: 'c9', port: 'out' } }
    expect(refusal(withCircuit(1, { wires: [toPart] }))).toMatch(/part that is not in the circuit/)
    const toJunction = { ...wires[0], to: { kind: 'junction', junction: 'c9' } }
    expect(refusal(withCircuit(1, { wires: [toJunction] }))).toMatch(/junction that is not in/)
    const nowhere = { ...wires[0], to: { kind: 'air' } }
    expect(refusal(withCircuit(1, { wires: [nowhere] }))).toMatch(/neither a pin nor a junction/)
  })

  it('a circuit that contains itself, directly or through another', () => {
    const self = { id: 'c9', type: 'circuit', pos: { x: 0, y: 9 }, circuit: 'k2' }
    const parts = [...((sample().circuits as Json[])[1].components as Json[]), self]
    expect(refusal(withCircuit(1, { components: parts }))).toMatch(/contains itself/)

    const back = { id: 'c9', type: 'circuit', pos: { x: 0, y: 9 }, circuit: 'k1' }
    const loop = [...((sample().circuits as Json[])[1].components as Json[]), back]
    expect(refusal(withCircuit(1, { components: loop }))).toMatch(/contains itself/)
  })
})

describe('serializeProject', () => {
  it('writes compact text unless asked for pretty text', () => {
    const project: ProjectFile = parseProject(text(sample()))
    expect(serializeProject(project)).not.toContain('\n')
    expect(serializeProject(project, true)).toContain('\n  ')
  })
})

describe('the keyboard key of a part', () => {
  const withPart = (part: Record<string, unknown>): string =>
    JSON.stringify({
      format: 'cedar-logic',
      version: FILE_FORMAT_VERSION,
      settings: {},
      active: 'k1',
      circuits: [
        {
          id: 'k1',
          name: 'Main',
          nextId: 2,
          components: [{ id: 'c1', pos: { x: 0, y: 0 }, ...part }],
          junctions: [],
          wires: [],
        },
      ],
    })

  it('is read on a switch and on a push button', () => {
    expect(parseProject(withPart({ type: 'input', key: 'KeyA' })).circuits[0].components[0].key).toBe('KeyA')
    expect(parseProject(withPart({ type: 'button', key: 'Digit3' })).circuits[0].components[0].key).toBe('Digit3')
    expect('key' in parseProject(withPart({ type: 'input' })).circuits[0].components[0]).toBe(false)
  })

  it('is refused on any other part, and when it is no key a switch can have', () => {
    expect(() => parseProject(withPart({ type: 'and', key: 'KeyA' }))).toThrow(/keyboard key/)
    expect(() => parseProject(withPart({ type: 'input', key: 'KeyR' }))).toThrow(/keyboard key/)
    expect(() => parseProject(withPart({ type: 'input', key: 7 }))).toThrow(/keyboard key/)
  })
})

describe('a text label', () => {
  const withPart = (part: Record<string, unknown>): string =>
    JSON.stringify({
      format: 'cedar-logic',
      version: FILE_FORMAT_VERSION,
      settings: {},
      active: 'k1',
      circuits: [
        {
          id: 'k1',
          name: 'Main',
          nextId: 2,
          components: [{ id: 'c1', pos: { x: 0, y: 0 }, ...part }],
          junctions: [],
          wires: [],
        },
      ],
    })

  it('is read with its writing', () => {
    const part = parseProject(withPart({ type: 'text', text: 'Carry chain' })).circuits[0].components[0]
    expect(part).toMatchObject({ type: 'text', text: 'Carry chain', params: {}, rotation: 0 })
  })

  it('is refused with nothing written on it', () => {
    expect(() => parseProject(withPart({ type: 'text' }))).toThrow(/nothing written/)
    expect(() => parseProject(withPart({ type: 'text', text: '  ' }))).toThrow(/nothing written/)
  })
})

describe('presentation steps', () => {
  const withSteps = (steps: unknown): string =>
    JSON.stringify({
      format: 'cedar-logic',
      version: FILE_FORMAT_VERSION,
      settings: {},
      active: 'k1',
      circuits: [
        {
          id: 'k1',
          name: 'Main',
          nextId: 2,
          components: [{ id: 'c1', type: 'input', pos: { x: 0, y: 0 } }],
          junctions: [],
          wires: [],
          steps,
        },
      ],
    })

  it('are read with their notes and switch values', () => {
    const circuit = parseProject(withSteps([{ note: 'On', inputs: { c1: 1, c9: 1 } }, {}])).circuits[0]
    expect(circuit.steps).toEqual([
      { note: 'On', inputs: { c1: 1 } },
      { note: '', inputs: {} },
    ])
  })

  it('are left out when there are none', () => {
    expect('steps' in parseProject(withSteps([])).circuits[0]).toBe(false)
  })

  it('are refused when they are not a list of steps', () => {
    expect(() => parseProject(withSteps('x'))).toThrow(/steps/)
    expect(() => parseProject(withSteps([7]))).toThrow(/step is not an object/)
    expect(() => parseProject(withSteps([{ note: 7 }]))).toThrow(/note that is not text/)
  })
})

describe('switches on a bus', () => {
  const file = (inputs: unknown, stepInputs: unknown): string =>
    JSON.stringify({
      format: 'cedar-logic',
      version: FILE_FORMAT_VERSION,
      settings: {},
      active: 'k1',
      circuits: [
        {
          id: 'k1',
          name: 'Main',
          nextId: 3,
          components: [
            { id: 'c1', type: 'input', pos: { x: 0, y: 0 }, params: { width: 4 } },
            { id: 'c2', type: 'input', pos: { x: 0, y: 4 } },
          ],
          junctions: [],
          wires: [],
          inputs,
          steps: [{ note: '', inputs: stepInputs }],
        },
      ],
    })

  it('keep their digits as text, next to the plain switches', () => {
    const circuit = parseProject(file({ c1: '0A1F', c2: 1 }, { c1: '0110', c2: 0 })).circuits[0]
    expect(circuit.inputs).toEqual({ c1: '0A1F', c2: 1 })
    expect(circuit.steps).toEqual([{ note: '', inputs: { c1: '0110', c2: 0 } }])
  })

  it('drop a value that is not digits', () => {
    const circuit = parseProject(file({ c1: 'hello', c2: '1' }, { c1: '1Z', c2: 1.5 })).circuits[0]
    expect('inputs' in circuit).toBe(false)
    expect(circuit.steps).toEqual([{ note: '', inputs: {} }])
  })
})
