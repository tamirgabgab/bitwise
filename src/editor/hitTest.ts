import { FRAME_TYPE, terminalEnd } from './document.ts'
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
import { FRAME_TITLE, symbolOf } from './symbols.ts'
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
/** How close to its edge a frame can be picked up. */
const FRAME_EDGE = 0.4
/** How close to its lower right corner a selected frame can be resized. */
const HANDLE_REACH = 0.7

/**
 * True when `p` is on what can pick a frame up: the band with its title, or
 * its edge. Its inside is left free, to reach the parts there and to drag
 * an area out.
 */
function onFrameGrip(box: Rect, p: Point): boolean {
  if (p.x < box.x0 - FRAME_EDGE || p.x > box.x1 + FRAME_EDGE) return false
  if (p.y < box.y0 - FRAME_EDGE || p.y > box.y1 + FRAME_EDGE) return false
  return (
    p.y <= box.y0 + FRAME_TITLE ||
    p.y >= box.y1 - FRAME_EDGE ||
    p.x <= box.x0 + FRAME_EDGE ||
    p.x >= box.x1 - FRAME_EDGE
  )
}

/** The selected frame whose lower right corner is under `p`, if there is one. */
export function frameHandleAt(doc: CircuitDoc, selection: ReadonlySet<string>, p: Point): string | undefined {
  for (const id of selection) {
    const bounds = doc.components[id]?.type === FRAME_TYPE ? componentBounds(doc, id) : undefined
    if (bounds && distance(p, { x: bounds.x1, y: bounds.y1 }) <= HANDLE_REACH) return id
  }
  return undefined
}

export function componentBounds(doc: CircuitDoc, id: string): Rect | undefined {
  const component = doc.components[id]
  if (!component) return undefined
  const symbol = symbolOf(component)
  return placeRect(symbol.bounds, component.pos, component.rotation)
}

/** The smallest rectangle around everything drawn, or undefined if empty. */
export function docBounds(doc: CircuitDoc): Rect | undefined {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const grow = (rect: Rect): void => {
    x0 = Math.min(x0, rect.x0)
    y0 = Math.min(y0, rect.y0)
    x1 = Math.max(x1, rect.x1)
    y1 = Math.max(y1, rect.y1)
  }
  for (const id of Object.keys(doc.components)) grow(componentBounds(doc, id)!)
  for (const { pos } of Object.values(doc.junctions)) {
    grow({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y })
  }
  return x0 === Infinity ? undefined : { x0, y0, x1, y1 }
}

/**
 * Finds what lies under a world position. Small targets win over the larger
 * things they sit on: junctions and pins first, then wires, then parts.
 *
 * `slack` widens the reach of pins, junctions and wires, in grid units, for
 * a finger, which covers far more than a mouse pointer.
 */
export function hitTest(doc: CircuitDoc, p: Point, slack = 0): Hit | null {
  for (const junction of Object.values(doc.junctions)) {
    if (distance(p, junction.pos) <= JUNCTION_REACH + slack) {
      return { kind: 'junction', id: junction.id, pos: junction.pos }
    }
  }
  for (const component of Object.values(doc.components)) {
    const symbol = symbolOf(component)
    for (const pin of symbol.pins) {
      const terminal: Terminal = { kind: 'pin', component: component.id, port: pin.name }
      const end = terminalEnd(doc, terminal)
      if (end && distance(p, end.pos) <= PIN_REACH + slack) {
        return { kind: 'pin', terminal, pos: end.pos }
      }
    }
  }
  for (const wire of Object.values(doc.wires)) {
    const path = wirePath(doc, wire)
    if (!path) continue
    const nearest = closestOnPolyline(p, path)
    if (distance(p, nearest) <= WIRE_REACH + slack) {
      return { kind: 'wire', id: wire.id, pos: snapPoint(nearest) }
    }
  }
  // Later parts are drawn on top, so they are tried first. Frames lie
  // under everything and are tried last.
  const ids = Object.keys(doc.components)
  for (let i = ids.length - 1; i >= 0; i--) {
    if (doc.components[ids[i]].type === FRAME_TYPE) continue
    const bounds = componentBounds(doc, ids[i])
    if (bounds && rectContainsPoint(bounds, p)) return { kind: 'component', id: ids[i] }
  }
  for (let i = ids.length - 1; i >= 0; i--) {
    if (doc.components[ids[i]].type !== FRAME_TYPE) continue
    const bounds = componentBounds(doc, ids[i])
    if (bounds && onFrameGrip(bounds, p)) return { kind: 'component', id: ids[i] }
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

/**
 * A terminal on the wire the pointer is over: the pin or junction itself, or
 * one end of the wire. Undefined over a part's body or empty canvas.
 */
export function terminalOfHit(doc: CircuitDoc, hit: Hit | null): Terminal | undefined {
  if (hit?.kind === 'pin') return hit.terminal
  if (hit?.kind === 'junction') return { kind: 'junction', junction: hit.id }
  if (hit?.kind === 'wire') return doc.wires[hit.id]?.from
  return undefined
}
