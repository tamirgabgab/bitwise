import { describe, expect, it } from 'vitest'
import { addComponent, addSubcircuit, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, DocComponent, SubRef, Terminal } from './document.ts'
import { describeCircuit, listWords } from './describe.ts'

const pin = (component: string, port: string): Terminal => ({
  kind: 'pin',
  component,
  port,
})
const nameOf = (part: DocComponent): string => part.type.toUpperCase()

/** A half adder: switches A and B into XOR c3 and AND c4, out to S and C. */
function halfAdder(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 6 }, { label: 'B' }).doc
  doc = addComponent(doc, 'xor', { x: 10, y: 0 }).doc
  doc = addComponent(doc, 'and', { x: 10, y: 6 }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 0 }, { label: 'S' }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 6 }, { label: 'C' }).doc
  for (const gate of ['c3', 'c4']) {
    doc = addWire(doc, pin('c1', 'out'), pin(gate, 'in0'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin(gate, 'in1'))!.doc
  }
  doc = addWire(doc, pin('c3', 'out'), pin('c5', 'in'))!.doc
  return addWire(doc, pin('c4', 'out'), pin('c6', 'in'))!.doc
}

describe('a circuit in words', () => {
  it('says what it is made of and what each output depends on', () => {
    expect(describeCircuit(halfAdder(), 'Half adder', nameOf)).toBe(
      'Half adder has two switches (A, B), two outputs (S, C) and two gates: one AND and one XOR. ' +
        'S depends on A and B, through one XOR. C depends on A and B, through one AND.',
    )
  })

  it('names memory, an output wired straight to a switch, and a problem', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'D' }).doc
    doc = addComponent(doc, 'dff', { x: 10, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 20, y: 0 }, { label: 'Q' }).doc
    doc = addComponent(doc, 'output', { x: 20, y: 8 }, { label: 'Echo' }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'd'))!.doc
    doc = addWire(doc, pin('c2', 'q'), pin('c3', 'in'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c4', 'in'))!.doc
    const text = describeCircuit(doc, 'Main', nameOf)
    expect(text).toContain('one part that keeps a value: one DFF')
    expect(text).toContain('Q depends on D, through one DFF.')
    expect(text).toContain('Echo depends on D directly.')
    expect(text).toContain('It has one possible problem: input clk of DFF is not connected.')
  })

  it('says so when a circuit is empty or shows nothing', () => {
    expect(describeCircuit(emptyDoc(), 'Main', nameOf)).toBe('Main is empty.')
    const lone = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    expect(describeCircuit(lone, 'Main', nameOf)).toContain('It has no output to show a result.')
  })

  it('counts a named circuit, also in a loop', () => {
    const sub: SubRef = {
      circuit: 'k2',
      name: 'Half adder',
      inputs: [{ port: 'c1', label: 'A' }],
      outputs: [{ port: 'c5', label: 'S' }],
    }
    let doc = addSubcircuit(emptyDoc(), sub, { x: 0, y: 0 }).doc // c1
    doc = addWire(doc, pin('c1', 'c5'), pin('c1', 'c1'))!.doc
    const text = describeCircuit(doc, 'Main', (part) => part.sub?.name ?? part.type)
    expect(text).toContain('one named circuit: one Half adder')
    expect(text).toContain('a loop')
    const twice = addSubcircuit(doc, sub, { x: 0, y: 10 }).doc
    expect(describeCircuit(twice, 'Main', (part) => part.sub?.name ?? part.type)).toContain(
      'two named circuits: two Half adders',
    )
  })

  it('lists words as a sentence does', () => {
    expect(listWords([])).toBe('')
    expect(listWords(['A'])).toBe('A')
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
