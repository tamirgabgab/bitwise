import { terminalNets } from './connectivity.ts'
import { terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { symbolOf } from './symbols.ts'

/*
 * The cone of influence of a selection: everything its outputs reach,
 * part after part, and everything that reaches its inputs. A wire that is
 * selected counts as its whole net, so the cone runs both ways from it.
 * A part that stands for a named circuit is a box here: each of its inputs
 * reaches each of its outputs.
 */

export interface ConeMarks {
  /** The parts in the cone, both ways, the selected ones too. */
  readonly parts: ReadonlySet<string>
  /** The nets in the cone, by the ids `terminalNets` gives them. */
  readonly nets: ReadonlySet<string>
  /** The wires and the junctions of those nets. */
  readonly wires: ReadonlySet<string>
  readonly junctions: ReadonlySet<string>
  /** The parts and wires the selection drives, as opposed to those that drive it. */
  readonly ahead: ReadonlySet<string>
}

interface Graph {
  readonly netOf: (terminal: Terminal) => string
  /** The nets each part reads and drives. */
  readonly ins: ReadonlyMap<string, string[]>
  readonly outs: ReadonlyMap<string, string[]>
  /** The parts that read and drive each net. */
  readonly readers: ReadonlyMap<string, string[]>
  readonly drivers: ReadonlyMap<string, string[]>
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function graphOf(doc: CircuitDoc): Graph {
  const nets = terminalNets(doc)
  const netOf = (terminal: Terminal): string => {
    const key = terminalKey(terminal)
    return nets.get(key) ?? key
  }
  const ins = new Map<string, string[]>()
  const outs = new Map<string, string[]>()
  const readers = new Map<string, string[]>()
  const drivers = new Map<string, string[]>()
  for (const part of Object.values(doc.components)) {
    for (const pin of symbolOf(part).pins) {
      const net = netOf({ kind: 'pin', component: part.id, port: pin.name })
      if (pin.direction === 'in') {
        push(ins, part.id, net)
        push(readers, net, part.id)
      } else {
        push(outs, part.id, net)
        push(drivers, net, part.id)
      }
    }
  }
  return { netOf, ins, outs, readers, drivers }
}

/** Walks from some nets, one way, and gives the nets and the parts it reached. */
function walk(
  graph: Graph,
  startNets: readonly string[],
  startParts: readonly string[],
  ahead: boolean,
): { nets: Set<string>; parts: Set<string> } {
  const nets = new Set<string>()
  const parts = new Set<string>()
  const next = ahead ? graph.outs : graph.ins
  const across = ahead ? graph.readers : graph.drivers
  const queue = [...startNets]
  for (const part of startParts) queue.push(...(next.get(part) ?? []))
  while (queue.length > 0) {
    const net = queue.pop()!
    if (nets.has(net)) continue
    nets.add(net)
    for (const part of across.get(net) ?? []) {
      if (parts.has(part)) continue
      parts.add(part)
      queue.push(...(next.get(part) ?? []))
    }
  }
  return { nets, parts }
}

/**
 * The cone of influence of the selected parts and wires, or undefined when
 * the selection holds neither.
 */
export function influenceCone(doc: CircuitDoc, selection: ReadonlySet<string>): ConeMarks | undefined {
  const graph = graphOf(doc)
  const startParts: string[] = []
  const startNets: string[] = []
  for (const id of selection) {
    const wire = doc.wires[id]
    if (doc.components[id]) startParts.push(id)
    else if (wire) startNets.push(graph.netOf(wire.from))
    else if (doc.junctions[id]) startNets.push(graph.netOf({ kind: 'junction', junction: id }))
  }
  if (startParts.length === 0 && startNets.length === 0) return undefined

  const forward = walk(graph, startNets, startParts, true)
  const backward = walk(graph, startNets, startParts, false)
  const parts = new Set([...startParts, ...forward.parts, ...backward.parts])
  const nets = new Set([...forward.nets, ...backward.nets])
  const wires = new Set<string>()
  const ahead = new Set(forward.parts)
  for (const wire of Object.values(doc.wires)) {
    const net = graph.netOf(wire.from)
    if (nets.has(net)) wires.add(wire.id)
    if (forward.nets.has(net)) ahead.add(wire.id)
  }
  const junctions = new Set<string>()
  for (const id of Object.keys(doc.junctions)) {
    if (nets.has(graph.netOf({ kind: 'junction', junction: id }))) junctions.add(id)
  }
  return { parts, nets, wires, junctions, ahead }
}
