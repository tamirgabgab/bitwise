import { terminalNets } from './connectivity.ts'
import {
  addComponent,
  addSubcircuit,
  addWire,
  copyItems,
  deleteItems,
  emptyDoc,
  pasteFragment,
  terminalEnd,
  terminalKey,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { Point } from './geometry.ts'
import { componentBounds } from './hitTest.ts'
import { subRefOf } from './subcircuit.ts'
import { symbolOf } from './symbols.ts'

/*
 * Turning a selection into a named circuit. The selected parts move into a
 * new drawing, and one part that stands for it takes their place. Every wire
 * that left the selection becomes a pin: inside, a switch or an output part
 * marks the spot; outside, the wire now ends on the pin of the new part.
 */

export interface Extraction {
  /** The drawing the selection came from, with the new part in it. */
  readonly doc: CircuitDoc
  /** The drawing of the new circuit. */
  readonly inner: CircuitDoc
  /** The part that stands for the new circuit. */
  readonly part: string
}

/**
 * The parts of a selection that can move into a circuit of their own. The
 * switches and outputs of a drawing are its pins, so they stay behind.
 */
export function extractable(doc: CircuitDoc, ids: Iterable<string>): string[] {
  const kept: string[] = []
  for (const id of new Set(ids)) {
    const component = doc.components[id]
    if (component && component.type !== 'input' && component.type !== 'output') kept.push(id)
  }
  return kept
}

interface Crossing {
  /** The ends inside the selection that sit on this node. */
  readonly inside: Terminal[]
  /** The ends outside that had a wire into the selection. */
  readonly outside: Terminal[]
  /** A part inside puts a value on this node. */
  drives: boolean
  /** A name found on a switch or an output outside, for the pin. */
  label?: string
}

/**
 * Moves the listed parts into a new circuit with the given id and name.
 * Returns undefined when nothing in the list can move.
 */
export function extractCircuit(
  doc: CircuitDoc,
  ids: Iterable<string>,
  circuit: string,
  name: string,
): Extraction | undefined {
  const parts = extractable(doc, ids)
  if (parts.length === 0) return undefined
  const wanted = new Set(ids)
  const moving = new Set(parts)
  // A junction goes along when it was picked, or when every wire on it does.
  const owner = (terminal: Terminal): string =>
    terminal.kind === 'pin' ? terminal.component : terminal.junction
  for (const junction of Object.keys(doc.junctions)) {
    if (wanted.has(junction)) moving.add(junction)
  }
  for (let grown = true; grown; ) {
    grown = false
    for (const junction of Object.keys(doc.junctions)) {
      if (moving.has(junction)) continue
      const ends = Object.values(doc.wires).filter(
        (wire) => owner(wire.from) === junction || owner(wire.to) === junction,
      )
      const allInside = ends.every((wire) =>
        moving.has(owner(wire.from) === junction ? owner(wire.to) : owner(wire.from)),
      )
      if (ends.length > 0 && allInside) {
        moving.add(junction)
        grown = true
      }
    }
  }
  // A junction that was picked without any moving part next to it stays.
  for (const junction of Object.keys(doc.junctions)) {
    if (!moving.has(junction)) continue
    const touches = Object.values(doc.wires).some(
      (wire) =>
        (owner(wire.from) === junction && moving.has(owner(wire.to))) ||
        (owner(wire.to) === junction && moving.has(owner(wire.from))),
    )
    if (!touches) moving.delete(junction)
  }
  const inside = (terminal: Terminal): boolean => moving.has(owner(terminal))

  const nets = terminalNets(doc)
  const netOf = (terminal: Terminal): string => {
    const key = terminalKey(terminal)
    return nets.get(key) ?? key
  }
  const direction = (terminal: Terminal): 'in' | 'out' | undefined => {
    if (terminal.kind !== 'pin') return undefined
    const component = doc.components[terminal.component]
    return component
      ? symbolOf(component).pins.find((pin) => pin.name === terminal.port)?.direction
      : undefined
  }

  // The nodes that have a wire going out of the selection.
  const crossings = new Map<string, Crossing>()
  const crossingOf = (net: string): Crossing => {
    let crossing = crossings.get(net)
    if (!crossing) {
      crossing = { inside: [], outside: [], drives: false }
      crossings.set(net, crossing)
    }
    return crossing
  }
  const push = (list: Terminal[], terminal: Terminal): void => {
    if (!list.some((other) => terminalKey(other) === terminalKey(terminal))) list.push(terminal)
  }
  for (const wire of Object.values(doc.wires)) {
    const from = inside(wire.from)
    const to = inside(wire.to)
    if (from === to) continue
    const crossing = crossingOf(netOf(wire.from))
    push(crossing.inside, from ? wire.from : wire.to)
    push(crossing.outside, from ? wire.to : wire.from)
  }
  // What else sits on those nodes decides the side and the name of the pin.
  for (const wire of Object.values(doc.wires)) {
    for (const end of [wire.from, wire.to]) {
      const crossing = crossings.get(netOf(end))
      if (!crossing || end.kind !== 'pin') continue
      const component = doc.components[end.component]
      if (!component) continue
      if (inside(end)) {
        if (direction(end) === 'out') crossing.drives = true
      } else if (
        crossing.label === undefined &&
        component.label &&
        (component.type === 'input' || component.type === 'output')
      ) {
        crossing.label = component.label
      }
    }
  }
  // A pin with no wire at all becomes a pin of the new part too.
  const wired = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    wired.add(terminalKey(wire.from))
    wired.add(terminalKey(wire.to))
  }
  const loose: Terminal[] = []
  for (const id of parts) {
    for (const pin of symbolOf(doc.components[id]).pins) {
      const terminal: Terminal = { kind: 'pin', component: id, port: pin.name }
      if (!wired.has(terminalKey(terminal))) loose.push(terminal)
    }
  }

  // The new drawing: the selection as it was, under fresh ids.
  const fragment = copyItems(doc, moving)
  const pasted = pasteFragment(emptyDoc(), fragment, { x: 0, y: 0 })
  const renamed = new Map<string, string>()
  const sources = [...fragment.components, ...fragment.junctions]
  sources.forEach((item, index) => renamed.set(item.id, pasted.ids[index]))
  const within = (terminal: Terminal): Terminal =>
    terminal.kind === 'pin'
      ? { kind: 'pin', component: renamed.get(terminal.component)!, port: terminal.port }
      : { kind: 'junction', junction: renamed.get(terminal.junction)! }

  let inner = pasted.doc
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const id of parts) {
    const box = componentBounds(doc, id)!
    x0 = Math.min(x0, box.x0)
    x1 = Math.max(x1, box.x1)
    y0 = Math.min(y0, box.y0)
    y1 = Math.max(y1, box.y1)
  }
  const leftColumn = Math.floor(x0) - 6
  const rightColumn = Math.ceil(x1) + 6
  const taken = new Set<string>()
  const spot = (x: number, y: number): Point => {
    let row = Math.round(y)
    while (taken.has(`${x},${row}`)) row += 2
    taken.add(`${x},${row}`)
    return { x, y: row }
  }

  // One switch or output inside for every pin, wired to what it stands for.
  interface Pin {
    readonly port: string
    readonly outside: readonly Terminal[]
  }
  const pins: Pin[] = []
  const boundary = (ends: readonly Terminal[], drives: boolean, label?: string): string => {
    const at = terminalEnd(doc, ends[0])?.pos ?? { x: 0, y: 0 }
    const added = addComponent(
      inner,
      drives ? 'output' : 'input',
      spot(drives ? rightColumn : leftColumn, at.y),
      { label },
    )
    inner = added.doc
    const pin: Terminal = { kind: 'pin', component: added.id, port: drives ? 'in' : 'out' }
    for (const end of ends) inner = addWire(inner, within(end), pin)?.doc ?? inner
    return added.id
  }
  const byHeight = (a: Terminal, b: Terminal): number =>
    (terminalEnd(doc, a)?.pos.y ?? 0) - (terminalEnd(doc, b)?.pos.y ?? 0)
  const ordered = [...crossings.values()].sort((a, b) => byHeight(a.inside[0], b.inside[0]))
  for (const crossing of ordered) {
    const port = boundary(crossing.inside, crossing.drives, crossing.label)
    pins.push({ port, outside: crossing.outside })
  }
  for (const terminal of [...loose].sort(byHeight)) {
    boundary([terminal], direction(terminal) === 'out')
  }

  // The old drawing: the selection goes, one part comes in its place.
  let outer = deleteItems(doc, moving)
  const ref = subRefOf({ id: circuit, name, doc: inner })
  const added = addSubcircuit(outer, ref, {
    x: Math.round((x0 + x1) / 2),
    y: Math.round((y0 + y1) / 2),
  })
  outer = added.doc
  for (const pin of pins) {
    const terminal: Terminal = { kind: 'pin', component: added.id, port: pin.port }
    for (const end of pin.outside) outer = addWire(outer, end, terminal)?.doc ?? outer
  }
  return { doc: outer, inner, part: added.id }
}
