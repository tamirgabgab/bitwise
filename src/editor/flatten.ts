import { builtinComponents } from '../core/index.ts'
import { SUB_TYPE, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'

/*
 * The simulator knows nothing about named circuits. Before a drawing reaches
 * it, every part that stands for a circuit is replaced by the parts inside
 * that circuit, as deep as it goes. What comes out is a plain netlist.
 */

/** A real part of the flattened circuit. */
export interface FlatPart {
  /**
   * Its path from the drawing on screen: the id of a part there, or
   * `c7/c3` for part c3 inside the named circuit that part c7 stands for.
   */
  readonly key: string
  readonly type: string
  readonly params: Readonly<Record<string, number>>
  readonly delay: number
}

export interface FlatPin {
  readonly part: string
  readonly port: string
}

export interface Netlist {
  readonly parts: ReadonlyMap<string, FlatPart>
  /** The electrical nodes with more than one pin on them. */
  readonly groups: readonly (readonly FlatPin[])[]
  /**
   * For a terminal of the drawing on screen, by `terminalKey`: a pin that
   * sits on the same node, so reading it tells what the terminal carries.
   * A terminal with no real pin anywhere on its node is not listed.
   */
  readonly probes: ReadonlyMap<string, FlatPin>
}

/** The drawings a named-circuit part can stand for, by circuit id. */
export type Library = Readonly<Record<string, { readonly doc: CircuitDoc }>>

/**
 * Flattens `root`. Inside a named circuit a switch is the way in and an
 * output part the way out: neither becomes a part, the pin of the part that
 * stands for the circuit is simply the same node as the wire inside.
 */
export function flatten(root: CircuitDoc, library: Library = {}): Netlist {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let top = key
    for (let next = parent.get(top); next !== undefined && next !== top; next = parent.get(top)) {
      top = next
    }
    parent.set(key, top)
    return top
  }
  const union = (a: string, b: string): void => {
    const x = find(a)
    const y = find(b)
    if (x !== y) parent.set(x, y)
  }

  const parts = new Map<string, FlatPart>()
  const pins: { readonly node: string; readonly pin: FlatPin }[] = []
  const rootKeys: string[] = []

  const pinNode = (prefix: string, component: string, port: string): string =>
    prefix + terminalKey({ kind: 'pin', component, port })

  const walk = (doc: CircuitDoc, prefix: string, stack: readonly string[]): void => {
    const inside = prefix !== ''
    for (const wire of Object.values(doc.wires)) {
      union(prefix + terminalKey(wire.from), prefix + terminalKey(wire.to))
    }
    for (const component of Object.values(doc.components)) {
      if (component.type === SUB_TYPE) {
        walkInto(component, prefix, stack)
        continue
      }
      // The boundary of a named circuit: a node, not a part.
      if (inside && (component.type === 'input' || component.type === 'output')) continue
      if (!builtinComponents.has(component.type)) continue
      const key = prefix + component.id
      parts.set(key, {
        key,
        type: component.type,
        params: component.params,
        delay: component.delay,
      })
      for (const port of builtinComponents.get(component.type).ports(component.params)) {
        const node = pinNode(prefix, component.id, port.name)
        pins.push({ node, pin: { part: key, port: port.name } })
        if (!inside) rootKeys.push(node)
      }
    }
    if (!inside) {
      for (const junction of Object.values(doc.junctions)) {
        rootKeys.push(terminalKey({ kind: 'junction', junction: junction.id }))
      }
    }
  }

  const walkInto = (component: DocComponent, prefix: string, stack: readonly string[]): void => {
    const circuit = component.sub?.circuit
    const inner = circuit === undefined ? undefined : library[circuit]?.doc
    // A circuit inside itself would never end. Editing does not allow it.
    if (circuit === undefined || !inner || stack.includes(circuit)) return
    const innerPrefix = `${prefix}${component.id}/`
    walk(inner, innerPrefix, [...stack, circuit])
    for (const part of Object.values(inner.components)) {
      const port = part.type === 'input' ? 'out' : part.type === 'output' ? 'in' : undefined
      if (port === undefined) continue
      const outside = pinNode(prefix, component.id, part.id)
      union(outside, pinNode(innerPrefix, part.id, port))
      if (prefix === '') rootKeys.push(outside)
    }
  }

  walk(root, '', [])

  const members = new Map<string, FlatPin[]>()
  for (const { node, pin } of pins) {
    const top = find(node)
    const list = members.get(top)
    if (list) list.push(pin)
    else members.set(top, [pin])
  }
  const probes = new Map<string, FlatPin>()
  for (const key of rootKeys) {
    const list = members.get(find(key))
    if (list) probes.set(key, list[0])
  }
  return {
    parts,
    groups: [...members.values()].filter((group) => group.length >= 2),
    probes,
  }
}
