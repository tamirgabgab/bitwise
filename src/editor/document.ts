import { builtinComponents, resolveParams } from '../core/index.ts'
import { add, placeRect, rectContainsPoint, rectContainsRect, rotatePoint, samePoint } from './geometry.ts'
import type { Point, Rect, Rotation } from './geometry.ts'
import type { RouteEnd } from './routing.ts'
import {
  DEFAULT_FRAME,
  DEFAULT_TEXT,
  FRAME_SIZE,
  FRAME_TYPE,
  NET_PIN,
  NET_TYPE,
  SUB_TYPE,
  TEXT_TYPE,
  symbolOf,
} from './symbols.ts'
import type { SubRef } from './symbols.ts'

export { FRAME_TYPE, NET_PIN, NET_TYPE, SUB_TYPE, TEXT_TYPE }
export type { SubPin, SubRef } from './symbols.ts'

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
  /**
   * A name the user gave the part. On a switch or an output it is also the
   * name of the pin when the circuit is used as a part of another one.
   */
  readonly label?: string
  /**
   * On a switch or a push button: the keyboard key that works it, as a
   * `KeyboardEvent.code`.
   */
  readonly key?: string
  /** Set on a part that stands for a named circuit; its type is `SUB_TYPE`. */
  readonly sub?: SubRef
  /** What a text label says, or the title of a frame. */
  readonly text?: string
  /**
   * On a frame, whose type is `FRAME_TYPE`: its width and height in grid
   * units. Its `pos` is its top left corner.
   */
  readonly size?: Point
}

/** The longest writing a text label can hold. */
export const MAX_TEXT = 60

/** The smallest and the largest a frame can be on either side, in grid units. */
export const MIN_FRAME = 4
export const MAX_FRAME = 400

/** True for a part that is only drawing, not part of the circuit: a text label or a frame. */
export function isAnnotation(type: string): boolean {
  return type === TEXT_TYPE || type === FRAME_TYPE
}

/** The longest label a part can have. */
export const MAX_LABEL = 16

/** The slowest a part can be made, in ticks. */
export const MAX_DELAY = 99

/** How far from the origin a part or junction may sit, in grid units. */
export const MAX_COORD = 10_000

/** The most parts, junctions and wires one drawing holds together. */
export const MAX_ITEMS = 20_000

/**
 * Whether a drawing keeps to `MAX_ITEMS` and `MAX_COORD`. A file past them
 * is cut when it is read (`project.ts`), so an edit that would go past them
 * is not made: the project could not be read back whole.
 */
export function withinBounds(doc: CircuitDoc): boolean {
  const items =
    Object.keys(doc.components).length + Object.keys(doc.junctions).length + Object.keys(doc.wires).length
  if (items > MAX_ITEMS) return false
  const near = (pos: Point): boolean => Math.abs(pos.x) <= MAX_COORD && Math.abs(pos.y) <= MAX_COORD
  return (
    Object.values(doc.components).every((part) => near(part.pos)) &&
    Object.values(doc.junctions).every((junction) => near(junction.pos))
  )
}

/**
 * The keys a switch can be given: the letters and the digits, except R,
 * which turns the selected parts.
 */
export function isSwitchKey(code: unknown): code is string {
  return typeof code === 'string' && /^(Key[A-Z]|Digit[0-9])$/.test(code) && code !== 'KeyR'
}

/** What is printed on a key: "A" for `KeyA`, "7" for `Digit7`. */
export function keyName(code: string): string {
  return code.replace(/^(Key|Digit)/, '')
}

/** The parts a key can work. */
export function takesKey(type: string): boolean {
  return type === 'input' || type === 'button'
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
/**
 * How the value of a bus is written: its digits in the radix, the number
 * in decimal, the balanced value with a sign, or hexadecimal.
 */
export type BusFormat = 'digits' | 'decimal' | 'balanced' | 'hex'

export interface DocWire {
  readonly id: string
  readonly from: Terminal
  readonly to: Terminal
  /** How a bus on this wire is written, when not as its digits (`busFormat.ts`). */
  readonly format?: Exclude<BusFormat, 'digits'>
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
  const pin = symbolOf(component).pins.find(
    (candidate) => candidate.name === terminal.port,
  )
  if (!pin) return undefined
  return {
    pos: add(component.pos, rotatePoint(pin.pos, component.rotation)),
    dir: rotatePoint(pin.dir, component.rotation),
  }
}

export interface AddComponentOptions {
  readonly label?: string
  readonly params?: Readonly<Record<string, number>>
  readonly delay?: number
  readonly rotation?: Rotation
  /** The keyboard key of a switch or a push button. */
  readonly key?: string
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
    ...(options.label?.trim() ? { label: options.label.trim().slice(0, MAX_LABEL) } : {}),
    ...(takesKey(type) && isSwitchKey(options.key) ? { key: options.key } : {}),
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

/** Adds a part that stands for a named circuit. */
export function addSubcircuit(
  doc: CircuitDoc,
  sub: SubRef,
  pos: Point,
  options: Pick<AddComponentOptions, 'rotation'> = {},
): { doc: CircuitDoc; id: string } {
  const id = `c${doc.nextId}`
  const component: DocComponent = {
    id,
    type: SUB_TYPE,
    params: {},
    delay: 1,
    pos,
    rotation: options.rotation ?? 0,
    sub,
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

/** Writing made fit for a text label, or undefined when it is blank. */
export function cleanText(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
  return clean === '' ? undefined : clean
}

/** Adds a text label: writing on the canvas that is not part of the circuit. */
export function addText(
  doc: CircuitDoc,
  pos: Point,
  text: string = DEFAULT_TEXT,
): { doc: CircuitDoc; id: string } {
  const id = `c${doc.nextId}`
  const component: DocComponent = {
    id,
    type: TEXT_TYPE,
    params: {},
    delay: 1,
    pos,
    rotation: 0,
    text: cleanText(text) ?? DEFAULT_TEXT,
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

/** A net name made fit for a label, or undefined when it is blank. */
export function cleanNetName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const clean = name.trim().slice(0, MAX_LABEL)
  return clean === '' ? undefined : clean
}

/** The first name `N1`, `N2`, ... that no net label of `doc` carries yet. */
export function freeNetName(doc: CircuitDoc): string {
  const taken = new Set<string>()
  for (const component of Object.values(doc.components)) {
    if (component.type === NET_TYPE && component.label) taken.add(component.label)
  }
  let n = 1
  while (taken.has(`N${n}`)) n++
  return `N${n}`
}

/** Adds a net label, its pin at `pos`. */
export function addNetLabel(doc: CircuitDoc, pos: Point, name: string): { doc: CircuitDoc; id: string } {
  const id = `c${doc.nextId}`
  const component: DocComponent = {
    id,
    type: NET_TYPE,
    params: {},
    delay: 1,
    pos,
    rotation: 0,
    label: cleanNetName(name) ?? freeNetName(doc),
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

/** A frame size kept within `MIN_FRAME` and `MAX_FRAME`, in whole grid units. */
export function cleanFrameSize(size: Point): Point {
  const fit = (value: number): number =>
    Math.max(MIN_FRAME, Math.min(MAX_FRAME, Math.round(Number.isFinite(value) ? value : MIN_FRAME)))
  return { x: fit(size.x), y: fit(size.y) }
}

/** Adds a frame with its top left corner at `pos`. */
export function addFrame(
  doc: CircuitDoc,
  pos: Point,
  size: Point = FRAME_SIZE,
  title: string = DEFAULT_FRAME,
): { doc: CircuitDoc; id: string } {
  const id = `c${doc.nextId}`
  const component: DocComponent = {
    id,
    type: FRAME_TYPE,
    params: {},
    delay: 1,
    pos,
    rotation: 0,
    text: cleanText(title) ?? DEFAULT_FRAME,
    size: cleanFrameSize(size),
  }
  return {
    doc: { ...doc, components: { ...doc.components, [id]: component }, nextId: doc.nextId + 1 },
    id,
  }
}

/** Changes the size of a frame. */
export function resizeFrame(doc: CircuitDoc, id: string, size: Point): CircuitDoc {
  const component = doc.components[id]
  if (!component || component.type !== FRAME_TYPE) return doc
  const clean = cleanFrameSize(size)
  const old = component.size ?? FRAME_SIZE
  if (clean.x === old.x && clean.y === old.y) return doc
  return { ...doc, components: { ...doc.components, [id]: { ...component, size: clean } } }
}

/** The box a part covers on the canvas, pins included. */
function boxOf(component: DocComponent): Rect {
  return placeRect(symbolOf(component).bounds, component.pos, component.rotation)
}

/** The parts and junctions that lie wholly inside a frame, frames inside it too. */
export function frameContents(doc: CircuitDoc, id: string): string[] {
  const frame = doc.components[id]
  if (!frame || frame.type !== FRAME_TYPE) return []
  const box = boxOf(frame)
  const inside: string[] = []
  for (const component of Object.values(doc.components)) {
    if (component.id !== id && rectContainsRect(box, boxOf(component))) inside.push(component.id)
  }
  for (const junction of Object.values(doc.junctions)) {
    if (rectContainsPoint(box, junction.pos)) inside.push(junction.id)
  }
  return inside
}

/** The listed ids, plus everything that lies inside a frame among them. */
export function withFrameContents(doc: CircuitDoc, ids: Iterable<string>): Set<string> {
  const all = new Set(ids)
  for (const id of all) {
    if (doc.components[id]?.type !== FRAME_TYPE) continue
    for (const inner of frameContents(doc, id)) all.add(inner)
  }
  return all
}

/**
 * Adds a frame around the listed parts and junctions, with room for its
 * title above them. Undefined when none of them is there.
 */
export function frameAround(
  doc: CircuitDoc,
  ids: Iterable<string>,
): { doc: CircuitDoc; id: string } | undefined {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const grow = (box: Rect): void => {
    x0 = Math.min(x0, box.x0)
    y0 = Math.min(y0, box.y0)
    x1 = Math.max(x1, box.x1)
    y1 = Math.max(y1, box.y1)
  }
  for (const id of ids) {
    const component = doc.components[id]
    if (component) grow(boxOf(component))
    const junction = doc.junctions[id]
    if (junction) grow({ x0: junction.pos.x, y0: junction.pos.y, x1: junction.pos.x, y1: junction.pos.y })
  }
  if (x0 === Infinity) return undefined
  const left = Math.floor(x0) - 1
  const top = Math.floor(y0) - 3
  return addFrame(doc, { x: left, y: top }, { x: Math.ceil(x1) + 1 - left, y: Math.ceil(y1) + 1 - top })
}

/** Changes what a text label says or what a frame is called. Blank writing is ignored. */
export function setComponentText(doc: CircuitDoc, id: string, text: string): CircuitDoc {
  const component = doc.components[id]
  const clean = cleanText(text)
  if (!component || !isAnnotation(component.type) || clean === undefined) return doc
  if (clean === component.text) return doc
  return { ...doc, components: { ...doc.components, [id]: { ...component, text: clean } } }
}

/** Names a part, or takes its name away when `label` is blank. */
export function setComponentLabel(doc: CircuitDoc, id: string, label: string): CircuitDoc {
  const component = doc.components[id]
  if (!component || isAnnotation(component.type)) return doc
  const text = label.trim().slice(0, MAX_LABEL)
  // A net label without a name would join nothing: a blank one is ignored.
  if (component.type === NET_TYPE && text === '') return doc
  if (text === (component.label ?? '')) return doc
  const next: DocComponent = { ...component, label: text }
  if (text === '') delete (next as { label?: string }).label
  return { ...doc, components: { ...doc.components, [id]: next } }
}

/**
 * Gives a switch or a push button a keyboard key, or takes it away when
 * `code` is null. Anything that is not such a part or such a key is ignored.
 */
export function setComponentKey(doc: CircuitDoc, id: string, code: string | null): CircuitDoc {
  const component = doc.components[id]
  if (!component || !takesKey(component.type)) return doc
  if (code !== null && !isSwitchKey(code)) return doc
  if ((component.key ?? null) === code) return doc
  const next: DocComponent = { ...component, ...(code === null ? {} : { key: code }) }
  if (code === null) delete (next as { key?: string }).key
  return { ...doc, components: { ...doc.components, [id]: next } }
}

/** Sets how many ticks a part takes to answer, from 1 to `MAX_DELAY`. */
export function setComponentDelay(doc: CircuitDoc, id: string, delay: number): CircuitDoc {
  const component = doc.components[id]
  if (!component || !builtinComponents.has(component.type)) return doc
  if (!Number.isInteger(delay) || delay < 1 || delay > MAX_DELAY) return doc
  if (delay === component.delay) return doc
  return { ...doc, components: { ...doc.components, [id]: { ...component, delay } } }
}

/**
 * Changes some parameters of a part, such as its number of inputs. Wires on
 * pins the part no longer has are removed. Throws if a value is not valid.
 */
export function setComponentParams(
  doc: CircuitDoc,
  id: string,
  changes: Readonly<Record<string, number>>,
): CircuitDoc {
  const component = doc.components[id]
  if (!component || !builtinComponents.has(component.type)) return doc
  const params = resolveParams(builtinComponents.get(component.type), {
    ...component.params,
    ...changes,
  })
  if (Object.keys(params).every((name) => params[name] === component.params[name])) return doc

  const pins = new Set(symbolOf({ type: component.type, params }).pins.map((pin) => pin.name))
  const orphaned = (terminal: Terminal): boolean =>
    terminal.kind === 'pin' && terminal.component === id && !pins.has(terminal.port)
  const stale = Object.values(doc.wires)
    .filter((wire) => orphaned(wire.from) || orphaned(wire.to))
    .map((wire) => wire.id)

  const next: CircuitDoc = {
    ...doc,
    components: { ...doc.components, [id]: { ...component, params } },
  }
  return stale.length > 0 ? deleteItems(next, stale) : next
}

export function addJunction(doc: CircuitDoc, pos: Point): { doc: CircuitDoc; id: string } {
  const id = `j${doc.nextId}`
  return {
    doc: { ...doc, junctions: { ...doc.junctions, [id]: { id, pos } }, nextId: doc.nextId + 1 },
    id,
  }
}

function insertWire(
  doc: CircuitDoc,
  from: Terminal,
  to: Terminal,
  format?: DocWire['format'],
): { doc: CircuitDoc; id: string } {
  const id = `w${doc.nextId}`
  const wire: DocWire = format ? { id, from, to, format } : { id, from, to }
  return {
    doc: { ...doc, wires: { ...doc.wires, [id]: wire }, nextId: doc.nextId + 1 },
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
  format?: DocWire['format'],
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
  return insertWire(doc, from, to, format)
}

/**
 * Puts a junction on a wire at `pos`, splitting the wire in two. If the wire
 * already ends on a junction at that spot, that junction is used instead.
 * `after` is the wire that runs on from the junction to the far end.
 */
function splitWire(
  doc: CircuitDoc,
  wireId: string,
  pos: Point,
): { doc: CircuitDoc; terminal: Terminal; after: string } | undefined {
  const wire = doc.wires[wireId]
  if (!wire) return undefined
  for (const end of [wire.from, wire.to]) {
    if (end.kind !== 'junction') continue
    const junction = doc.junctions[end.junction]
    if (junction && samePoint(junction.pos, pos)) return { doc, terminal: end, after: wireId }
  }
  const added = addJunction(doc, pos)
  const terminal: Terminal = { kind: 'junction', junction: added.id }
  const wires = { ...added.doc.wires }
  delete wires[wireId]
  let next: CircuitDoc = { ...added.doc, wires }
  next = insertWire(next, wire.from, terminal, wire.format).doc
  const after = insertWire(next, terminal, wire.to, wire.format)
  return { doc: after.doc, terminal, after: after.id }
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

/**
 * Drags a stretch of a wire: a junction goes in at each point of `at`, in
 * order from the wire's first end to its second, and all of them move by
 * `dx`, `dy`. The wires between and on either side follow.
 */
export function bendWire(
  doc: CircuitDoc,
  wireId: string,
  at: readonly Point[],
  dx: number,
  dy: number,
): { doc: CircuitDoc; junctions: string[] } | undefined {
  let next = doc
  let rest = wireId
  const junctions = new Set<string>()
  for (const pos of at) {
    const split = splitWire(next, rest, pos)
    if (!split || split.terminal.kind !== 'junction') return undefined
    next = split.doc
    rest = split.after
    junctions.add(split.terminal.junction)
  }
  if (junctions.size === 0) return undefined
  return { doc: moveItems(next, junctions, dx, dy), junctions: [...junctions] }
}

/**
 * Moves the listed parts and junctions, and whatever lies inside a frame
 * among them. Wires follow on their own.
 */
export function moveItems(
  doc: CircuitDoc,
  ids: Iterable<string>,
  dx: number,
  dy: number,
): CircuitDoc {
  if (dx === 0 && dy === 0) return doc
  let components = doc.components
  let junctions = doc.junctions
  for (const id of withFrameContents(doc, ids)) {
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
    // Writing stays upright, so turning it would only move its box; a frame stays square to the page.
    if (!component || isAnnotation(component.type)) continue
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
      ? Object.hasOwn(components, terminal.component)
      : !doomed.has(terminal.junction) && Object.hasOwn(doc.junctions, terminal.junction)

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
 * Copies the listed parts and junctions, together with what lies inside a
 * frame among them and every wire that runs between two of them.
 */
export function copyItems(doc: CircuitDoc, ids: Iterable<string>): Fragment {
  const wanted = withFrameContents(doc, ids)
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
    wires[id] = wire.format ? { id, from, to, format: wire.format } : { id, from, to }
  }
  return { doc: { components, junctions, wires, nextId }, ids: [...renamed.values()] }
}

/**
 * Makes a second copy of the listed parts and junctions, with the wires
 * between them, `offset` away from the first.
 */
export function duplicateItems(
  doc: CircuitDoc,
  ids: Iterable<string>,
  offset: Point,
): { doc: CircuitDoc; ids: string[] } {
  return pasteFragment(doc, copyItems(doc, ids), offset)
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
