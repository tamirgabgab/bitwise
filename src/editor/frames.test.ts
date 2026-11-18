import { describe, expect, it } from 'vitest'
import {
  FRAME_TYPE,
  MAX_FRAME,
  MIN_FRAME,
  addComponent,
  addFrame,
  addJunction,
  copyItems,
  emptyDoc,
  frameAround,
  frameContents,
  moveItems,
  resizeFrame,
  rotateComponents,
  setComponentLabel,
  setComponentText,
} from './document.ts'
import type { CircuitDoc } from './document.ts'
import { flatten } from './flatten.ts'
import { componentBounds, frameHandleAt, hitTest, itemsInRect } from './hitTest.ts'
import { fromProjectData, toProjectData } from './project.ts'
import { DEFAULT_SETTINGS } from './store.ts'

/** A frame c1 from (0, 0) to (20, 12) holding an AND c2, with an OR c3 outside it. */
function framed(): CircuitDoc {
  let doc = addFrame(emptyDoc(), { x: 0, y: 0 }, { x: 20, y: 12 }, 'Adder').doc
  doc = addComponent(doc, 'and', { x: 8, y: 6 }).doc
  return addComponent(doc, 'or', { x: 30, y: 6 }).doc
}

describe('frames', () => {
  it('holds what lies wholly inside it', () => {
    let doc = framed()
    doc = addJunction(doc, { x: 4, y: 4 }).doc
    expect(frameContents(doc, 'c1').sort()).toEqual(['c2', 'j4'])
  })

  it('moves what it holds and leaves the rest', () => {
    const doc = moveItems(framed(), ['c1'], 3, 1)
    expect(doc.components.c1.pos).toEqual({ x: 3, y: 1 })
    expect(doc.components.c2.pos).toEqual({ x: 11, y: 7 })
    expect(doc.components.c3.pos).toEqual({ x: 30, y: 6 })
  })

  it('carries a frame inside it, and that frame what it holds', () => {
    let doc = addFrame(emptyDoc(), { x: 0, y: 0 }, { x: 30, y: 20 }).doc
    doc = addFrame(doc, { x: 2, y: 3 }, { x: 14, y: 10 }).doc
    doc = addComponent(doc, 'not', { x: 8, y: 8 }).doc
    const moved = moveItems(doc, ['c1'], 5, 0)
    expect(moved.components.c2.pos.x).toBe(7)
    expect(moved.components.c3.pos.x).toBe(13)
  })

  it('is copied with what it holds', () => {
    const fragment = copyItems(framed(), ['c1'])
    expect(fragment.components.map((part) => part.id).sort()).toEqual(['c1', 'c2'])
  })

  it('goes around the selection with room for its title', () => {
    const doc = framed()
    const around = frameAround(doc, ['c3'])!
    const frame = componentBounds(around.doc, around.id)!
    const part = componentBounds(doc, 'c3')!
    expect(frame.x0).toBeLessThan(part.x0)
    expect(frame.x1).toBeGreaterThan(part.x1)
    expect(part.y0 - frame.y0).toBeGreaterThanOrEqual(2)
    expect(frameContents(around.doc, around.id)).toEqual(['c3'])
    expect(frameAround(doc, [])).toBeUndefined()
  })

  it('keeps its size within bounds', () => {
    const doc = framed()
    expect(resizeFrame(doc, 'c1', { x: 1, y: 900 }).components.c1.size).toEqual({
      x: MIN_FRAME,
      y: MAX_FRAME,
    })
    expect(resizeFrame(doc, 'c1', { x: 20, y: 12 })).toBe(doc)
    expect(resizeFrame(doc, 'c2', { x: 20, y: 12 })).toBe(doc)
  })

  it('takes a title but no name, and does not turn', () => {
    const doc = framed()
    expect(setComponentText(doc, 'c1', 'ALU').components.c1.text).toBe('ALU')
    expect(setComponentLabel(doc, 'c1', 'x')).toBe(doc)
    expect(rotateComponents(doc, ['c1'])).toBe(doc)
  })

  it('is picked up by its title band and edge, not its inside', () => {
    const doc = framed()
    expect(hitTest(doc, { x: 10, y: 0.6 })).toEqual({ kind: 'component', id: 'c1' })
    expect(hitTest(doc, { x: 0.1, y: 9 })).toEqual({ kind: 'component', id: 'c1' })
    expect(hitTest(doc, { x: 3, y: 9 })).toBeNull()
    // A part inside wins over the frame.
    expect(hitTest(doc, { x: 8, y: 6 })).toEqual({ kind: 'component', id: 'c2' })
    // The marquee takes the frame only when it is wholly inside.
    expect(itemsInRect(doc, { x0: 2, y0: 2, x1: 18, y1: 10 })).toEqual(['c2'])
  })

  it('is resized from its lower right corner once selected', () => {
    const doc = framed()
    expect(frameHandleAt(doc, new Set(['c1']), { x: 20.2, y: 11.8 })).toBe('c1')
    expect(frameHandleAt(doc, new Set(), { x: 20.2, y: 11.8 })).toBeUndefined()
  })

  it('is not part of the circuit', () => {
    expect([...flatten(framed()).parts.keys()].sort()).toEqual(['c2', 'c3'])
  })

  it('keeps its title and size in the saved project', () => {
    const doc = framed()
    const circuits = { main: { id: 'main', name: 'Main', doc } }
    const data = toProjectData({
      settings: DEFAULT_SETTINGS,
      circuits,
      order: ['main'],
      active: 'main',
      views: {},
      inputs: {},
      nextCircuit: 1,
    } as unknown as Parameters<typeof toProjectData>[0])
    const loaded = fromProjectData(JSON.parse(JSON.stringify(data)))
    const frame = loaded.circuits.main.doc.components.c1
    expect(frame).toMatchObject({ type: FRAME_TYPE, text: 'Adder', size: { x: 20, y: 12 } })
  })
})
