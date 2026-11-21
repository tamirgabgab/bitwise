import { describe, expect, it } from 'vitest'
import { addComponent, addWire, bendWire, connectEnds, emptyDoc, terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { bendChain, unbendWire, wireHandles } from './wireShape.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** A switch c1 wired to an output c2 by wire w3. */
function line(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 0 }).doc
  return addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
}

describe('wireHandles', () => {
  it('puts one handle in the middle of each straight stretch', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 12, y: 4 },
    ]
    expect(wireHandles(path)).toEqual([
      { pos: { x: 3, y: 0 }, level: true },
      { pos: { x: 6, y: 2 }, level: false },
      { pos: { x: 9, y: 4 }, level: true },
    ])
  })

  it('treats points along one line as one stretch, and skips a stretch too short', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 1 },
    ]
    expect(wireHandles(path)).toEqual([{ pos: { x: 4, y: 0 }, level: true }])
  })
})

describe('bendChain and unbendWire', () => {
  it('finds nothing to take away from a wire never bent', () => {
    expect(bendChain(line(), 'w3')?.junctions).toEqual([])
    expect(unbendWire(line(), 'w3')).toBeUndefined()
  })

  it('follows a bent wire from any of its pieces, and joins its ends again', () => {
    const bent = bendWire(line(), 'w3', [{ x: 8, y: 0 }, { x: 12, y: 0 }], 0, 4)!
    const doc = bent.doc
    const pieces = Object.keys(doc.wires)
    expect(pieces.length).toBe(3)
    for (const piece of pieces) {
      const chain = bendChain(doc, piece)!
      expect([...chain.wires].sort()).toEqual([...pieces].sort())
      expect([...chain.junctions].sort()).toEqual([...bent.junctions].sort())
    }
    const straight = unbendWire(doc, pieces[1])!
    expect(Object.keys(straight.doc.junctions)).toEqual([])
    const [wire] = Object.values(straight.doc.wires)
    expect([terminalKey(wire.from), terminalKey(wire.to)].sort()).toEqual(
      [terminalKey(pin('c1', 'out')), terminalKey(pin('c2', 'in'))].sort(),
    )
    expect(wire.id).toBe(straight.wire)
  })

  it('stops at a junction where a wire branches', () => {
    let doc = line()
    doc = addComponent(doc, 'output', { x: 20, y: 10 }).doc
    doc = connectEnds(doc, { kind: 'wire', wire: 'w3', pos: { x: 10, y: 0 } }, { kind: 'terminal', terminal: pin('c4', 'in') })!
    // Three wires meet at the junction: it is a branch, not a bend.
    for (const id of Object.keys(doc.wires)) expect(bendChain(doc, id)?.junctions).toEqual([])
  })
})
