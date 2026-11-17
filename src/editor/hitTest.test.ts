import { describe, expect, it } from 'vitest'
import { addComponent, addWire, connectEnds, emptyDoc, moveItems } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { componentBounds, docBounds, hitTest, itemsInRect, terminalOfHit } from './hitTest.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** Input c1 at the origin wired straight across to NOT gate c2 (wire w3). */
function inverter(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 12, y: 0 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  return doc
}

describe('hitTest', () => {
  it('finds nothing on empty canvas', () => {
    expect(hitTest(inverter(), { x: 6, y: 9 })).toBeNull()
  })

  it('finds the body of a part', () => {
    expect(hitTest(inverter(), { x: 0.3, y: -0.4 })).toEqual({ kind: 'component', id: 'c1' })
  })

  it('prefers a pin to the part it belongs to', () => {
    expect(hitTest(inverter(), { x: 2.2, y: 0.3 })).toEqual({
      kind: 'pin',
      terminal: pin('c1', 'out'),
      pos: { x: 2, y: 0 },
    })
  })

  it('finds a wire and reports the grid point on it', () => {
    expect(hitTest(inverter(), { x: 6.3, y: 0.2 })).toEqual({
      kind: 'wire',
      id: 'w3',
      pos: { x: 6, y: 0 },
    })
    expect(hitTest(inverter(), { x: 6.3, y: 0.6 })).toBeNull()
  })

  it('prefers a junction to the wires that meet on it', () => {
    let doc = inverter()
    doc = addComponent(doc, 'buffer', { x: 12, y: 6 }).doc
    doc = connectEnds(
      doc,
      { kind: 'terminal', terminal: pin('c4', 'in') },
      { kind: 'wire', wire: 'w3', pos: { x: 6, y: 0 } },
    )!
    const junction = Object.values(doc.junctions)[0]
    expect(hitTest(doc, { x: 6.2, y: 0.1 })).toEqual({
      kind: 'junction',
      id: junction.id,
      pos: { x: 6, y: 0 },
    })
  })

  it('picks the part drawn on top when two overlap', () => {
    let doc = inverter()
    doc = addComponent(doc, 'input', { x: 0, y: 1 }).doc
    expect(hitTest(doc, { x: 0, y: 0.5 })).toEqual({ kind: 'component', id: 'c4' })
  })
})

describe('componentBounds', () => {
  it('follows the position of the part', () => {
    expect(componentBounds(inverter(), 'c2')).toEqual({ x0: 10, y0: -1, x1: 14, y1: 1 })
    expect(componentBounds(inverter(), 'missing')).toBeUndefined()
  })
})

describe('itemsInRect', () => {
  it('returns what lies completely inside', () => {
    const doc = inverter()
    expect(itemsInRect(doc, { x0: -2, y0: -2, x1: 15, y1: 2 }).sort()).toEqual(['c1', 'c2', 'w3'])
    expect(itemsInRect(doc, { x0: -2, y0: -2, x1: 9, y1: 2 })).toEqual(['c1'])
    expect(itemsInRect(doc, { x0: 3, y0: -2, x1: 9, y1: 2 })).toEqual([])
  })
})

describe('docBounds', () => {
  it('has nothing to give for an empty drawing', () => {
    expect(docBounds(emptyDoc())).toBeUndefined()
  })

  it('surrounds every part', () => {
    const doc = inverter()
    const bounds = docBounds(doc)!
    for (const id of ['c1', 'c2']) {
      const part = componentBounds(doc, id)!
      expect(bounds.x0).toBeLessThanOrEqual(part.x0)
      expect(bounds.y0).toBeLessThanOrEqual(part.y0)
      expect(bounds.x1).toBeGreaterThanOrEqual(part.x1)
      expect(bounds.y1).toBeGreaterThanOrEqual(part.y1)
    }
    expect(bounds.x0).toBe(componentBounds(doc, 'c1')!.x0)
    expect(bounds.x1).toBe(componentBounds(doc, 'c2')!.x1)
  })

  it('reaches out to a junction away from the parts', () => {
    const lamp = addComponent(inverter(), 'output', { x: 12, y: 6 })
    const doc = connectEnds(
      lamp.doc,
      { kind: 'wire', wire: 'w3', pos: { x: 6, y: 0 } },
      { kind: 'terminal', terminal: pin(lamp.id, 'in') },
    )!
    const junction = Object.keys(doc.junctions)[0]
    const moved = moveItems(doc, [junction], 0, 30)
    expect(docBounds(moved)!.y1).toBe(30)
  })
})

describe('terminalOfHit', () => {
  it('names a terminal on the wire under the pointer', () => {
    const doc = inverter()
    expect(terminalOfHit(doc, hitTest(doc, { x: 2.2, y: 0.3 }))).toEqual(pin('c1', 'out'))
    expect(terminalOfHit(doc, hitTest(doc, { x: 6.3, y: 0.2 }))).toEqual(doc.wires.w3.from)
    expect(terminalOfHit(doc, { kind: 'junction', id: 'j9', pos: { x: 0, y: 0 } })).toEqual({
      kind: 'junction',
      junction: 'j9',
    })
  })

  it('has nothing over a part or empty canvas', () => {
    const doc = inverter()
    expect(terminalOfHit(doc, hitTest(doc, { x: 0.3, y: -0.4 }))).toBeUndefined()
    expect(terminalOfHit(doc, null)).toBeUndefined()
  })
})
