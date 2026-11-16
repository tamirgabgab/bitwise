import { terminalEnd } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import {
  closestOnPolyline,
  distance,
  placeRect,
  rectContainsPoint,
  rectContainsRect,
  snapPoint,
} from './geometry.ts'
import type { Point, Rect } from './geometry.ts'
import { symbolFor } from './symbols.ts'
import { wirePath } from './wireLayout.ts'

/** What the pointer is over. */
export type Hit =
  | { readonly kind: 'pin'; readonly terminal: Terminal; readonly pos: Point }
  | { readonly kind: 'junction'; readonly id: string; readonly pos: Point }
  /** `pos` is the grid point on the wire nearest the pointer. */
  | { readonly kind: 'wire'; readonly id: string; readonly pos: Point }
  | { readonly kind: 'component'; readonly id: string }

const PIN_REACH = 0.55
const JUNCTION_REACH = 0.45
const WIRE_REACH = 0.35

export function componentBounds(doc: CircuitDoc, id: string): Rect | undefined {
  const component = doc.components[id]
  if (!component) return undefined
  const symbol = symbolFor(component.type, component.params)
  return placeRect(symbol.bounds, component.pos, component.rotation)
}

/**
 * Finds what lies under a world position. Small targets win over the larger
 * things they sit on: junctions and pins first, then wires, then parts.
 */
export function hitTest(doc: CircuitDoc, p: Point): Hit | null {
  for (const junction of Object.values(doc.junctions)) {
    if (distance(p, junction.pos) <= JUNCTION_REACH) {
      return { kind: 'junction', id: junction.id, pos: junction.pos }
    }
  }
  for (const component of Object.values(doc.components)) {
    const symbol = symbolFor(component.type, component.params)
    for (const pin of symbol.pins) {
      const terminal: Terminal = { kind: 'pin', component: component.id, port: pin.name }
      const end = terminalEnd(doc, terminal)
      if (end && distance(p, end.pos) <= PIN_REACH) {
        return { kind: 'pin', terminal, pos: end.pos }
      }
    }
  }
  for (const wire of Object.values(doc.wires)) {
    const path = wirePath(doc, wire)
    if (!path) continue
    const nearest = closestOnPolyline(p, path)
    if (distance(p, nearest) <= WIRE_REACH) {
      return { kind: 'wire', id: wire.id, pos: snapPoint(nearest) }
    }
  }
  // Later parts are drawn on top, so they are tried first.
  const ids = Object.keys(doc.components)
  for (let i = ids.length - 1; i >= 0; i--) {
    const bounds = componentBounds(doc, ids[i])
    if (bounds && rectContainsPoint(bounds, p)) return { kind: 'component', id: ids[i] }
  }
  return null
}

/** Everything that lies completely inside a rectangle. */
export function itemsInRect(doc: CircuitDoc, rect: Rect): string[] {
  const ids: string[] = []
  for (const id of Object.keys(doc.components)) {
    const bounds = componentBounds(doc, id)
    if (bounds && rectContainsRect(rect, bounds)) ids.push(id)
  }
  for (const junction of Object.values(doc.junctions)) {
    if (rectContainsPoint(rect, junction.pos)) ids.push(junction.id)
  }
  for (const wire of Object.values(doc.wires)) {
    const path = wirePath(doc, wire)
    if (path && path.every((point) => rectContainsPoint(rect, point))) ids.push(wire.id)
  }
  return ids
}
