import { describe, expect, it } from 'vitest'
import { addComponent, addJunction, addText, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { extractCircuit, extractable } from './extract.ts'
import { flatten } from './flatten.ts'
import type { Netlist } from './flatten.ts'
import { interfaceOf } from './subcircuit.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/**
 * Switches c1 "A" and c2 "B" into AND c3, into NOT c4, into output c5 "Y".
 * A second output c6 hangs on the AND gate as well.
 */
function chain(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 6 }, { label: 'B' }).doc
  doc = addComponent(doc, 'and', { x: 12, y: 3 }).doc
  doc = addComponent(doc, 'not', { x: 22, y: 3 }).doc
  doc = addComponent(doc, 'output', { x: 32, y: 3 }, { label: 'Y' }).doc
  doc = addComponent(doc, 'output', { x: 32, y: 10 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in1'))!.doc
  doc = addWire(doc, pin('c3', 'out'), pin('c4', 'in'))!.doc
  doc = addWire(doc, pin('c4', 'out'), pin('c5', 'in'))!.doc
  doc = addWire(doc, pin('c3', 'out'), pin('c6', 'in'))!.doc
  return doc
}

/**
 * The nodes of a netlist, each as the sorted types of the pins on it. Ids
 * change when parts move into a circuit; what is wired to what must not.
 */
function shape(netlist: Netlist): string[] {
  return netlist.groups
    .map((group) =>
      group
        .map((item) => `${netlist.parts.get(item.part)!.type}.${item.port}`)
        .sort()
        .join(' '),
    )
    .sort()
}

describe('extractable', () => {
  it('leaves switches and outputs behind', () => {
    expect(extractable(chain(), ['c1', 'c3', 'c4', 'c5', 'w7', 'nope'])).toEqual(['c3', 'c4'])
  })
})

describe('extractCircuit', () => {
  it('puts one part in place of the selection', () => {
    const result = extractCircuit(chain(), ['c3', 'c4'], 'k9', 'Core')!
    const parts = Object.values(result.doc.components)
    expect(parts.map((part) => part.type).sort()).toEqual([
      'circuit',
      'input',
      'input',
      'output',
      'output',
    ])
    const chip = result.doc.components[result.part]
    expect(chip.sub).toMatchObject({ circuit: 'k9', name: 'Core' })
    expect(chip.pos).toEqual({ x: 17, y: 3 })
  })

  it('makes a pin of every wire that left the selection, named after what it led to', () => {
    const result = extractCircuit(chain(), ['c3', 'c4'], 'k9', 'Core')!
    const pins = interfaceOf(result.inner)
    expect(pins.inputs.map((item) => item.label)).toEqual(['A', 'B'])
    // The AND gate feeds c6 outside as well as the NOT gate inside.
    expect(pins.outputs.map((item) => item.label).sort()).toEqual(['Y', 'out2'].sort())
    expect(result.doc.components[result.part].sub?.inputs).toHaveLength(2)
    expect(result.doc.components[result.part].sub?.outputs).toHaveLength(2)
  })

  it('leaves the circuit wired exactly as it was', () => {
    const before = chain()
    const result = extractCircuit(before, ['c3', 'c4'], 'k9', 'Core')!
    const after = flatten(result.doc, { k9: { doc: result.inner } })
    expect(shape(after)).toEqual(shape(flatten(before)))
    expect(after.parts.size).toBe(flatten(before).parts.size)
  })

  it('takes along the wires and junctions that lie wholly inside', () => {
    let doc = chain()
    const dot = addJunction(doc, { x: 18, y: 3 })
    doc = addWire(dot.doc, pin('c3', 'out'), { kind: 'junction', junction: dot.id })!.doc
    const result = extractCircuit(doc, ['c3', 'c4', dot.id], 'k9', 'Core')!
    expect(Object.keys(result.inner.junctions)).toHaveLength(1)
    expect(Object.keys(result.doc.junctions)).toHaveLength(0)
    const after = flatten(result.doc, { k9: { doc: result.inner } })
    expect(shape(after)).toEqual(shape(flatten(chain())))
  })

  it('turns a pin with no wire into a pin of the new part', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const result = extractCircuit(doc, ['c1', 'c2'], 'k2', 'Pair')!
    const pins = interfaceOf(result.inner)
    expect(pins.inputs).toHaveLength(2)
    expect(pins.outputs).toHaveLength(1)
    expect(Object.keys(result.doc.components)).toEqual([result.part])
    expect(Object.keys(result.doc.wires)).toHaveLength(0)
  })

  it('makes one input of a wire that feeds two parts inside', () => {
    let doc = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 10, y: 6 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
    const result = extractCircuit(doc, ['c2', 'c3'], 'k2', 'Pair')!
    expect(interfaceOf(result.inner).inputs).toHaveLength(1)
    expect(interfaceOf(result.inner).outputs).toHaveLength(2)
    const after = flatten(result.doc, { k2: { doc: result.inner } })
    expect(shape(after)).toEqual(shape(flatten(doc)))
  })

  it('takes a text label along and gives it no pin', () => {
    const noted = addText(chain(), { x: 14, y: -3 }, 'Core')
    const result = extractCircuit(noted.doc, ['c3', 'c4', noted.id], 'k9', 'Core')!
    expect(Object.values(result.inner.components).some((part) => part.text === 'Core')).toBe(true)
    expect(Object.values(result.doc.components).some((part) => part.text === 'Core')).toBe(false)
  })

  it('does nothing when only switches, outputs or wires are picked', () => {
    expect(extractCircuit(chain(), ['c1', 'c5', 'w7'], 'k9', 'Core')).toBeUndefined()
    expect(extractCircuit(chain(), [], 'k9', 'Core')).toBeUndefined()
  })
})
