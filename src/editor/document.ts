import { builtinComponents, resolveParams } from '../core/index.ts'
import { add, rotatePoint, samePoint } from './geometry.ts'
import type { Point, Rotation } from './geometry.ts'
import type { RouteEnd } from './routing.ts'
import { symbolFor } from './symbols.ts'

/*
 * The circuit as the user draws it: parts with a position, junctions, and
 * wires between them. This is what gets saved and what undo steps through.
 *
 * Everything here is immutable. An operation returns a new document and
 * shares whatever did not change, so keeping old documents for undo is cheap.
 */

export interface DocComponent {
  readonly id: string
  readonly type: string
  /** Complete parameters, defaults filled in. */
  readonly params: Readonly<Record<string, number>>
  readonly delay: number
  readonly pos: Point
  readonly rotation: Rotation
}

/** A dot where wires meet. Also usable as a bend point for a single wire. */
export interface DocJunction {
  readonly id: string
  readonly pos: Point
}

/** Something a wire can end on. */
export type Terminal =
  | { readonly kind: 'pin'; readonly component: string; readonly port: string }
  | { readonly kind: 'junction'; readonly junction: string }

/**
 * A connection between two terminals. Its path is worked out from the whole
 * drawing (see `wireLayout.ts`) and never stored.
 */
export interface DocWire {
  readonly id: string
  readonly from: Terminal
  readonly to: Terminal
}

export interface CircuitDoc {
  readonly components: Readonly<Record<string, DocComponent>>
  readonly junctions: Readonly<Record<string, DocJunction>>
  readonly wires: Readonly<Record<string, DocWire>>
  /** Counter behind every id handed out so far. */
  readonly nextId: number
}

/**
 * Where a new wire should end: on a terminal, or somewhere along an existing
 * wire, which then gets a junction at that point.
 */
export type WireEnd =
  | { readonly kind: 'terminal'; readonly terminal: Terminal }
  | { readonly kind: 'wire'; readonly wire: string; readonly pos: Point }

/** A copied piece of a circuit. */
export interface Fragment {
  readonly components: readonly DocComponent[]
  readonly junctions: readonly DocJunction[]
  readonly wires: readonly DocWire[]
}

export function emptyDoc(): CircuitDoc {
  return { components: {}, junctions: {}, wires: {}, nextId: 1 }
}

export function terminalKey(terminal: Terminal): string {
  return terminal.kind === 'pin'
    ? `p:${terminal.component}:${terminal.port}`
    : `j:${terminal.junction}`
}

export function sameTerminal(a: Terminal, b: Terminal): boolean {
  return terminalKey(a) === terminalKey(b)
}

/** The world position of a terminal, or undefined if it no longer exists. */
export function terminalEnd(doc: CircuitDoc, terminal: Terminal): RouteEnd | undefined {
  if (terminal.kind === 'junction') {
    const junction = doc.junctions[terminal.junction]
    return junction ? { pos: junction.pos } : undefined
  }
  const component = doc.components[terminal.component]
  if (!component) return undefined
  const pin = symbolFor(component.type, component.params).pins.find(
    (candidate) => candidate.name === terminal.port,
  )
  if (!pin) return undefined
  return {
    pos: add(component.pos, rotatePoint(pin.pos, component.rotation)),
    dir: rotatePoint(pin.dir, component.rotation),
  }
}

export interface AddComponentOptions {
  readonly params?: Readonly<Record<string, number>>
  readonly delay?: number
  readonly rotation?: Rotation
}

/** Adds a part. Throws if the type or its parameters are not valid. */
export function addComponent(
  doc: CircuitDoc,
  type: string,
  pos: Point,
  options: AddComponentOptions = {},
): { doc: CircuitDoc; id: string } {
  const params = resolveParams(builtinComponents.get(type), options.params)
  const id = `c${doc.nextId}`
  const component: DocComponent = {
    id,
    type,
    params,
    delay: options.delay ?? 1,
    pos,
    rotation: options.rotation ?? 0,
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

function addJunction(doc: CircuitDoc, pos: Point): { doc: CircuitDoc; id: string } {
  const id = `j${doc.nextId}`
  return {
    doc: { ...doc, junctions: { ...doc.junctions, [id]: { id, pos } }, nextId: doc.nextId + 1 },
    id,
  }
}

function insertWire(doc: CircuitDoc, from: Terminal, to: Terminal): { doc: CircuitDoc; id: string } {
  const id = `w${doc.nextId}`
  return {
    doc: { ...doc, wires: { ...doc.wires, [id]: { id, from, to } }, nextId: doc.nextId + 1 },
    id,
  }
}

/**
 * Adds a wire between two terminals. Returns undefined, and changes nothing,
 * when an end is missing, both ends are the same terminal, or the two are
 * already wired to each other.
 */
export function addWire(
  doc: CircuitDoc,
  from: Terminal,
  to: Terminal,
): { doc: CircuitDoc; id: string } | undefined {
  if (sameTerminal(from, to)) return undefined
  if (!terminalEnd(doc, from) || !terminalEnd(doc, to)) return undefined
  const a = terminalKey(from)
  const b = terminalKey(to)
  for (const wire of Object.values(doc.wires)) {
    const wireFrom = terminalKey(wire.from)
    const wireTo = terminalKey(wire.to)
    if ((wireFrom === a && wireTo === b) || (wireFrom === b && wireTo === a)) return undefined
  }
  return insertWire(doc, from, to)
}

/**
 * Puts a junction on a wire at `pos`, splitting the wire in two. If the wire
 * already ends on a junction at that spot, that junction is used instead.
 */
function splitWire(
  doc: CircuitDoc,
  wireId: string,
  pos: Point,
): { doc: CircuitDoc; terminal: Terminal } | undefined {
  const wire = doc.wires[wireId]
  if (!wire) return undefined
  for (const end of [wire.from, wire.to]) {
    if (end.kind !== 'junction') continue
    const junction = doc.junctions[end.junction]
    if (junction && samePoint(junction.pos, pos)) return { doc, terminal: end }
  }
  const added = addJunction(doc, pos)
  const terminal: Terminal = { kind: 'junction', junction: added.id }
  const wires = { ...added.doc.wires }
  delete wires[wireId]
  let next: CircuitDoc = { ...added.doc, wires }
  next = insertWire(next, wire.from, terminal).doc
  next = insertWire(next, terminal, wire.to).doc
  return { doc: next, terminal }
}

/**
 * Draws a new wire between two ends, adding a junction wherever an end lands
 * on an existing wire. Returns undefined when the wire cannot be made.
 */
export function connectEnds(doc: CircuitDoc, a: WireEnd, b: WireEnd): CircuitDoc | undefined {
  if (a.kind === 'wire' && b.kind === 'wire' && a.wire === b.wire) return undefined
  let next = doc
  const resolved: Terminal[] = []
  for (const end of [a, b]) {
    if (end.kind === 'terminal') {
      resolved.push(end.terminal)
      continue
    }
    const split = splitWire(next, end.wire, end.pos)
    if (!split) return undefined
    next = split.doc
    resolved.push(split.terminal)
  }
  return addWire(next, resolved[0], resolved[1])?.doc
}

/** Moves the listed parts and junctions. Wires follow on their own. */
export function moveItems(
  doc: CircuitDoc,
  ids: Iterable<string>,
  dx: number,
  dy: number,
): CircuitDoc {
  if (dx === 0 && dy === 0) return doc
  let components = doc.components
  let junctions = doc.junctions
  for (const id of ids) {
    const component = doc.components[id]
    if (component) {
      if (components === doc.components) components = { ...components }
      ;(components as Record<string, DocComponent>)[id] = {
        ...component,
        pos: { x: component.pos.x + dx, y: component.pos.y + dy },
      }
    }
    const junction = doc.junctions[id]
    if (junction) {
      if (junctions === doc.junctions) junctions = { ...junctions }
      ;(junctions as Record<string, DocJunction>)[id] = {
        ...junction,
        pos: { x: junction.pos.x + dx, y: junction.pos.y + dy },
      }
    }
  }
  if (components === doc.components && junctions === doc.junctions) return doc
  return { ...doc, components, junctions }
}

/** Turns the listed parts a quarter turn clockwise, each around itself. */
export function rotateComponents(doc: CircuitDoc, ids: Iterable<string>): CircuitDoc {
  let components = doc.components
  for (const id of ids) {
    const component = doc.components[id]
    if (!component) continue
    if (components === doc.components) components = { ...components }
    ;(components as Record<string, DocComponent>)[id] = {
      ...component,
      rotation: ((component.rotation + 1) % 4) as Rotation,
    }
  }
  return components === doc.components ? doc : { ...doc, components }
}

/**
 * Deletes the listed parts, junctions and wires, plus every wire that would
 * be left with a missing end and every junction left with no wire at all.
 */
export function deleteItems(doc: CircuitDoc, ids: Iterable<string>): CircuitDoc {
  const doomed = new Set(ids)
  const components: Record<string, DocComponent> = {}
  for (const component of Object.values(doc.components)) {
    if (!doomed.has(component.id)) components[component.id] = component
  }
  const survivesAsEnd = (terminal: Terminal): boolean =>
    terminal.kind === 'pin'
      ? terminal.component in components
      : !doomed.has(terminal.junction) && terminal.junction in doc.junctions

  const wires: Record<string, DocWire> = {}
  const usedJunctions = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    if (doomed.has(wire.id) || !survivesAsEnd(wire.from) || !survivesAsEnd(wire.to)) continue
    wires[wire.id] = wire
    for (const end of [wire.from, wire.to]) {
      if (end.kind === 'junction') usedJunctions.add(end.junction)
    }
  }
  const junctions: Record<string, DocJunction> = {}
  for (const junction of Object.values(doc.junctions)) {
    if (usedJunctions.has(junction.id)) junctions[junction.id] = junction
  }

  const unchanged =
    Object.keys(components).length === Object.keys(doc.components).length &&
    Object.keys(wires).length === Object.keys(doc.wires).length &&
    Object.keys(junctions).length === Object.keys(doc.junctions).length
  return unchanged ? doc : { ...doc, components, junctions, wires }
}

/**
 * Copies the listed parts and junctions, together with every wire that runs
 * between two of them.
 */
export function copyItems(doc: CircuitDoc, ids: Iterable<string>): Fragment {
  const wanted = new Set(ids)
  const components = Object.values(doc.components).filter((item) => wanted.has(item.id))
  const junctions = Object.values(doc.junctions).filter((item) => wanted.has(item.id))
  const included = (terminal: Terminal): boolean =>
    wanted.has(terminal.kind === 'pin' ? terminal.component : terminal.junction)
  const wires = Object.values(doc.wires).filter(
    (wire) => included(wire.from) && included(wire.to),
  )
  return { components, junctions, wires }
}

/** Adds a copied fragment under fresh ids, shifted by `offset`. */
export function pasteFragment(
  doc: CircuitDoc,
  fragment: Fragment,
  offset: Point,
): { doc: CircuitDoc; ids: string[] } {
  let nextId = doc.nextId
  const renamed = new Map<string, string>()
  const components = { ...doc.components }
  const junctions = { ...doc.junctions }
  const wires = { ...doc.wires }

  for (const component of fragment.components) {
    const id = `c${nextId++}`
    renamed.set(component.id, id)
    components[id] = { ...component, id, pos: add(component.pos, offset) }
  }
  for (const junction of fragment.junctions) {
    const id = `j${nextId++}`
    renamed.set(junction.id, id)
    junctions[id] = { id, pos: add(junction.pos, offset) }
  }
  const rename = (terminal: Terminal): Terminal | undefined => {
    if (terminal.kind === 'pin') {
      const component = renamed.get(terminal.component)
      return component ? { kind: 'pin', component, port: terminal.port } : undefined
    }
    const junction = renamed.get(terminal.junction)
    return junction ? { kind: 'junction', junction } : undefined
  }
  for (const wire of fragment.wires) {
    const from = rename(wire.from)
    const to = rename(wire.to)
    if (!from || !to) continue
    const id = `w${nextId++}`
    wires[id] = { id, from, to }
  }
  return { doc: { components, junctions, wires, nextId }, ids: [...renamed.values()] }
}

/** How many wires end on each junction. */
export function junctionDegrees(doc: CircuitDoc): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const wire of Object.values(doc.wires)) {
    for (const end of [wire.from, wire.to]) {
      if (end.kind === 'junction') {
        degrees.set(end.junction, (degrees.get(end.junction) ?? 0) + 1)
      }
    }
  }
  return degrees
}
