import { addWire, terminalKey } from './document.ts'
import type { CircuitDoc, DocJunction, DocWire, Terminal } from './document.ts'
import type { Point } from './geometry.ts'

/*
 * The shape of a wire the user bent. A bend is made of junctions that only
 * turn the wire (`bendWire` in document.ts); this module finds the handles
 * to drag a wire by, and takes the bends away again.
 */

/** A handle on a straight stretch of a wire: where it sits, and whether the stretch runs across. */
export interface WireHandle {
  readonly pos: Point
  readonly level: boolean
}

/**
 * One handle in the middle of each straight stretch of a path, on the grid,
 * for stretches long enough to hold one off their ends.
 */
export function wireHandles(path: readonly Point[]): WireHandle[] {
  const handles: WireHandle[] = []
  let start = 0
  for (let i = 1; i < path.length; i++) {
    const level = path[start].y === path[i].y
    const next = path[i + 1]
    const turns = next === undefined || (level ? next.y !== path[i].y : next.x !== path[i].x)
    if (!turns) continue
    const a = path[start]
    const b = path[i]
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (length >= 2) {
      handles.push({
        pos: level ? { x: Math.round((a.x + b.x) / 2), y: a.y } : { x: a.x, y: Math.round((a.y + b.y) / 2) },
        level,
      })
    }
    start = i
  }
  return handles
}

/** The wires on a junction. */
function wiresAt(doc: CircuitDoc, junction: string): DocWire[] {
  const at = (end: Terminal): boolean => end.kind === 'junction' && end.junction === junction
  return Object.values(doc.wires).filter((wire) => at(wire.from) || at(wire.to))
}

/**
 * The wire `wireId` with the wires it is bent into: from it, on through
 * every junction that has just two wires, both ways. Its ends, and the
 * junctions that only bend it.
 */
export function bendChain(
  doc: CircuitDoc,
  wireId: string,
): { readonly wires: readonly string[]; readonly junctions: readonly string[]; readonly ends: readonly [Terminal, Terminal] } | undefined {
  const first = doc.wires[wireId]
  if (!first) return undefined
  const wires = new Set([wireId])
  const junctions = new Set<string>()
  const walk = (from: Terminal, wire: DocWire): Terminal => {
    let end = from
    let along = wire
    while (end.kind === 'junction' && !junctions.has(end.junction)) {
      const touching = wiresAt(doc, end.junction)
      if (touching.length !== 2) break
      const next = touching.find((each) => each.id !== along.id)
      if (!next || wires.has(next.id)) break
      junctions.add(end.junction)
      wires.add(next.id)
      const here = end.junction
      end = next.from.kind === 'junction' && next.from.junction === here ? next.to : next.from
      along = next
    }
    return end
  }
  const a = walk(first.from, first)
  const b = walk(first.to, first)
  return { wires: [...wires], junctions: [...junctions], ends: [a, b] }
}

/**
 * Takes the bends out of a wire, so its path is worked out again: the
 * junctions that only bend it go, and one wire joins its two ends. Returns
 * undefined when it has no bends.
 */
export function unbendWire(doc: CircuitDoc, wireId: string): { doc: CircuitDoc; wire: string } | undefined {
  const chain = bendChain(doc, wireId)
  if (!chain || chain.junctions.length === 0) return undefined
  const [from, to] = chain.ends
  if (terminalKey(from) === terminalKey(to)) return undefined
  const format = chain.wires.map((id) => doc.wires[id].format).find((each) => each !== undefined)
  const wires: Record<string, DocWire> = { ...doc.wires }
  for (const id of chain.wires) delete wires[id]
  const junctions: Record<string, DocJunction> = { ...doc.junctions }
  for (const id of chain.junctions) delete junctions[id]
  const added = addWire({ ...doc, wires, junctions }, from, to, format)
  return added ? { doc: added.doc, wire: added.id } : undefined
}
