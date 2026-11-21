import { describe, expect, it } from 'vitest'
import { addComponent, emptyDoc } from './document.ts'
import { freeSpot } from './freeSpot.ts'
import { componentBounds } from './hitTest.ts'

describe('freeSpot', () => {
  it('keeps the point asked for on an empty drawing', () => {
    expect(freeSpot(emptyDoc(), 'and', undefined, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  it('moves a new part off one already there, as near as it can', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    const spot = freeSpot(doc, 'and', undefined, { x: 0, y: 0 })
    expect(spot).not.toEqual({ x: 0, y: 0 })
    doc = addComponent(doc, 'and', spot).doc
    const [a, b] = Object.keys(doc.components).map((id) => componentBounds(doc, id)!)
    const apart = a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0
    expect(apart).toBe(true)
    // Below or above, not far to the side.
    expect(spot.x).toBe(0)
  })

  it('finds room for each of several parts added at the same point', () => {
    let doc = emptyDoc()
    for (let i = 0; i < 5; i++) {
      doc = addComponent(doc, 'or', freeSpot(doc, 'or', undefined, { x: 0, y: 0 })).doc
    }
    const boxes = Object.keys(doc.components).map((id) => componentBounds(doc, id)!)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true)
      }
    }
  })
})
