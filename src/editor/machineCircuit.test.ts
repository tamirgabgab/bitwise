import { describe, expect, it } from 'vitest'
import { Simulator, formatSignal } from '../core/index.ts'
import type { ComponentId } from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import { addComponent, emptyDoc } from './document.ts'
import type { Machine, MachineRule } from './machine.ts'
import { MAX_MACHINE_ROWS, machineCircuit, minimize, stateDigits } from './machineCircuit.ts'
import type { Cube, RowKind } from './machineCircuit.ts'
import { SimBridge } from './simBridge.ts'

/** A small generator that gives the same numbers on every run. */
function randomFrom(seed: number): (below: number) => number {
  let value = seed
  return (below) => {
    value = (value + 0x6d2b79f5) | 0
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return (((mixed ^ (mixed >>> 14)) >>> 0) % below)
  }
}

/** A machine made up at random. */
function randomMachine(random: (below: number) => number, radix: number): Machine {
  const count = 1 + random(6)
  const inputs = Array.from({ length: random(3) }, (_, input) => `i${input}`)
  const outputs = Array.from({ length: 1 + random(2) }, (_, output) => `o${output}`)
  const states = Array.from({ length: count }, (_, state) => ({
    id: `s${state}`,
    name: `S${state}`,
    pos: { x: 0, y: 0 },
    outputs: outputs.map(() => random(radix)),
  }))
  const rules: MachineRule[] = Array.from({ length: random(3 * count + 1) }, () => ({
    from: `s${random(count)}`,
    to: `s${random(count)}`,
    when: inputs.map(() => (random(3) === 0 ? null : random(radix))),
  }))
  return { inputs, outputs, states, rules }
}

/** Drives a circuit through its switches, by name, and reads its outputs, by name. */
interface Bench {
  drive(name: string, digit: number): void
  read(name: string): string
}

function partBench(machine: Machine, radix: number): Bench {
  const sim = new Simulator(undefined, radix)
  const doc = addComponent(emptyDoc(), 'fsm', { x: 0, y: 0 }, { machine }).doc
  const part = sim.addComponent('fsm', { params: doc.components.c1.params })
  const ports = new Map([...machine.inputs.map((name, input) => [name, `in${input}`] as const), ['clk', 'clk'], ['reset', 'reset']])
  const sources = new Map<string, ComponentId>()
  for (const [name, port] of ports) {
    const source = sim.addComponent('input', {})
    sim.connect({ component: source, port: 'out' }, { component: part, port })
    sources.set(name, source)
  }
  return {
    drive(name, digit) {
      sim.setState(sources.get(name)!, [digit])
      sim.settle()
    },
    read(name) {
      return formatSignal(sim.readPin({ component: part, port: `out${machine.outputs.indexOf(name)}` }))
    },
  }
}

function circuitBench(doc: CircuitDoc, radix: number): Bench {
  const bridge = new SimBridge(new Simulator(undefined, radix))
  bridge.sync(doc)
  const named = (type: string, name: string): ComponentId => {
    const part = Object.values(doc.components).find((component) => component.type === type && component.label === name)
    return bridge.simComponent(part!.id)!
  }
  return {
    drive(name, digit) {
      bridge.sim.setState(named('input', name), [digit])
      bridge.sim.settle()
    },
    read(name) {
      return formatSignal(bridge.sim.readPin({ component: named('output', name), port: 'in' }))
    },
  }
}

/** Every row of `variables` digits, the first variable changing fastest. */
function rows(variables: number, radix: number): number[][] {
  return Array.from({ length: radix ** variables }, (_, index) =>
    Array.from({ length: variables }, (_, variable) => Math.floor(index / radix ** variable) % radix),
  )
}

const covered = (cubes: readonly Cube[], row: readonly number[]): boolean =>
  cubes.some((cube) => cube.every((value, variable) => value === -1 || value === row[variable]))

describe('minimize', () => {
  it('finds the one cube of a function that depends on one variable', () => {
    expect(minimize(3, 2, (row) => (row[0] === 1 ? 'on' : 'off'))).toEqual([[1, -1, -1]])
  })

  it('uses the rows that do not matter to make the cubes larger', () => {
    // On at 11, free at 10: a alone is enough.
    const kind = (row: readonly number[]): RowKind => (row[0] === 1 ? (row[1] === 1 ? 'on' : 'free') : 'off')
    expect(minimize(2, 2, kind)).toEqual([[1, -1]])
  })

  it('merges across all the values of a digit at radix 3', () => {
    expect(minimize(2, 3, (row) => (row[1] === 2 ? 'on' : 'off'))).toEqual([[-1, 2]])
  })

  it('covers every row that is on and none that is off, at radix 2 and 3', () => {
    const random = randomFrom(7)
    for (const radix of [2, 3]) {
      for (let round = 0; round < 20; round++) {
        const variables = 1 + random(radix === 2 ? 5 : 3)
        const kinds = rows(variables, radix).map((): RowKind => (['on', 'off', 'free'] as const)[random(3)])
        const kindOf = (row: readonly number[]): RowKind =>
          kinds[row.reduce((sum, value, variable) => sum + value * radix ** variable, 0)]
        const cubes = minimize(variables, radix, kindOf)
        for (const row of rows(variables, radix)) {
          if (kindOf(row) === 'on') expect(covered(cubes, row)).toBe(true)
          if (kindOf(row) === 'off') expect(covered(cubes, row)).toBe(false)
        }
      }
    }
  })
})

describe('machineCircuit', () => {
  it('keeps the state in as few digits as hold every state', () => {
    expect(stateDigits(1, 2)).toBe(1)
    expect(stateDigits(5, 2)).toBe(3)
    expect(stateDigits(9, 3)).toBe(2)
    expect(stateDigits(16, 16)).toBe(1)
  })

  it('builds a circuit that behaves like the machine, at radix 2 and 3', () => {
    const random = randomFrom(11)
    for (const radix of [2, 3]) {
      for (let round = 0; round < 25; round++) {
        const machine = randomMachine(random, radix)
        const doc = machineCircuit(machine, radix)
        if (typeof doc === 'string') throw new Error(doc)
        const part = partBench(machine, radix)
        const gates = circuitBench(doc, radix)
        const both = (name: string, digit: number): void => {
          part.drive(name, digit)
          gates.drive(name, digit)
        }
        const same = (): void => {
          for (const name of machine.outputs) expect(gates.read(name)).toBe(part.read(name))
        }
        both('reset', 0)
        both('clk', 0)
        for (const name of machine.inputs) both(name, 0)
        same()
        for (let step = 0; step < 30; step++) {
          for (const name of machine.inputs) both(name, random(radix))
          if (random(10) === 0) {
            both('reset', radix - 1)
            same()
            both('reset', 0)
          }
          both('clk', radix - 1)
          same()
          both('clk', 0)
          same()
        }
      }
    }
  })

  it('names the switches and outputs as the machine does, and keeps the state in flip-flops', () => {
    const machine: Machine = {
      inputs: ['go'],
      outputs: ['on'],
      states: [
        { id: 's1', name: 'Off', pos: { x: 0, y: 0 }, outputs: [0] },
        { id: 's2', name: 'On', pos: { x: 0, y: 0 }, outputs: [1] },
      ],
      rules: [
        { from: 's1', to: 's2', when: [1] },
        { from: 's2', to: 's1', when: [1] },
      ],
    }
    const doc = machineCircuit(machine, 2) as CircuitDoc
    const parts = Object.values(doc.components)
    expect(parts.filter((part) => part.type === 'input').map((part) => part.label)).toEqual(['go', 'clk', 'reset'])
    expect(parts.filter((part) => part.type === 'output').map((part) => part.label)).toEqual(['on'])
    expect(parts.filter((part) => part.type === 'dff')).toHaveLength(1)
  })

  it('says why it cannot build a machine', () => {
    const machine: Machine = {
      inputs: ['a', 'b', 'c', 'd'],
      outputs: ['y'],
      states: Array.from({ length: 16 }, (_, state) => ({
        id: `s${state}`,
        name: `S${state}`,
        pos: { x: 0, y: 0 },
        outputs: [state === 3 ? 7 : 0],
      })),
      rules: [],
    }
    expect(machineCircuit(machine, 2)).toMatch(/State “S3” gives y the digit 7, which radix 2 has no room for/)
    expect(machineCircuit({ ...machine, states: machine.states.slice(0, 3) }, 6)).toMatch(
      new RegExp(`at most ${MAX_MACHINE_ROWS}`),
    )
  })
})
