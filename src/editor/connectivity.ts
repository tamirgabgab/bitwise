import { terminalKey } from './document.ts'
import type { CircuitDoc } from './document.ts'

/** A pin, named by the document's ids. */
export interface DocPin {
  readonly component: string
  readonly port: string
}

/**
 * Which electrical node every wired terminal belongs to. The keys are
 * `terminalKey`s; two terminals are wired together, directly or through
 * junctions and other wires, exactly when they map to the same value.
 */
export function terminalNets(doc: CircuitDoc): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
      root = next
    }
    parent.set(key, root)
    return root
  }

  for (const wire of Object.values(doc.wires)) {
    const a = find(terminalKey(wire.from))
    const b = find(terminalKey(wire.to))
    if (a !== b) parent.set(a, b)
  }

  const nets = new Map<string, string>()
  for (const key of parent.keys()) nets.set(key, find(key))
  return nets
}

/**
 * The electrical nodes of a drawing: each group lists the pins that are wired
 * together. A pin that is wired to no other pin is in no group.
 */
export function pinGroups(doc: CircuitDoc): DocPin[][] {
  const nets = terminalNets(doc)
  const groups = new Map<string, DocPin[]>()
  const seen = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    for (const end of [wire.from, wire.to]) {
      if (end.kind !== 'pin') continue
      const key = terminalKey(end)
      if (seen.has(key)) continue
      seen.add(key)
      const net = nets.get(key) ?? key
      const pin: DocPin = { component: end.component, port: end.port }
      const group = groups.get(net)
      if (group) group.push(pin)
      else groups.set(net, [pin])
    }
  }
  return [...groups.values()].filter((group) => group.length >= 2)
}
