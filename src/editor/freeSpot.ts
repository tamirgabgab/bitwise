import { builtinComponents, resolveParams } from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'
import { symbolOf } from './symbols.ts'

/** How far a new part may be put from where it was asked for, in grid units. */
const SEARCH = 40
/** The room kept free around a part, in grid units. */
const GAP = 1

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP
}

/**
 * The grid point nearest `near` where a new part of `type` covers no other
 * part, so that parts added one after another by a tap do not land on top
 * of each other. `near` itself when the drawing has room there.
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
  const clear = (p: Point): boolean => {
    const at = { x0: p.x + box.x0, y0: p.y + box.y0, x1: p.x + box.x1, y1: p.y + box.y1 }
    return parts.every((part) => !overlaps(at, part))
  }
  // Ring by ring outward, nearest first, and below before beside, so a column grows.
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
