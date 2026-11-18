import { partGraph } from './cone.ts'
import { terminalNets } from './connectivity.ts'
import {
  FRAME_TYPE,
  NET_TYPE,
  TEXT_TYPE,
  frameContents,
  terminalEnd,
  terminalKey,
  withFrameContents,
} from './document.ts'
import type { CircuitDoc, DocComponent, DocJunction, DocWire, Terminal } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'

/*
 * Arranging a whole circuit, left to right by depth: the switches and
 * clocks in the first column, each part one column after the furthest part
 * that feeds it, and the outputs in the last. A frame moves as one block
 * with what it holds. A net label goes with the part it is wired to, and a
 * text label with the part it sits beside. The bends of the old wires make
 * no sense in the new places, so they go; a junction where a wire branches
 * moves to the middle of what it joins. It is one edit, so one undo.
 */

/** Room between two columns, for the wires, and between two blocks of a column. */
export const COLUMN_GAP = 6
export const ROW_GAP = 2

/** How near a text label has to be to a part to go with it, in grid units. */
const TEXT_REACH = 3

/** Parts that start a circuit: they go in the first column. */
const SOURCES: ReadonlySet<string> = new Set(['input', 'button', 'clock', 'cycle'])

/** One block the layout moves as a whole: a part with what goes with it, or a frame. */
interface Unit {
  /** The parts and junctions that move with it. */
  readonly ids: string[]
  /** The parts whose pins give the unit its wires. */
  readonly parts: string[]
  bounds: Rect
  /** Where it was, to keep the order of a column. */
  readonly y: number
  readonly kind: 'source' | 'sink' | 'inner'
}

function union(a: Rect, b: Rect): Rect {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

function distanceTo(rect: Rect, p: Point): number {
  const dx = Math.max(rect.x0 - p.x, 0, p.x - rect.x1)
  const dy = Math.max(rect.y0 - p.y, 0, p.y - rect.y1)
  return Math.hypot(dx, dy)
}

/** The blocks of a drawing and the block each part belongs to. */
function unitsOf(doc: CircuitDoc): { units: Unit[]; unitOf: Map<string, number> } {
  const units: Unit[] = []
  const unitOf = new Map<string, number>()
  const parts = Object.values(doc.components)

  // Frames that no other frame holds take their contents along as one block.
  const inner = new Set<string>()
  for (const part of parts) {
    if (part.type === FRAME_TYPE) for (const id of frameContents(doc, part.id)) inner.add(id)
  }
  for (const frame of parts) {
    if (frame.type !== FRAME_TYPE || inner.has(frame.id)) continue
    const ids = [...withFrameContents(doc, [frame.id])]
    const index = units.length
    for (const id of ids) unitOf.set(id, index)
    units.push({
      ids,
      parts: ids.filter((id) => doc.components[id] !== undefined),
      bounds: componentBounds(doc, frame.id)!,
      y: frame.pos.y,
      kind: 'inner',
    })
  }

  // Every other part of the circuit is a block of its own.
  const nets = terminalNets(doc, false)
  const loose = parts.filter((part) => !unitOf.has(part.id))
  for (const part of loose) {
    if (part.type === TEXT_TYPE || part.type === NET_TYPE || part.type === FRAME_TYPE) continue
    const index = units.length
    unitOf.set(part.id, index)
    units.push({
      ids: [part.id],
      parts: [part.id],
      bounds: componentBounds(doc, part.id)!,
      y: part.pos.y,
      kind: SOURCES.has(part.type) ? 'source' : part.type === 'output' ? 'sink' : 'inner',
    })
  }

  // A net label goes with a part its wires reach; a text label with the part beside it.
  const joinTo = (part: DocComponent, index: number): void => {
    const unit = units[index]
    unit.ids.push(part.id)
    unit.bounds = union(unit.bounds, componentBounds(doc, part.id)!)
    unitOf.set(part.id, index)
  }
  const hostOf = new Map<string, number>()
  for (const part of parts) {
    const index = unitOf.get(part.id)
    if (index === undefined || part.type === NET_TYPE || part.type === TEXT_TYPE) continue
    for (const wire of Object.values(doc.wires)) {
      for (const end of [wire.from, wire.to]) {
        if (end.kind !== 'pin' || end.component !== part.id) continue
        const net = nets.get(terminalKey(end))
        if (net !== undefined && !hostOf.has(net)) hostOf.set(net, index)
      }
    }
  }
  for (const part of loose) {
    if (part.type !== NET_TYPE) continue
    const net = nets.get(terminalKey({ kind: 'pin', component: part.id, port: 'net' }))
    const host = net === undefined ? undefined : hostOf.get(net)
    if (host !== undefined) joinTo(part, host)
  }
  for (const part of loose) {
    if (part.type !== TEXT_TYPE) continue
    let best: number | undefined
    let nearest = TEXT_REACH
    const at = componentBounds(doc, part.id)!
    const middle = { x: (at.x0 + at.x1) / 2, y: (at.y0 + at.y1) / 2 }
    units.forEach((unit, index) => {
      if (unit.kind === 'inner' && doc.components[unit.ids[0]]?.type === FRAME_TYPE) return
      const off = distanceTo(unit.bounds, middle)
      if (off <= nearest) {
        best = index
        nearest = off
      }
    })
    if (best !== undefined) joinTo(part, best)
  }
  return { units, unitOf }
}

/**
 * The column of each block: its depth from the sources, the longest way
 * in. A loop is cut where it closes, so every block gets a column.
 */
function columnsOf(doc: CircuitDoc, units: readonly Unit[], unitOf: Map<string, number>): number[] {
  const graph = partGraph(doc)
  const next: Set<number>[] = units.map(() => new Set())
  units.forEach((unit, index) => {
    for (const part of unit.parts) {
      for (const net of graph.outs.get(part) ?? []) {
        for (const reader of graph.readers.get(net) ?? []) {
          const to = unitOf.get(reader)
          if (to !== undefined && to !== index && units[to].kind !== 'source') next[index].add(to)
        }
      }
    }
  })

  // Cut the edges that close a loop: those back to a block still on the way.
  const state = units.map(() => 0) // 0 new, 1 on the way, 2 done
  const kept: number[][] = units.map(() => [])
  const visit = (from: number): void => {
    state[from] = 1
    for (const to of next[from]) {
      if (state[to] === 1) continue
      kept[from].push(to)
      if (state[to] === 0) visit(to)
    }
    state[from] = 2
  }
  const order = units
    .map((_, index) => index)
    .sort((a, b) => Number(units[b].kind === 'source') - Number(units[a].kind === 'source'))
  for (const index of order) if (state[index] === 0) visit(index)

  // The longest way in, in an order where every block comes after those that feed it.
  const incoming = units.map(() => 0)
  for (const list of kept) for (const to of list) incoming[to]++
  const column = units.map(() => 0)
  const ready = units.map((_, index) => index).filter((index) => incoming[index] === 0)
  while (ready.length > 0) {
    const from = ready.pop()!
    for (const to of kept[from]) {
      column[to] = Math.max(column[to], column[from] + 1)
      if (--incoming[to] === 0) ready.push(to)
    }
  }
  units.forEach((unit, index) => {
    if (unit.kind === 'source') column[index] = 0
  })
  // The outputs line up in a column of their own after everything else.
  const last = Math.max(0, ...column.filter((_, index) => units[index].kind !== 'sink'))
  units.forEach((unit, index) => {
    if (unit.kind === 'sink') column[index] = last + 1
  })
  return column
}

/** Drops the junctions that only bend a wire: their two wires become one. */
function straighten(doc: CircuitDoc, keep: ReadonlySet<string>): CircuitDoc {
  let wires: Record<string, DocWire> = { ...doc.wires }
  const junctions: Record<string, DocJunction> = { ...doc.junctions }
  const isAt = (end: Terminal, id: string): boolean => end.kind === 'junction' && end.junction === id
  for (const id of Object.keys(doc.junctions)) {
    if (keep.has(id)) continue
    const touching = Object.values(wires).filter((wire) => isAt(wire.from, id) || isAt(wire.to, id))
    if (touching.length !== 2) continue
    const [a, b] = touching
    const far = (wire: DocWire): Terminal => (isAt(wire.from, id) ? wire.to : wire.from)
    const from = far(a)
    const to = far(b)
    if (terminalKey(from) === terminalKey(to)) continue
    const format = a.format ?? b.format
    const rest = { ...wires }
    delete rest[b.id]
    rest[a.id] = format ? { id: a.id, from, to, format } : { id: a.id, from, to }
    wires = rest
    delete junctions[id]
  }
  return { ...doc, wires, junctions }
}

/** Puts each junction in the middle of what its wires join, on the grid and on no pin. */
function placeJunctions(doc: CircuitDoc, keep: ReadonlySet<string>): CircuitDoc {
  const free = Object.keys(doc.junctions).filter((id) => !keep.has(id))
  if (free.length === 0) return doc
  const at = new Map<string, Point>()
  for (const id of free) at.set(id, doc.junctions[id].pos)
  const where = (end: Terminal): Point | undefined =>
    end.kind === 'junction' ? (at.get(end.junction) ?? doc.junctions[end.junction]?.pos) : terminalEnd(doc, end)?.pos
  // A few rounds of moving each to the mean of its neighbours settles a chain of them.
  for (let round = 0; round < 12; round++) {
    for (const id of free) {
      let x = 0
      let y = 0
      let n = 0
      for (const wire of Object.values(doc.wires)) {
        const other =
          wire.from.kind === 'junction' && wire.from.junction === id
            ? wire.to
            : wire.to.kind === 'junction' && wire.to.junction === id
              ? wire.from
              : undefined
        const p = other && where(other)
        if (!p) continue
        x += p.x
        y += p.y
        n++
      }
      if (n > 0) at.set(id, { x: x / n, y: y / n })
    }
  }
  const taken = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    for (const end of [wire.from, wire.to]) {
      const p = end.kind === 'pin' ? terminalEnd(doc, end)?.pos : undefined
      if (p) taken.add(`${p.x},${p.y}`)
    }
  }
  for (const id of keep) {
    const p = doc.junctions[id]?.pos
    if (p) taken.add(`${p.x},${p.y}`)
  }
  const junctions: Record<string, DocJunction> = { ...doc.junctions }
  for (const id of free) {
    const p = at.get(id)!
    let x = Math.round(p.x)
    let y = Math.round(p.y)
    while (taken.has(`${x},${y}`)) y++
    taken.add(`${x},${y}`)
    junctions[id] = { id, pos: { x, y } }
  }
  return { ...doc, junctions }
}

/**
 * Arranges the whole drawing left to right by depth (see the top of this
 * file). The drawing keeps its top left corner. The same document when there
 * is nothing to arrange.
 */
export function autoLayout(doc: CircuitDoc): CircuitDoc {
  const { units, unitOf } = unitsOf(doc)
  if (units.length === 0) return doc
  const column = columnsOf(doc, units, unitOf)
  const columns = Math.max(...column) + 1
  const origin = {
    x: Math.min(...units.map((unit) => unit.bounds.x0)),
    y: Math.min(...units.map((unit) => unit.bounds.y0)),
  }

  // Columns from left to right, each as wide as its widest block.
  const left: number[] = []
  let x = origin.x
  for (let c = 0; c < columns; c++) {
    left.push(x)
    const widths = units.filter((_, index) => column[index] === c).map((u) => u.bounds.x1 - u.bounds.x0)
    if (widths.length > 0) x += Math.ceil(Math.max(...widths)) + COLUMN_GAP
  }

  // Down each column: in the first, in the order they were; after that,
  // each block as level as it can be with the blocks that feed it.
  const graph = partGraph(doc)
  const top = new Map<number, number>()
  const middleOf = (index: number): number => {
    const unit = units[index]
    return (top.get(index) ?? unit.bounds.y0) + (unit.bounds.y1 - unit.bounds.y0) / 2
  }
  for (let c = 0; c < columns; c++) {
    const members = units.map((_, index) => index).filter((index) => column[index] === c)
    const wanted = new Map<number, number>()
    for (const index of members) {
      const feeders = new Set<number>()
      for (const part of units[index].parts) {
        for (const net of graph.ins.get(part) ?? []) {
          for (const driver of graph.drivers.get(net) ?? []) {
            const from = unitOf.get(driver)
            if (from !== undefined && top.has(from)) feeders.add(from)
          }
        }
      }
      const unit = units[index]
      const height = unit.bounds.y1 - unit.bounds.y0
      wanted.set(
        index,
        feeders.size === 0
          ? origin.y
          : [...feeders].reduce((sum, from) => sum + middleOf(from), 0) / feeders.size - height / 2,
      )
    }
    members.sort((a, b) => wanted.get(a)! - wanted.get(b)! || units[a].y - units[b].y)
    let below = origin.y
    for (const index of members) {
      const y = Math.max(Math.round(wanted.get(index)!), below)
      top.set(index, y)
      below = y + Math.ceil(units[index].bounds.y1 - units[index].bounds.y0) + ROW_GAP
    }
  }

  // Move every block by whole grid units, all from where they were.
  const components: Record<string, DocComponent> = { ...doc.components }
  const junctions: Record<string, DocJunction> = { ...doc.junctions }
  const moved = new Set<string>()
  units.forEach((unit, index) => {
    const dx = Math.round(left[column[index]] - unit.bounds.x0)
    const dy = Math.round(top.get(index)! - unit.bounds.y0)
    for (const id of unit.ids) {
      moved.add(id)
      const part = doc.components[id]
      if (part) components[id] = { ...part, pos: { x: part.pos.x + dx, y: part.pos.y + dy } }
      const junction = doc.junctions[id]
      if (junction) {
        junctions[id] = { id, pos: { x: junction.pos.x + dx, y: junction.pos.y + dy } }
      }
    }
  })
  // The junctions inside frames moved with them; the others go where their wires meet.
  const kept = new Set([...moved].filter((id) => id in doc.junctions))
  const placed = straighten({ ...doc, components, junctions }, kept)
  return placeJunctions(placed, kept)
}
