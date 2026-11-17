import { describe, expect, it } from 'vitest'
import { formatSignal, numberValue } from '../core/index.ts'
import { terminalKey } from './document.ts'
import { EXAMPLES } from './examples.ts'
import { fromProjectData } from './project.ts'
import type { LoadedProject } from './project.ts'
import { SimBridge } from './simBridge.ts'

function load(id: string): LoadedProject {
  const example = EXAMPLES.find((item) => item.id === id)
  if (!example) throw new Error(`No example ${id}`)
  return fromProjectData(example.build())
}

/**
 * Runs one circuit of a project with its switches set by label, and returns
 * what each output part shows, by label.
 */
function run(
  project: LoadedProject,
  name: string,
  inputs: Readonly<Record<string, number>>,
): Record<string, number> {
  const circuit = Object.values(project.circuits).find((item) => item.name === name)
  if (!circuit) throw new Error(`No circuit ${name}`)
  const bridge = new SimBridge()
  bridge.sim.setRadix(project.settings.radix)
  bridge.sync(circuit.doc, project.circuits)
  const parts = Object.values(circuit.doc.components)
  for (const [label, digit] of Object.entries(inputs)) {
    const part = parts.find((item) => item.type === 'input' && item.label === label)
    if (!part || !bridge.setInput(part.id, digit)) throw new Error(`No switch ${label}`)
  }
  bridge.sim.settle()
  const shown: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'output' || !part.label) continue
    const probe = bridge.probeTerminal(terminalKey({ kind: 'pin', component: part.id, port: 'in' }))
    shown[part.label] = probe ? probe.value[0] : NaN
  }
  return shown
}

/** Every combination of values for the given switches. */
function* combinations(labels: readonly string[], radix: number): Generator<Record<string, number>> {
  const total = radix ** labels.length
  for (let n = 0; n < total; n++) {
    const values: Record<string, number> = {}
    labels.forEach((label, index) => {
      values[label] = Math.floor(n / radix ** index) % radix
    })
    yield values
  }
}

/** The number the Q lamps of a counter show, Q0 being the lowest digit. */
function countOf(project: LoadedProject, bridge: SimBridge): number | undefined {
  const doc = project.circuits[project.active].doc
  const lamps = Object.values(doc.components)
    .filter((part) => part.type === 'output')
    .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
  const digits = lamps.map((lamp) => {
    const probe = bridge.probeTerminal(terminalKey({ kind: 'pin', component: lamp.id, port: 'in' }))
    return probe ? probe.value[0] : NaN
  })
  return numberValue(digits, bridge.sim.radix)
}

/** Runs a counter example and reads it just before each rising clock edge. */
function counted(id: string, edges: number): { seen: (number | undefined)[]; bridge: SimBridge } {
  const project = load(id)
  const bridge = new SimBridge()
  bridge.sim.setRadix(project.settings.radix)
  bridge.sync(project.circuits[project.active].doc, project.circuits)
  // The clock first rises after 5 ticks and then every 10.
  bridge.sim.run(5)
  const seen = [countOf(project, bridge)]
  for (let i = 0; i < edges; i++) {
    bridge.sim.run(10)
    seen.push(countOf(project, bridge))
  }
  return { seen, bridge }
}

describe('four-bit counter', () => {
  it('counts from 0 to 15 and starts again', () => {
    const { seen } = counted('binary-counter', 18)
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2])
  })

  it('goes back to 0 while Reset is held', () => {
    const { seen, bridge } = counted('binary-counter', 5)
    expect(seen[5]).toBe(5)
    const project = load('binary-counter')
    const doc = project.circuits[project.active].doc
    const reset = Object.values(doc.components).find((part) => part.type === 'button')
    expect(reset && bridge.setButton(reset.id, true)).toBe(true)
    bridge.sim.run(30)
    expect(countOf(project, bridge)).toBe(0)
  })

  it('shows the count on a number display with one digit per flip-flop', () => {
    const project = load('binary-counter')
    const parts = Object.values(project.circuits[project.active].doc.components)
    expect(parts.filter((part) => part.type === 'jkff')).toHaveLength(4)
    expect(parts.find((part) => part.type === 'display')?.params.digits).toBe(4)
  })
})

describe('ternary counter', () => {
  it('counts from 0 to 8 in radix 3 and starts again', () => {
    const project = load('ternary-counter')
    expect(project.settings.radix).toBe(3)
    const { seen } = counted('ternary-counter', 10)
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1])
  })
})

describe('every example', () => {
  it('is a well-formed project whose circuit parts all resolve', () => {
    for (const example of EXAMPLES) {
      const project = fromProjectData(example.build())
      expect(project.order.length).toBeGreaterThan(0)
      for (const circuit of Object.values(project.circuits)) {
        for (const part of Object.values(circuit.doc.components)) {
          if (part.sub) expect(part.sub.name).toBe(project.circuits[part.sub.circuit].name)
        }
      }
    }
  })
})

describe('two-bit adder', () => {
  const project = load('binary-adder')

  it('has a half adder that adds two bits', () => {
    for (const { A, B } of combinations(['A', 'B'], 2)) {
      expect(run(project, 'Half adder', { A, B })).toEqual({ S: (A + B) % 2, C: Math.floor((A + B) / 2) })
    }
  })

  it('has a full adder that adds three bits', () => {
    for (const { A, B, Cin } of combinations(['A', 'B', 'Cin'], 2)) {
      const sum = A + B + Cin
      expect(run(project, 'Full adder', { A, B, Cin })).toEqual({ S: sum % 2, Cout: Math.floor(sum / 2) })
    }
  })

  it('adds two numbers of two bits each', () => {
    for (const { A0, A1, B0, B1 } of combinations(['A0', 'A1', 'B0', 'B1'], 2)) {
      const sum = A0 + 2 * A1 + B0 + 2 * B1
      expect(run(project, 'Two-bit adder', { A0, A1, B0, B1 })).toEqual({
        S0: sum % 2,
        S1: Math.floor(sum / 2) % 2,
        C: Math.floor(sum / 4),
      })
    }
  })
})

describe('ternary gates', () => {
  const project = load('ternary-gates')

  it('works in radix 3 with the Kleene kit', () => {
    expect(project.settings).toMatchObject({ radix: 3, preset: 'kleene' })
  })

  it('has a Max made from NOT and AND', () => {
    for (const { A, B } of combinations(['A', 'B'], 3)) {
      expect(run(project, 'Max', { A, B })).toEqual({ Max: Math.max(A, B) })
    }
  })

  it('has an Is zero that gives the top value only for 0', () => {
    for (const X of [0, 1, 2]) {
      expect(run(project, 'Is zero', { X })).toEqual({ Is0: X === 0 ? 2 : 0 })
    }
  })

  it('has an Equal that gives the top value only for equal inputs', () => {
    for (const { A, B } of combinations(['A', 'B'], 3)) {
      expect(run(project, 'Equal', { A, B })).toEqual({ Equal: A === B ? 2 : 0 })
    }
  })
})

/** What every named output of the open circuit shows, as text. */
function shownText(project: LoadedProject, bridge: SimBridge): Record<string, string> {
  const shown: Record<string, string> = {}
  for (const part of Object.values(project.circuits[project.active].doc.components)) {
    if (part.type !== 'output' || !part.label) continue
    const probe = bridge.probeTerminal(terminalKey({ kind: 'pin', component: part.id, port: 'in' }))
    shown[part.label] = probe ? formatSignal(probe.value) : '?'
  }
  return shown
}

describe('adder on a bus', () => {
  const project = load('bus-adder')
  const doc = project.circuits[project.active].doc

  it('adds and compares the numbers of each of its steps', () => {
    const bridge = new SimBridge()
    bridge.sync(doc, project.circuits)
    const expected = [
      { Sum: '0101', Carry: '0', 'A<B': '0', 'A=B': '0', 'A>B': '1' },
      { Sum: '0010', Carry: '1', 'A<B': '0', 'A=B': '1', 'A>B': '0' },
      { Sum: '1100', Carry: '0', 'A<B': '0', 'A=B': '1', 'A>B': '0' },
    ]
    const steps = project.circuits[project.active].steps ?? []
    expect(steps).toHaveLength(expected.length)
    steps.forEach((step, index) => {
      for (const [id, value] of Object.entries(step.inputs)) expect(bridge.setInput(id, value)).toBe(true)
      bridge.sim.settle()
      expect(shownText(project, bridge)).toEqual(expected[index])
    })
  })

  it('joins no pins of different widths', () => {
    const bridge = new SimBridge()
    bridge.sync(doc, project.circuits)
    for (const wire of Object.values(doc.wires)) {
      expect(bridge.mixedAt(terminalKey(wire.from))).toBe(false)
      expect(bridge.mixedAt(terminalKey(wire.to))).toBe(false)
    }
  })
})

describe('ternary bus counter', () => {
  const project = load('bus-counter')
  const doc = project.circuits[project.active].doc
  const button = (label: string): string => {
    const part = Object.values(doc.components).find((item) => item.type === 'button' && item.label === label)
    if (!part) throw new Error(`No button ${label}`)
    return part.id
  }

  function started(): SimBridge {
    const bridge = new SimBridge()
    bridge.sim.setRadix(project.settings.radix)
    bridge.sync(doc, project.circuits)
    return bridge
  }

  it('counts from 00 to 22 and raises Full at the end', () => {
    const bridge = started()
    // The clock first rises after 4 ticks and then every 8.
    bridge.sim.run(6)
    const seen: string[] = []
    for (let i = 0; i < 10; i++) {
      const shown = shownText(project, bridge)
      seen.push(shown.Count)
      expect(shown.Full).toBe(shown.Count === '22' ? '2' : '0')
      bridge.sim.run(8)
    }
    expect(seen).toEqual(['01', '02', '10', '11', '12', '20', '21', '22', '00', '01'])
  })

  it('keeps a copy of the count when Keep is pressed', () => {
    const bridge = started()
    bridge.sim.run(6 + 8 * 3)
    expect(shownText(project, bridge)).toMatchObject({ Count: '11', Kept: '00' })
    bridge.setButton(button('Keep'), true)
    bridge.sim.run(3)
    bridge.setButton(button('Keep'), false)
    bridge.sim.run(8 * 2)
    const shown = shownText(project, bridge)
    expect(shown.Kept).toBe('11')
    expect(shown.Count).not.toBe('11')
  })

  it('goes back to 00 while Reset is held', () => {
    const bridge = started()
    bridge.sim.run(30)
    bridge.setButton(button('Reset'), true)
    bridge.sim.run(20)
    expect(shownText(project, bridge).Count).toBe('00')
  })
})
