import type { CircuitDoc, DocComponent } from './document.ts'
import type { Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'

/*
 * Tidying a selection: lining parts up on one edge or one middle line, and
 * spacing them evenly. Only parts move; wires follow on their own. Every
 * part stays on the grid, so a line-up can be off by half a square when two
 * parts have boxes of different sizes.
 */

export type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'
export type Axis = 'x' | 'y'

interface Boxed {
  readonly id: string
  readonly box: Rect
}

function boxes(doc: CircuitDoc, ids: Iterable<string>): Boxed[] {
  const list: Boxed[] = []
  for (const id of new Set(ids)) {
    const box = componentBounds(doc, id)
    if (box) list.push({ id, box })
  }
  return list
}

function shift(doc: CircuitDoc, moves: ReadonlyMap<string, readonly [number, number]>): CircuitDoc {
  let components = doc.components
  for (const [id, [dx, dy]] of moves) {
    if (dx === 0 && dy === 0) continue
    const component = doc.components[id]
    if (components === doc.components) components = { ...components }
    ;(components as Record<string, DocComponent>)[id] = {
      ...component,
      pos: { x: component.pos.x + dx, y: component.pos.y + dy },
    }
  }
  return components === doc.components ? doc : { ...doc, components }
}

// "+ 0" turns a -0 from rounding into a plain 0.
const whole = (value: number): number => Math.round(value) + 0

/** Lines the listed parts up. Needs at least two of them. */
export function alignItems(doc: CircuitDoc, ids: Iterable<string>, edge: AlignEdge): CircuitDoc {
  const list = boxes(doc, ids)
  if (list.length < 2) return doc
  const x0 = Math.min(...list.map((item) => item.box.x0))
  const x1 = Math.max(...list.map((item) => item.box.x1))
  const y0 = Math.min(...list.map((item) => item.box.y0))
  const y1 = Math.max(...list.map((item) => item.box.y1))
  const moves = new Map<string, readonly [number, number]>()
  for (const { id, box } of list) {
    switch (edge) {
      case 'left':
        moves.set(id, [whole(x0 - box.x0), 0])
        break
      case 'right':
        moves.set(id, [whole(x1 - box.x1), 0])
        break
      case 'top':
        moves.set(id, [0, whole(y0 - box.y0)])
        break
      case 'bottom':
        moves.set(id, [0, whole(y1 - box.y1)])
        break
      case 'centerX':
        moves.set(id, [whole((x0 + x1) / 2 - (box.x0 + box.x1) / 2), 0])
        break
      default:
        moves.set(id, [0, whole((y0 + y1) / 2 - (box.y0 + box.y1) / 2)])
    }
  }
  return shift(doc, moves)
}

/**
 * Spaces the middles of the listed parts evenly along an axis. The two at
 * the ends stay where they are. Needs at least three parts.
 */
export function distributeItems(doc: CircuitDoc, ids: Iterable<string>, axis: Axis): CircuitDoc {
  const middle = ({ box }: Boxed): number =>
    axis === 'x' ? (box.x0 + box.x1) / 2 : (box.y0 + box.y1) / 2
  const list = boxes(doc, ids).sort((a, b) => middle(a) - middle(b))
  if (list.length < 3) return doc
  const first = middle(list[0])
  const step = (middle(list[list.length - 1]) - first) / (list.length - 1)
  const moves = new Map<string, readonly [number, number]>()
  list.forEach((item, index) => {
    const by = whole(first + index * step - middle(item))
    moves.set(item.id, axis === 'x' ? [by, 0] : [0, by])
  })
  return shift(doc, moves)
}
