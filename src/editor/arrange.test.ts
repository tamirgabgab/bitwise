import { describe, expect, it } from 'vitest'
import { alignItems, distributeItems } from './arrange.ts'
import { addComponent, addJunction, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { componentBounds } from './hitTest.ts'

/** Three NOT gates, c1 to c3, scattered. */
function scattered(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'not', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 7, y: 5 }).doc
  doc = addComponent(doc, 'not', { x: 20, y: 30 }).doc
  return doc
}

const positions = (doc: CircuitDoc) => Object.values(doc.components).map((part) => part.pos)

describe('alignItems', () => {
  it('lines parts up on an edge', () => {
    const left = alignItems(scattered(), ['c1', 'c2', 'c3'], 'left')
    expect(positions(left).map((pos) => pos.x)).toEqual([0, 0, 0])
    expect(positions(left).map((pos) => pos.y)).toEqual([0, 5, 30])
    const bottom = alignItems(scattered(), ['c1', 'c2', 'c3'], 'bottom')
    expect(positions(bottom).map((pos) => pos.y)).toEqual([30, 30, 30])
    expect(positions(alignItems(scattered(), ['c1', 'c2'], 'right')).map((pos) => pos.x)).toEqual([
      7, 7, 20,
    ])
    expect(positions(alignItems(scattered(), ['c1', 'c2'], 'top')).map((pos) => pos.y)).toEqual([
      0, 0, 30,
    ])
  })

  it('lines parts up on their middles', () => {
    const doc = alignItems(scattered(), ['c1', 'c3'], 'centerX')
    expect(doc.components.c1.pos.x).toBe(10)
    expect(doc.components.c3.pos.x).toBe(10)
    expect(doc.components.c2.pos.x).toBe(7)
    const rows = alignItems(scattered(), ['c1', 'c3'], 'centerY')
    expect(rows.components.c1.pos.y).toBe(15)
    expect(rows.components.c3.pos.y).toBe(15)
  })

  it('lines up the boxes, not the origins, of parts of different sizes', () => {
    let doc = addComponent(emptyDoc(), 'not', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'dff', { x: 9, y: 9 }).doc
    const aligned = alignItems(doc, ['c1', 'c2'], 'left')
    const first = componentBounds(aligned, 'c1')!
    const second = componentBounds(aligned, 'c2')!
    expect(Math.abs(first.x0 - second.x0)).toBeLessThanOrEqual(0.5)
    for (const part of Object.values(aligned.components)) {
      expect(Number.isInteger(part.pos.x)).toBe(true)
    }
  })

  it('needs two parts, and ignores junctions and wires', () => {
    const doc = scattered()
    expect(alignItems(doc, ['c1'], 'left')).toBe(doc)
    const withDot = addJunction(doc, { x: 40, y: 40 })
    expect(alignItems(withDot.doc, ['c1', withDot.id], 'left')).toBe(withDot.doc)
    expect(alignItems(doc, ['c1', 'c2', 'c3'], 'left')).not.toBe(doc)
  })

  it('returns the same drawing when everything is in line already', () => {
    const lined = alignItems(scattered(), ['c1', 'c2', 'c3'], 'left')
    expect(alignItems(lined, ['c1', 'c2', 'c3'], 'left')).toBe(lined)
  })
})

describe('distributeItems', () => {
  it('spaces the middles evenly and keeps the two ends in place', () => {
    const across = distributeItems(scattered(), ['c1', 'c2', 'c3'], 'x')
    expect(positions(across).map((pos) => pos.x)).toEqual([0, 10, 20])
    const down = distributeItems(scattered(), ['c3', 'c2', 'c1'], 'y')
    expect(positions(down).map((pos) => pos.y)).toEqual([0, 15, 30])
  })

  it('needs three parts', () => {
    const doc = scattered()
    expect(distributeItems(doc, ['c1', 'c3'], 'x')).toBe(doc)
  })
})
