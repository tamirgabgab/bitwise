import { describe, expect, it } from 'vitest'
import {
  addComponent,
  addWire,
  connectEnds,
  copyItems,
  deleteItems,
  emptyDoc,
  junctionDegrees,
  moveItems,
  pasteFragment,
  rotateComponents,
  terminalEnd,
} from './document.ts'
import type { CircuitDoc, Terminal, WireEnd } from './document.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const at = (terminal: Terminal): WireEnd => ({ kind: 'terminal', terminal })

/** Two inputs (c1, c2) wired to an AND gate (c3) by wires w4 and w5. */
function andCircuit(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 6 }).doc
  doc = addComponent(doc, 'and', { x: 12, y: 3 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in1'))!.doc
  return doc
}

describe('adding parts', () => {
  it('hands out ids in order and fills in default parameters', () => {
    const first = addComponent(emptyDoc(), 'and', { x: 1, y: 2 })
    const second = addComponent(first.doc, 'not', { x: 5, y: 5 })
    expect([first.id, second.id]).toEqual(['c1', 'c2'])
    expect(second.doc.components.c1).toEqual({
      id: 'c1',
      type: 'and',
      params: { inputs: 2, width: 1 },
      delay: 1,
      pos: { x: 1, y: 2 },
      rotation: 0,
    })
  })

  it('refuses an unknown type or a bad parameter', () => {
    expect(() => addComponent(emptyDoc(), 'flux-capacitor', { x: 0, y: 0 })).toThrow()
    expect(() =>
      addComponent(emptyDoc(), 'and', { x: 0, y: 0 }, { params: { inputs: 99 } }),
    ).toThrow()
  })

  it('does not change the document it was given', () => {
    const before = emptyDoc()
    addComponent(before, 'and', { x: 0, y: 0 })
    expect(before).toEqual(emptyDoc())
  })
})

describe('terminalEnd', () => {
  it('follows the position and rotation of the part', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 10, y: 10 }).doc
    expect(terminalEnd(doc, pin('c1', 'out'))).toEqual({ pos: { x: 13, y: 10 }, dir: { x: 1, y: 0 } })
    doc = rotateComponents(doc, ['c1'])
    expect(terminalEnd(doc, pin('c1', 'out'))).toEqual({ pos: { x: 10, y: 13 }, dir: { x: 0, y: 1 } })
  })

  it('is undefined for a part or port that does not exist', () => {
    const doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    expect(terminalEnd(doc, pin('c9', 'out'))).toBeUndefined()
    expect(terminalEnd(doc, pin('c1', 'nope'))).toBeUndefined()
    expect(terminalEnd(doc, { kind: 'junction', junction: 'j9' })).toBeUndefined()
  })
})

describe('wires', () => {
  it('refuses a wire to itself, to nowhere, or a second one between the same ends', () => {
    const doc = andCircuit()
    expect(addWire(doc, pin('c1', 'out'), pin('c1', 'out'))).toBeUndefined()
    expect(addWire(doc, pin('c1', 'out'), pin('c9', 'in0'))).toBeUndefined()
    expect(addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))).toBeUndefined()
    expect(addWire(doc, pin('c3', 'in0'), pin('c1', 'out'))).toBeUndefined()
  })

  it('splits a wire with a junction when a new wire ends on it', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    const next = connectEnds(doc, at(pin('c6', 'in')), {
      kind: 'wire',
      wire: 'w4',
      pos: { x: 6, y: 0 },
    })!
    expect(next.wires.w4).toBeUndefined()
    const junctions = Object.values(next.junctions)
    expect(junctions).toHaveLength(1)
    expect(junctions[0].pos).toEqual({ x: 6, y: 0 })
    expect(Object.keys(next.wires)).toHaveLength(4)
    expect(junctionDegrees(next).get(junctions[0].id)).toBe(3)
  })

  it('reuses a junction that is already at that spot', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    doc = addComponent(doc, 'buffer', { x: 12, y: -10 }).doc
    doc = connectEnds(doc, at(pin('c6', 'in')), { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } })!
    const junction = Object.values(doc.junctions)[0]
    const half = Object.values(doc.wires).find(
      (wire) => wire.to.kind === 'junction' && wire.from.kind === 'pin',
    )!
    const next = connectEnds(doc, at(pin('c7', 'in')), {
      kind: 'wire',
      wire: half.id,
      pos: junction.pos,
    })!
    expect(Object.keys(next.junctions)).toEqual([junction.id])
    expect(junctionDegrees(next).get(junction.id)).toBe(4)
  })

  it('refuses a wire from a wire to itself', () => {
    const doc = andCircuit()
    expect(
      connectEnds(
        doc,
        { kind: 'wire', wire: 'w4', pos: { x: 4, y: 0 } },
        { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } },
      ),
    ).toBeUndefined()
  })
})

describe('moving and rotating', () => {
  it('moves parts and leaves everything else as it was', () => {
    const doc = andCircuit()
    const moved = moveItems(doc, ['c3'], 2, -1)
    expect(moved.components.c3.pos).toEqual({ x: 14, y: 2 })
    expect(moved.components.c1).toBe(doc.components.c1)
    expect(moved.wires).toBe(doc.wires)
    expect(terminalEnd(moved, pin('c3', 'in0'))?.pos).toEqual({ x: 11, y: 1 })
  })

  it('returns the same document when nothing moves', () => {
    const doc = andCircuit()
    expect(moveItems(doc, ['c3'], 0, 0)).toBe(doc)
    expect(moveItems(doc, ['w4', 'missing'], 3, 3)).toBe(doc)
    expect(rotateComponents(doc, ['w4'])).toBe(doc)
  })

  it('turns a part a quarter turn at a time', () => {
    let doc = andCircuit()
    for (const expected of [1, 2, 3, 0]) {
      doc = rotateComponents(doc, ['c3'])
      expect(doc.components.c3.rotation).toBe(expected)
    }
  })
})

describe('deleting', () => {
  it('takes the wires of a deleted part with it', () => {
    const next = deleteItems(andCircuit(), ['c3'])
    expect(Object.keys(next.components)).toEqual(['c1', 'c2'])
    expect(next.wires).toEqual({})
  })

  it('deletes a single wire and nothing else', () => {
    const next = deleteItems(andCircuit(), ['w4'])
    expect(Object.keys(next.components)).toHaveLength(3)
    expect(Object.keys(next.wires)).toEqual(['w5'])
  })

  it('drops a junction once no wire uses it', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    doc = connectEnds(doc, at(pin('c6', 'in')), { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } })!
    const junction = Object.keys(doc.junctions)[0]

    const withoutJunction = deleteItems(doc, [junction])
    expect(withoutJunction.junctions).toEqual({})
    expect(Object.keys(withoutJunction.wires)).toEqual(['w5'])

    const touching = Object.values(doc.wires)
      .filter((wire) => wire.from.kind === 'junction' || wire.to.kind === 'junction')
      .map((wire) => wire.id)
    expect(deleteItems(doc, touching).junctions).toEqual({})
  })

  it('returns the same document when there is nothing to delete', () => {
    const doc = andCircuit()
    expect(deleteItems(doc, [])).toBe(doc)
    expect(deleteItems(doc, ['missing'])).toBe(doc)
  })
})

describe('copy and paste', () => {
  it('copies the wires that run between copied parts, and only those', () => {
    const fragment = copyItems(andCircuit(), ['c1', 'c3'])
    expect(fragment.components.map((component) => component.id)).toEqual(['c1', 'c3'])
    expect(fragment.wires.map((wire) => wire.id)).toEqual(['w4'])
  })

  it('pastes under fresh ids, shifted, and wired to the copies', () => {
    const doc = andCircuit()
    const pasted = pasteFragment(doc, copyItems(doc, ['c1', 'c3']), { x: 2, y: 2 })
    expect(pasted.ids).toEqual(['c6', 'c7'])
    expect(pasted.doc.components.c6.pos).toEqual({ x: 2, y: 2 })
    expect(pasted.doc.components.c7.pos).toEqual({ x: 14, y: 5 })
    expect(pasted.doc.wires.w8).toEqual({
      id: 'w8',
      from: pin('c6', 'out'),
      to: pin('c7', 'in0'),
    })
    expect(pasted.doc.nextId).toBe(9)
    // The original is untouched.
    expect(pasted.doc.components.c1).toBe(doc.components.c1)
    expect(Object.keys(pasted.doc.wires)).toHaveLength(3)
  })
})
