import { describe, expect, it } from 'vitest'
import { addComponent, emptyDoc, moveItems } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { alignGuides } from './guides.ts'
import { componentBounds } from './hitTest.ts'

/** Two AND gates, c1 at the origin and c2 further right and lower. */
function twoGates(dy: number): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'and', { x: 0, y: 0 }).doc
  return addComponent(doc, 'and', { x: 12, y: dy }).doc
}

describe('alignGuides', () => {
  it('shows nothing when no part moves', () => {
    expect(alignGuides(twoGates(0), new Set())).toEqual([])
  })

  it('shows flat lines when a part comes level with another', () => {
    const doc = twoGates(0)
    const flat = alignGuides(doc, new Set(['c2'])).filter((guide) => guide.axis === 'y')
    const box = componentBounds(doc, 'c1')!
    // Top edge, middle line and bottom edge, and every pin row.
    expect(flat.map((guide) => guide.at)).toEqual(expect.arrayContaining([box.y0, 0, box.y1]))
    const middle = flat.find((guide) => guide.at === 0)!
    // The line runs from the still part to the one that moves.
    expect(middle.from).toBeLessThanOrEqual(box.x0)
    expect(middle.to).toBeGreaterThanOrEqual(componentBounds(doc, 'c2')!.x1)
  })

  it('shows a pin row that lines up even when the boxes do not', () => {
    // One step lower, the top input pin of c2 is level with the output of c1.
    const doc = twoGates(1)
    const flat = alignGuides(doc, new Set(['c2'])).filter((guide) => guide.axis === 'y')
    expect(flat.map((guide) => guide.at)).toContain(0)
  })

  it('shows nothing when nothing lines up', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'and', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'and', { x: 13, y: 37 }).doc
    expect(alignGuides(doc, new Set(['c2']))).toEqual([])
  })

  it('follows a part as it is dragged', () => {
    const doc = moveItems(twoGates(5), new Set(['c2']), 0, -5)
    expect(alignGuides(doc, new Set(['c2'])).some((guide) => guide.axis === 'y' && guide.at === 0)).toBe(true)
  })

  it('draws each line once', () => {
    const guides = alignGuides(twoGates(0), new Set(['c2']))
    const keys = guides.map((guide) => `${guide.axis}:${guide.at}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
