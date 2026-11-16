import { describe, expect, it } from 'vitest'
import { pinGroups, terminalNets } from './connectivity.ts'
import { addComponent, addWire, connectEnds, emptyDoc, terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** Groups as sorted text, so the order pins were visited in does not matter. */
function groupsOf(doc: CircuitDoc): string[] {
  return pinGroups(doc)
    .map((group) =>
      group
        .map((member) => `${member.component}.${member.port}`)
        .sort()
        .join(' '),
    )
    .sort()
}

function threeParts(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'and', { x: 12, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 12, y: -8 }).doc
  return doc
}

describe('pinGroups', () => {
  it('is empty for parts with no wires', () => {
    expect(pinGroups(threeParts())).toEqual([])
  })

  it('groups the two ends of a wire', () => {
    const doc = addWire(threeParts(), pin('c1', 'out'), pin('c2', 'in0'))!.doc
    expect(groupsOf(doc)).toEqual(['c1.out c2.in0'])
  })

  it('joins wires that share a pin', () => {
    let doc = addWire(threeParts(), pin('c1', 'out'), pin('c2', 'in0'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
    expect(groupsOf(doc)).toEqual(['c1.out c2.in0 c3.in'])
  })

  it('joins wires that meet at a junction', () => {
    let doc = addWire(threeParts(), pin('c1', 'out'), pin('c2', 'in0'))!.doc
    const wire = Object.keys(doc.wires)[0]
    doc = connectEnds(
      doc,
      { kind: 'terminal', terminal: pin('c3', 'in') },
      { kind: 'wire', wire, pos: { x: 5, y: 0 } },
    )!
    expect(groupsOf(doc)).toEqual(['c1.out c2.in0 c3.in'])
  })

  it('keeps separate nets apart', () => {
    let doc = addWire(threeParts(), pin('c1', 'out'), pin('c2', 'in0'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
    expect(groupsOf(doc)).toEqual(['c1.out c2.in0', 'c2.out c3.in'])
  })
})

describe('terminalNets', () => {
  it('gives wired terminals one name and other nets a different one', () => {
    let doc = addWire(threeParts(), pin('c1', 'out'), pin('c2', 'in0'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
    const nets = terminalNets(doc)
    const netOf = (terminal: Terminal) => nets.get(terminalKey(terminal))
    expect(netOf(pin('c1', 'out'))).toBe(netOf(pin('c2', 'in0')))
    expect(netOf(pin('c2', 'out'))).toBe(netOf(pin('c3', 'in')))
    expect(netOf(pin('c1', 'out'))).not.toBe(netOf(pin('c2', 'out')))
    expect(netOf(pin('c2', 'in1'))).toBeUndefined()
  })
})
