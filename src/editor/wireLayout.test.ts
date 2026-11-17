import { describe, expect, it } from 'vitest'
import { addComponent, addWire, connectEnds, emptyDoc, moveItems, terminalEnd } from './document.ts'
import type { CircuitDoc, DocWire, Terminal } from './document.ts'
import type { Point } from './geometry.ts'
import { routeWire } from './routing.ts'
import { bendPoints, branchPoints, pathsClash, runAt, wirePath, wirePaths } from './wireLayout.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const points = (...flat: number[]): Point[] => {
  const result: Point[] = []
  for (let i = 0; i < flat.length; i += 2) result.push({ x: flat[i], y: flat[i + 1] })
  return result
}

/**
 * Two inputs feeding an AND gate that sits higher than both. Routed on its
 * own, each wire turns at the same spot, and the picture reads as if the
 * inputs were swapped.
 */
function crowded(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'and', { x: 7, y: -5 }).doc
  doc = addComponent(doc, 'input', { x: -10, y: -4 }).doc
  doc = addComponent(doc, 'input', { x: -10, y: 4 }).doc
  doc = addWire(doc, pin('c2', 'out'), pin('c1', 'in0'))!.doc
  doc = addWire(doc, pin('c3', 'out'), pin('c1', 'in1'))!.doc
  return doc
}

describe('pathsClash', () => {
  const across = points(0, 5, 10, 5)

  it('lets wires cross at right angles', () => {
    expect(pathsClash(across, points(5, 0, 5, 10))).toBe(false)
  })

  it('flags a corner that sits on the other wire', () => {
    expect(pathsClash(across, points(5, 0, 5, 5, 8, 5, 8, 9))).toBe(true)
    expect(pathsClash(across, points(5, 0, 5, 5, 20, 5))).toBe(true)
    expect(pathsClash(points(5, 0, 5, 5, 5, 9), points(0, 5, 5, 5, 5, 2))).toBe(true)
  })

  it('flags wires that share a stretch', () => {
    expect(pathsClash(across, points(4, 5, 30, 5))).toBe(true)
    expect(pathsClash(points(2, 0, 2, 8), points(2, 6, 2, 20))).toBe(true)
  })

  it('accepts wires that only line up end to end', () => {
    expect(pathsClash(across, points(10, 5, 20, 5))).toBe(false)
    expect(pathsClash(across, points(0, 6, 10, 6))).toBe(false)
  })
})

describe('wirePaths', () => {
  it('gives every wire the path between its two ends', () => {
    const doc = crowded()
    for (const wire of Object.values(doc.wires)) {
      const path = wirePath(doc, wire)!
      expect(path[0]).toEqual(terminalEnd(doc, wire.from)!.pos)
      expect(path[path.length - 1]).toEqual(terminalEnd(doc, wire.to)!.pos)
    }
  })

  it('moves a wire to another channel rather than let it touch another net', () => {
    const doc = crowded()
    const [first, second] = Object.values(doc.wires)
    const natural = (wire: typeof first) =>
      routeWire(terminalEnd(doc, wire.from)!, terminalEnd(doc, wire.to)!)
    expect(pathsClash(natural(first), natural(second))).toBe(true)

    expect(wirePath(doc, first)).toEqual(natural(first))
    expect(wirePath(doc, second)).not.toEqual(natural(second))
    expect(pathsClash(wirePath(doc, first)!, wirePath(doc, second)!)).toBe(false)
  })

  it('lets wires of one net share a channel', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: -4 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: 4 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
    const [up, down] = Object.values(doc.wires)
    expect(wirePath(doc, up)).toEqual(points(2, 0, 6, 0, 6, -4, 10, -4))
    expect(wirePath(doc, down)).toEqual(points(2, 0, 6, 0, 6, 4, 10, 4))
  })

  it('works the layout out once per document', () => {
    const doc = crowded()
    expect(wirePaths(doc)).toBe(wirePaths(doc))
    expect(wirePaths(moveItems(doc, ['c1'], 1, 0))).not.toBe(wirePaths(doc))
  })

  it('has no path for a wire with a missing end', () => {
    const doc = crowded()
    const components = { ...doc.components }
    delete components.c1
    const broken: CircuitDoc = { ...doc, components }
    expect(wirePaths(broken).size).toBe(0)
  })
})

describe('branchPoints', () => {
  it('is empty when no two wires of a net part ways', () => {
    expect(branchPoints(crowded())).toEqual([])
  })

  it('marks where two wires from the same pin split', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: -4 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: 4 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
    expect(branchPoints(doc)).toEqual([{ x: 6, y: 0 }])
  })

  it('leaves a real junction to draw its own dot', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 12, y: 6 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const wire = Object.keys(doc.wires)[0]
    doc = connectEnds(
      doc,
      { kind: 'terminal', terminal: pin('c3', 'in') },
      { kind: 'wire', wire, pos: { x: 6, y: 0 } },
    )!
    expect(branchPoints(doc)).toEqual([])
  })
})

describe('runAt', () => {
  const path: Point[] = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 4 },
    { x: 9, y: 4 },
  ]
  it('gives the whole straight stretch through a point, in path order', () => {
    expect(runAt(path, { x: 1, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }])
    expect(runAt(path, { x: 5, y: 2 })).toEqual([{ x: 5, y: 0 }, { x: 5, y: 4 }])
    expect(runAt(path, { x: 7, y: 4 })).toEqual([{ x: 5, y: 4 }, { x: 9, y: 4 }])
  })
  it('gives nothing off the path', () => {
    expect(runAt(path, { x: 3, y: 2 })).toBeUndefined()
  })
})

describe('bendPoints', () => {
  const path: Point[] = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 7, y: 4 },
  ]
  const between = (from: Terminal | { kind: 'junction'; id: string }, to: typeof from) =>
    ({ id: 'w1', from, to }) as DocWire
  it('takes the stretch one step in from a pin', () => {
    const wire = between(pin('a', 'out'), pin('b', 'in'))
    expect(bendPoints(wire, path, { x: 3, y: 0 })).toEqual({
      at: [{ x: 1, y: 0 }, { x: 6, y: 0 }],
      level: true,
    })
  })
  it('keeps the ends at junctions, and moves one point when a short stretch meets itself', () => {
    const wire = between({ kind: 'junction', id: 'j1' }, { kind: 'junction', id: 'j2' })
    expect(bendPoints(wire, path, { x: 3, y: 0 })?.at).toEqual([{ x: 0, y: 0 }, { x: 6, y: 0 }])
    expect(bendPoints(wire, path, { x: 6, y: 2 })).toEqual({
      at: [{ x: 6, y: 0 }, { x: 6, y: 4 }],
      level: false,
    })
    expect(bendPoints(wire, path, { x: 3, y: 9 })).toBeUndefined()
  })
})
