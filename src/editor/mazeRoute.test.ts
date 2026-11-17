import { describe, expect, it } from 'vitest'
import { addComponent, addWire, emptyDoc, moveItems } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'
import { mazeRoute } from './mazeRoute.ts'
import type { Terrain, WireMark } from './mazeRoute.ts'
import { pathsClash, wirePath, wirePaths } from './wireLayout.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const RIGHT: Point = { x: 1, y: 0 }
const LEFT: Point = { x: -1, y: 0 }

const OPEN: Terrain = { blocked: () => false, wire: () => undefined }

/** Ground where the given rectangles are solid. */
function walls(...rects: Rect[]): Terrain {
  return {
    blocked: (x, y) => rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1),
    wire: () => undefined,
  }
}

function corners(path: readonly Point[]): number {
  return path.length - 2
}

/** Every grid point a path passes, ends included. */
function cellsOf(path: readonly Point[]): Point[] {
  const cells: Point[] = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]
    const to = path[i]
    const steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    for (let step = 1; step <= steps; step++) {
      cells.push({
        x: from.x + Math.sign(to.x - from.x) * step,
        y: from.y + Math.sign(to.y - from.y) * step,
      })
    }
  }
  return cells
}

describe('mazeRoute', () => {
  it('goes straight when nothing is in the way', () => {
    const path = mazeRoute({ pos: { x: 0, y: 0 }, dir: RIGHT }, { pos: { x: 10, y: 0 }, dir: LEFT }, OPEN)
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
  })

  it('uses only horizontal and vertical runs', () => {
    const path = mazeRoute({ pos: { x: 0, y: 0 }, dir: RIGHT }, { pos: { x: 9, y: 5 }, dir: LEFT }, OPEN)!
    for (let i = 1; i < path.length; i++) {
      expect(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y).toBe(true)
    }
    expect(corners(path)).toBe(2)
  })

  it('goes around a wall', () => {
    const wall: Rect = { x0: 4, y0: -3, x1: 6, y1: 3 }
    const path = mazeRoute(
      { pos: { x: 0, y: 0 }, dir: RIGHT },
      { pos: { x: 10, y: 0 }, dir: LEFT },
      walls(wall),
    )!
    expect(path[0]).toEqual({ x: 0, y: 0 })
    expect(path[path.length - 1]).toEqual({ x: 10, y: 0 })
    for (const cell of cellsOf(path)) {
      const inside = cell.x >= wall.x0 && cell.x <= wall.x1 && cell.y >= wall.y0 && cell.y <= wall.y1
      expect(inside).toBe(false)
    }
  })

  it('leaves a pin straight out and arrives straight in', () => {
    const path = mazeRoute(
      { pos: { x: 0, y: 0 }, dir: RIGHT },
      { pos: { x: -6, y: 4 }, dir: LEFT },
      OPEN,
    )!
    expect(path[1]).toEqual({ x: 1, y: 0 })
    expect(path[path.length - 2]).toEqual({ x: -7, y: 4 })
  })

  it('crosses another wire at a right angle but never runs along it or turns on it', () => {
    // A wire of another net along the row y = 2, from x = -20 to 20.
    const row: Terrain = {
      blocked: () => false,
      wire: (x, y): WireMark | undefined => (y === 2 && Math.abs(x) <= 20 ? 'h' : undefined),
    }
    const path = mazeRoute({ pos: { x: 0, y: 0 } }, { pos: { x: 6, y: 5 } }, row)!
    const onRow = cellsOf(path).filter((cell) => cell.y === 2)
    expect(onRow).toHaveLength(1)
    expect(path.some((corner) => corner.y === 2)).toBe(false)
  })

  it('does not cross where another wire turns or ends', () => {
    const post: Terrain = {
      blocked: () => false,
      wire: (x, y): WireMark | undefined => (x === 5 && y === 0 ? 'x' : undefined),
    }
    const path = mazeRoute({ pos: { x: 0, y: 0 }, dir: RIGHT }, { pos: { x: 10, y: 0 }, dir: LEFT }, post)!
    expect(cellsOf(path).some((cell) => cell.x === 5 && cell.y === 0)).toBe(false)
  })

  it('gives up when the goal is walled in or too far away', () => {
    const box = walls(
      { x0: 7, y0: -3, x1: 13, y1: -3 },
      { x0: 7, y0: 3, x1: 13, y1: 3 },
      { x0: 7, y0: -3, x1: 7, y1: 3 },
      { x0: 13, y0: -3, x1: 13, y1: 3 },
    )
    expect(mazeRoute({ pos: { x: 0, y: 0 } }, { pos: { x: 10, y: 0 } }, box)).toBeUndefined()
    expect(mazeRoute({ pos: { x: 0, y: 0 } }, { pos: { x: 5000, y: 0 } }, OPEN)).toBeUndefined()
  })
})

/** Whether a wire's path enters the box of a part, other than at its ends. */
function entersPart(doc: CircuitDoc, wireId: string, partId: string): boolean {
  const path = wirePath(doc, doc.wires[wireId])!
  const box = componentBounds(doc, partId)!
  return cellsOf(path)
    .slice(1, -1)
    .some((cell) => cell.x >= box.x0 && cell.x <= box.x1 && cell.y >= box.y0 && cell.y <= box.y1)
}

describe('wires and the parts in their way', () => {
  /** Switch c1 wired to output c3, with a flip-flop c2 right between them. */
  function blockedLine(): CircuitDoc {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'dff', { x: 12, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 24, y: 0 }).doc
    return addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
  }

  it('go around a part that sits between the two ends', () => {
    const doc = blockedLine()
    const [wire] = Object.keys(doc.wires)
    expect(entersPart(doc, wire, 'c2')).toBe(false)
    const path = wirePath(doc, doc.wires[wire])!
    expect(path.length).toBeGreaterThan(2)
  })

  it('run straight again once the part is out of the way', () => {
    const doc = moveItems(blockedLine(), ['c2'], 0, 20)
    const [wire] = Object.keys(doc.wires)
    expect(wirePath(doc, doc.wires[wire])).toHaveLength(2)
  })

  it('do not cut through the part they come from when they double back', () => {
    // The output of the gate goes back to a part on its left.
    let doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: -14, y: 0 }, { rotation: 2 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const [wire] = Object.keys(doc.wires)
    expect(entersPart(doc, wire, 'c1')).toBe(false)
    expect(entersPart(doc, wire, 'c2')).toBe(false)
  })

  it('keep clear of each other while going around', () => {
    // Two switches on the left, two outputs on the right, a wall of parts between.
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 4 }).doc
    doc = addComponent(doc, 'dff', { x: 12, y: 2 }).doc
    doc = addComponent(doc, 'output', { x: 24, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 24, y: 4 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c4', 'in'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c5', 'in'))!.doc
    const [first, second] = [...wirePaths(doc).values()]
    expect(pathsClash(first, second)).toBe(false)
    for (const wire of Object.keys(doc.wires)) expect(entersPart(doc, wire, 'c3')).toBe(false)
  })

  it('pass a text label as if it were not there', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 24, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const plain = wirePath(doc, Object.values(doc.wires)[0])
    const noted = { ...doc, components: { ...doc.components } }
    noted.components.c9 = {
      id: 'c9',
      type: 'text',
      params: {},
      delay: 1,
      pos: { x: 12, y: 0 },
      rotation: 0,
      text: 'A note',
    }
    expect(wirePath(noted, Object.values(noted.wires)[0])).toEqual(plain)
  })
})
