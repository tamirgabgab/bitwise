import { describe, expect, it } from 'vitest'
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

describe('every example', () => {
  it('is a well-formed project whose circuit parts all resolve', () => {
    for (const example of EXAMPLES) {
      const project = fromProjectData(example.build())
      expect(project.order.length).toBeGreaterThan(1)
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
