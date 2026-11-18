import { describe, expect, it } from 'vitest'
import {
  FRAME_TYPE,
  NET_TYPE,
  TEXT_TYPE,
  addComponent,
  addFrame,
  addNetLabel,
  addText,
  addWire,
  bendWire,
  emptyDoc,
  isAnnotation,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { EXAMPLES } from './examples.ts'
import { flatten } from './flatten.ts'
import { componentBounds } from './hitTest.ts'
import { autoLayout } from './layout.ts'
import { fromProjectData } from './project.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** Switches c1 and c2 into AND c3, through NOT c4 to output c5, all out of place. */
function scattered(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 30, y: 20 }).doc
  doc = addComponent(doc, 'input', { x: 2, y: 0 }).doc
  doc = addComponent(doc, 'and', { x: 40, y: -10 }).doc
  doc = addComponent(doc, 'not', { x: -10, y: 12 }).doc
  doc = addComponent(doc, 'output', { x: 0, y: 30 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in1'))!.doc
  doc = addWire(doc, pin('c3', 'out'), pin('c4', 'in'))!.doc
  return addWire(doc, pin('c4', 'out'), pin('c5', 'in'))!.doc
}

/** The nodes of the circuit, as sets of pins: what layout must never change. */
function nodes(doc: CircuitDoc): string[] {
  return flatten(doc)
    .groups.map((group) => group.map((p) => `${p.part}:${p.port}`).sort().join(' '))
    .sort()
}

/** True when no two parts of the circuit overlap. */
function apart(doc: CircuitDoc): boolean {
  const boxes = Object.values(doc.components)
    .filter((part) => !isAnnotation(part.type) && part.type !== NET_TYPE)
    .map((part) => componentBounds(doc, part.id)!)
  return boxes.every((a, i) =>
    boxes.every((b, j) => i >= j || a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0),
  )
}

describe('auto layout', () => {
  it('puts each part one column after what feeds it', () => {
    const doc = autoLayout(scattered())
    const x = (id: string): number => doc.components[id].pos.x
    expect(x('c1')).toBe(x('c2'))
    expect(x('c2')).toBeLessThan(x('c3'))
    expect(x('c3')).toBeLessThan(x('c4'))
    expect(x('c4')).toBeLessThan(x('c5'))
    // The first switch was the lower one, and stays so.
    expect(doc.components.c2.pos.y).toBeLessThan(doc.components.c1.pos.y)
    expect(apart(doc)).toBe(true)
    expect(nodes(doc)).toEqual(nodes(scattered()))
    for (const part of Object.values(doc.components)) {
      expect(Number.isInteger(part.pos.x) && Number.isInteger(part.pos.y)).toBe(true)
    }
  })

  it('moves a frame as one block with what it holds', () => {
    let doc = scattered()
    doc = addFrame(doc, { x: 36, y: -16 }, { x: 16, y: 12 }, 'Gate').doc // around the AND c3
    const before = doc.components.c3.pos
    const frame = Object.values(doc.components).find((part) => part.type === FRAME_TYPE)!
    const after = autoLayout(doc)
    const moved = after.components[frame.id].pos
    expect(after.components.c3.pos.x - moved.x).toBe(before.x - frame.pos.x)
    expect(after.components.c3.pos.y - moved.y).toBe(before.y - frame.pos.y)
  })

  it('takes a net label along with its part, and a text beside it', () => {
    let doc = scattered()
    doc = addNetLabel(doc, { x: -6, y: 12 }, 'Y').doc // c10, by the NOT c4
    doc = addWire(doc, pin('c4', 'out'), pin('c10', 'net'))!.doc
    doc = addText(doc, { x: -10, y: 9 }, 'inverts').doc
    const text = Object.values(doc.components).find((part) => part.type === TEXT_TYPE)!
    const after = autoLayout(doc)
    const offset = (id: string, source: CircuitDoc) => ({
      x: source.components[id].pos.x - source.components.c4.pos.x,
      y: source.components[id].pos.y - source.components.c4.pos.y,
    })
    expect(offset('c10', after)).toEqual(offset('c10', doc))
    expect(offset(text.id, after)).toEqual(offset(text.id, doc))
  })

  it('gets through a loop', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'not', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 0, y: 10 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c1', 'in'))!.doc
    const after = autoLayout(doc)
    expect(after.components.c1.pos.x).not.toBe(after.components.c2.pos.x)
    expect(nodes(after)).toEqual(nodes(doc))
  })

  it('drops the bends of the old wires, and keeps their format', () => {
    let doc = scattered()
    doc = bendWire(doc, 'w8', [{ x: 2, y: 20 }, { x: 2, y: 24 }], 3, 0)!.doc
    expect(Object.keys(doc.junctions)).toHaveLength(2)
    const after = autoLayout(doc)
    expect(after.junctions).toEqual({})
    expect(nodes(after)).toEqual(nodes(doc))
  })

  it('keeps every example working and its parts apart', () => {
    for (const example of EXAMPLES) {
      const project = fromProjectData(example.build())
      for (const circuit of Object.values(project.circuits)) {
        const after = autoLayout(circuit.doc)
        expect(nodes(after), `${example.name}: ${circuit.name}`).toEqual(nodes(circuit.doc))
        expect(apart(after), `${example.name}: ${circuit.name}`).toBe(true)
      }
    }
  })
})
