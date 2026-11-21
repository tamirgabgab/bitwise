import { builtinComponents, resolveParams } from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'
import { symbolOf } from './symbols.ts'

/** How far a new part may be put from where it was asked for, in grid units. */
const SEARCH = 40
/** How far to the right a new part is first looked for a place, in grid units. */
const BESIDE = 16
/** The room left between a part and the one beside it, for a wire with a bend. */
const ROOM_FOR_WIRE = 4
/** The room kept free around a part, in grid units. */
const GAP = 1

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap
}

/**
 * Where a new part of `type` covers no other part, near `near`: there when
 * there is room, else a little to the right, else the nearest free point,
 * so that parts added one after another by a tap do not land on top of
 * each other and line up as a circuit reads.
 */
export function freeSpot(
  doc: CircuitDoc,
  type: string,
  params: Readonly<Record<string, number>> | undefined,
  near: Point,
): Point {
  const parts = Object.keys(doc.components).flatMap((id) => componentBounds(doc, id) ?? [])
  if (parts.length === 0) return near
  const defaults = builtinComponents.has(type) ? resolveParams(builtinComponents.get(type)) : {}
  const box = symbolOf({ type, params: { ...defaults, ...params } }).bounds
  if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return near
  const clear = (p: Point, gap = GAP): boolean => {
    const at = { x0: p.x + box.x0, y0: p.y + box.y0, x1: p.x + box.x1, y1: p.y + box.y1 }
    return parts.every((part) => !overlaps(at, part, gap))
  }
  // A circuit reads from left to right: the next part goes beside the last, when that is close.
  if (clear(near)) return near
  for (let dx = 1; dx <= BESIDE; dx++) {
    const beside = { x: near.x + dx, y: near.y }
    if (clear(beside, ROOM_FOR_WIRE)) return beside
  }
  // Else ring by ring outward, nearest first.
  for (let ring = 0; ring <= SEARCH; ring++) {
    const spots: Point[] = []
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) spots.push({ x: near.x + dx, y: near.y + dy })
      }
    }
    spots.sort(
      (a, b) =>
        Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y) ||
        Math.abs(a.x - near.x) - Math.abs(b.x - near.x),
    )
    const found = spots.find(clear)
    if (found) return found
  }
  return near
}
