import { builtinComponents } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import { addWire, moveItems, terminalEnd, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent, DocWire, Terminal } from './document.ts'
import { add, closestOnPolyline, distance, placeRect, rectContainsPoint, rotatePoint } from './geometry.ts'
import type { Point, Rect } from './geometry.ts'
import { symbolOf } from './symbols.ts'
import { wirePath } from './wireLayout.ts'
import { widthOf } from './widths.ts'

/*
 * Dropping a part onto a wire puts it into the wire: the wire is cut where
 * the part lies, the side that drives it goes to an input of the part, and
 * an output of the part takes over the rest. Only a part with no wires of
 * its own goes in, and only into a wire of the width of its pins.
 */

/** How a part goes into a wire. */
export interface Splice {
  readonly wire: string
  /** The pin of the part that takes the driving side. */
  readonly input: string
  /** The pin of the part that drives the rest. */
  readonly output: string
  /** Which end of the wire is the driving side. */
  readonly feed: 'from' | 'to'
}

/** How far apart the points are at which a wire is tried against a part. */
const STEP = 0.25

function crosses(path: readonly Point[], box: Rect): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const steps = Math.max(1, Math.ceil(distance(a, b) / STEP))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      if (rectContainsPoint(box, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return true
    }
  }
  return false
}

/** The width of a pin of `part`, or undefined for one whose width is set elsewhere. */
function pinWidth(part: DocComponent, port: string): number | undefined {
  if (!builtinComponents.has(part.type)) return undefined
  return builtinComponents
    .get(part.type)
    .ports(part.params)
    .find((item) => item.name === port)?.width
}

/** True when an output pin of some part sits on the node of `terminal` in `doc`. */
function driven(doc: CircuitDoc, terminal: Terminal): boolean {
  const nets = terminalNets(doc)
  const net = (key: string): string => nets.get(key) ?? key
  const node = net(terminalKey(terminal))
  for (const component of Object.values(doc.components)) {
    for (const pin of symbolOf(component).pins) {
      if (pin.direction !== 'out') continue
      if (net(terminalKey({ kind: 'pin', component: component.id, port: pin.name })) === node) return true
    }
  }
  return false
}

/**
 * Where `part`, standing where it is now, would go into a wire of `base`:
 * the drawing whose wires it was dropped on, without the part or with it
 * somewhere else. Undefined when it lies on no wire it can take.
 */
export function spliceTarget(base: CircuitDoc, part: DocComponent): Splice | undefined {
  const symbol = symbolOf(part)
  const inputs = symbol.pins.filter((pin) => pin.direction === 'in')
  const outputs = symbol.pins.filter((pin) => pin.direction === 'out')
  if (inputs.length === 0 || outputs.length === 0) return undefined
  const own = (terminal: Terminal): boolean => terminal.kind === 'pin' && terminal.component === part.id
  if (Object.values(base.wires).some((wire) => own(wire.from) || own(wire.to))) return undefined

  const box = placeRect(symbol.bounds, part.pos, part.rotation)
  let best: { wire: DocWire; path: readonly Point[]; gap: number } | undefined
  for (const wire of Object.values(base.wires)) {
    const path = wirePath(base, wire)
    if (!path || !crosses(path, box)) continue
    const gap = distance(part.pos, closestOnPolyline(part.pos, path))
    if (!best || gap < best.gap) best = { wire, path, gap }
  }
  if (!best) return undefined
  const { wire } = best

  const width = widthOf(base, [wire.from, wire.to])
  const fits = (port: string): boolean => (pinWidth(part, port) ?? width) === width
  const input = inputs.find((pin) => fits(pin.name))
  const output = outputs.find((pin) => fits(pin.name))
  if (!input || !output) return undefined

  // The side with a driver on it feeds the part. With a driver on both
  // sides or on neither, the end nearer the input does.
  const wires = { ...base.wires }
  delete wires[wire.id]
  const cut: CircuitDoc = { ...base, wires }
  const fromDriven = driven(cut, wire.from)
  const toDriven = driven(cut, wire.to)
  let feed: 'from' | 'to'
  if (fromDriven !== toDriven) feed = fromDriven ? 'from' : 'to'
  else {
    const at = add(part.pos, rotatePoint(input.pos, part.rotation))
    const from = terminalEnd(base, wire.from)?.pos
    const to = terminalEnd(base, wire.to)?.pos
    feed = !from || !to || distance(from, at) <= distance(to, at) ? 'from' : 'to'
  }
  return { wire: wire.id, input: input.name, output: output.name, feed }
}

/**
 * Puts part `id` of `doc` into a wire as `splice` says. Undefined if the
 * wire or the part is gone, or a new wire cannot be made.
 */
export function applySplice(doc: CircuitDoc, id: string, splice: Splice): CircuitDoc | undefined {
  const wire = doc.wires[splice.wire]
  if (!wire || !doc.components[id]) return undefined
  const [feed, rest] = splice.feed === 'from' ? [wire.from, wire.to] : [wire.to, wire.from]
  const wires = { ...doc.wires }
  delete wires[wire.id]
  const cut: CircuitDoc = { ...doc, wires }
  const first = addWire(cut, feed, { kind: 'pin', component: id, port: splice.input })
  if (!first) return undefined
  return addWire(first.doc, { kind: 'pin', component: id, port: splice.output }, rest)?.doc
}

/**
 * Moves the selection, and when it is one part with no wires that lands on
 * a wire, puts it into that wire.
 */
export function moveAndSplice(
  doc: CircuitDoc,
  selection: ReadonlySet<string>,
  dx: number,
  dy: number,
): CircuitDoc {
  const moved = moveItems(doc, selection, dx, dy)
  if (selection.size !== 1) return moved
  const [id] = selection
  const part = moved.components[id]
  if (!part) return moved
  const splice = spliceTarget(doc, part)
  return (splice && applySplice(moved, id, splice)) ?? moved
}
