import { describe, expect, it } from 'vitest'
import { addComponent, addSubcircuit, addWire, connectEnds, emptyDoc, terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { flatten } from './flatten.ts'
import type { FlatPin, Netlist } from './flatten.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit } from './subcircuit.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const key = (component: string, port: string): string => terminalKey(pin(component, port))

/** Switch c1 "A" into NOT c2 into output c3 "Y". */
function inverter(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 16, y: 0 }, { label: 'Y' }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  return addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
}

/** Part c1 stands for `inner`, between switch c2 and output c3. */
function around(inner: Circuit): CircuitDoc {
  let doc = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'input', { x: -12, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 12, y: 0 }).doc
  const ref = subRefOf(inner)
  doc = addWire(doc, pin('c2', 'out'), pin('c1', ref.inputs[0].port))!.doc
  return addWire(doc, pin('c1', ref.outputs[0].port), pin('c3', 'in'))!.doc
}

/** The nodes of a netlist as sorted lists of "part.port". */
function nodes(netlist: Netlist): string[][] {
  const name = (item: FlatPin): string => `${item.part}.${item.port}`
  return netlist.groups.map((group) => group.map(name).sort()).sort()
}

describe('a drawing without named circuits', () => {
  it('keeps every part under its own id', () => {
    const netlist = flatten(inverter())
    expect([...netlist.parts.keys()]).toEqual(['c1', 'c2', 'c3'])
    expect(netlist.parts.get('c2')).toMatchObject({ key: 'c2', type: 'not', delay: 1 })
  })

  it('makes one node of the pins a wire joins', () => {
    expect(nodes(flatten(inverter()))).toEqual([
      ['c1.out', 'c2.in'],
      ['c2.out', 'c3.in'],
    ])
  })

  it('joins pins that meet through a junction', () => {
    const doc = inverter()
    const wire = Object.keys(doc.wires)[0]
    const lamp = addComponent(doc, 'output', { x: 16, y: 6 })
    const next = connectEnds(
      lamp.doc,
      { kind: 'wire', wire, pos: { x: 4, y: 0 } },
      { kind: 'terminal', terminal: pin(lamp.id, 'in') },
    )!
    expect(nodes(flatten(next))).toContainEqual(['c1.out', 'c2.in', `${lamp.id}.in`])
    const junction = Object.keys(next.junctions)[0]
    expect(flatten(next).probes.get(terminalKey({ kind: 'junction', junction }))).toEqual({
      part: 'c1',
      port: 'out',
    })
  })

  it('gives every pin a pin to read its node by: itself', () => {
    const netlist = flatten(inverter())
    expect(netlist.probes.get(key('c2', 'in'))).toEqual({ part: 'c2', port: 'in' })
    expect(netlist.probes.get(key('c3', 'in'))).toEqual({ part: 'c3', port: 'in' })
    expect(netlist.probes.get(key('c1', 'out'))).toEqual({ part: 'c1', port: 'out' })
  })
})

describe('a named circuit used as a part', () => {
  const inner: Circuit = { id: 'k2', name: 'Inverter', doc: inverter() }
  const library = { k2: inner }

  it('puts the parts inside it under the path of the part', () => {
    const netlist = flatten(around(inner), library)
    expect([...netlist.parts.keys()].sort()).toEqual(['c1/c2', 'c2', 'c3'])
  })

  it('turns its switches and outputs into plain nodes', () => {
    expect(nodes(flatten(around(inner), library))).toEqual([
      ['c1/c2.in', 'c2.out'],
      ['c1/c2.out', 'c3.in'],
    ])
  })

  it('lets the pins of the part be read', () => {
    const netlist = flatten(around(inner), library)
    expect(netlist.probes.get(key('c1', 'c1'))).toBeDefined()
    expect(netlist.probes.get(key('c1', 'c3'))).toBeDefined()
  })

  it('can read a pin of the part that has no wire on it', () => {
    const alone = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
    const netlist = flatten(alone, library)
    expect(netlist.groups).toEqual([])
    expect(netlist.probes.get(key('c1', 'c3'))).toEqual({ part: 'c1/c2', port: 'out' })
  })

  it('keeps two uses of one circuit apart', () => {
    let doc = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
    doc = addSubcircuit(doc, subRefOf(inner), { x: 14, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'c3'), pin('c2', 'c1'))!.doc
    const netlist = flatten(doc, library)
    expect([...netlist.parts.keys()].sort()).toEqual(['c1/c2', 'c2/c2'])
    expect(nodes(netlist)).toEqual([['c1/c2.out', 'c2/c2.in']])
  })

  it('goes as deep as the circuits go', () => {
    const middle: Circuit = { id: 'k3', name: 'Middle', doc: around(inner) }
    const netlist = flatten(around(middle), { k2: inner, k3: middle })
    expect([...netlist.parts.keys()].sort()).toEqual(['c1/c1/c2', 'c2', 'c3'])
    expect(nodes(netlist)).toEqual([
      ['c1/c1/c2.in', 'c2.out'],
      ['c1/c1/c2.out', 'c3.in'],
    ])
  })

  it('joins both sides of a circuit that is only a wire', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 8, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const wire: Circuit = { id: 'k4', name: 'Wire', doc }

    let host = addSubcircuit(emptyDoc(), subRefOf(wire), { x: 0, y: 0 }).doc
    host = addComponent(host, 'input', { x: -12, y: 0 }).doc
    host = addComponent(host, 'output', { x: 12, y: 0 }).doc
    host = addWire(host, pin('c2', 'out'), pin('c1', 'c1'))!.doc
    host = addWire(host, pin('c1', 'c2'), pin('c3', 'in'))!.doc
    expect(nodes(flatten(host, { k4: wire }))).toEqual([['c2.out', 'c3.in']])
  })

  it('keeps a push button inside as a real part', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'button', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 8, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const press: Circuit = { id: 'k5', name: 'Press', doc }
    const host = addSubcircuit(emptyDoc(), subRefOf(press), { x: 0, y: 0 }).doc
    expect([...flatten(host, { k5: press }).parts.keys()]).toEqual(['c1/c1'])
  })

  it('leaves out a part whose circuit is not in the library', () => {
    const netlist = flatten(around(inner), {})
    expect([...netlist.parts.keys()].sort()).toEqual(['c2', 'c3'])
    expect(netlist.groups).toEqual([])
  })

  it('stops at a circuit that would contain itself', () => {
    const loop: Circuit = { id: 'k6', name: 'Loop', doc: emptyDoc() }
    const doc = addSubcircuit(inverter(), subRefOf(loop), { x: 0, y: 8 }).doc
    const self: Circuit = { ...loop, doc }
    const host = addSubcircuit(emptyDoc(), subRefOf(self), { x: 0, y: 0 }).doc
    expect([...flatten(host, { k6: self }).parts.keys()]).toEqual(['c1/c2'])
  })
})
