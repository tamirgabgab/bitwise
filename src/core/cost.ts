import type { ComponentId, NetId, Simulator } from './simulator.ts'

/** What a circuit costs to build and how long it takes to answer. */
export interface CircuitCost {
  /**
   * How many parts do work: those with both inputs and outputs. Switches,
   * constants, clocks, lamps and displays are not counted.
   */
  readonly gates: number
  /**
   * The longest way through the circuit, as the sum of the delays of the
   * gates along it, in ticks. Undefined when a gate feeds itself, directly
   * or through others: a loop has no longest way.
   */
  readonly depth: number | undefined
}

/** The longest way through a circuit: its gates in order and the nets between them. */
export interface CriticalPath {
  readonly gates: readonly ComponentId[]
  /**
   * The nets along the way: those into the first gate, from each gate to
   * the next, and out of the last, so the path reads from where it starts
   * to where it ends.
   */
  readonly nets: readonly NetId[]
}

interface Walk {
  readonly gates: number
  readonly depth: number | undefined
  /** The gate where the longest way ends, undefined when there is none. */
  readonly end: ComponentId | undefined
  /** For each gate, the gate before it on the longest way that reaches it. */
  readonly from: ReadonlyMap<ComponentId, ComponentId>
  /** The net that carries a value from one gate to the next, by `a>b`. */
  readonly via: ReadonlyMap<string, NetId>
}

function walk(sim: Simulator): Walk {
  const delay = new Map<ComponentId, number>()
  const inputs = new Map<ComponentId, Set<string>>()
  const infos = sim.componentIds().map((id) => sim.getComponent(id))
  for (const info of infos) {
    const ins = info.ports.filter((port) => port.direction === 'in')
    if (ins.length === 0 || ins.length === info.ports.length) continue
    delay.set(info.id, info.delay)
    inputs.set(info.id, new Set(ins.map((port) => port.name)))
  }

  // An edge runs from a gate to every gate that reads one of its outputs.
  const next = new Map<ComponentId, Set<ComponentId>>()
  const waiting = new Map<ComponentId, number>()
  const via = new Map<string, NetId>()
  for (const id of delay.keys()) {
    next.set(id, new Set())
    waiting.set(id, 0)
  }
  for (const info of infos) {
    const readers = next.get(info.id)
    if (!readers) continue
    for (const port of info.ports) {
      if (port.direction !== 'out') continue
      const net = sim.netOf({ component: info.id, port: port.name })
      if (net === undefined) continue
      for (const pin of sim.getNet(net).pins) {
        if (!inputs.get(pin.component)?.has(pin.port) || readers.has(pin.component)) continue
        readers.add(pin.component)
        via.set(`${info.id}>${pin.component}`, net)
        waiting.set(pin.component, (waiting.get(pin.component) ?? 0) + 1)
      }
    }
  }

  // Gates in an order where each comes after all that feed it. A gate on a
  // loop never gets its turn.
  const reach = new Map<ComponentId, number>()
  const from = new Map<ComponentId, ComponentId>()
  const ready: ComponentId[] = []
  for (const [id, count] of waiting) {
    if (count === 0) ready.push(id)
  }
  let depth = 0
  let end: ComponentId | undefined
  let done = 0
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    done++
    const total = (reach.get(id) ?? 0) + (delay.get(id) ?? 1)
    if (total > depth) {
      depth = total
      end = id
    }
    for (const reader of next.get(id) ?? []) {
      if (total > (reach.get(reader) ?? 0)) {
        reach.set(reader, total)
        from.set(reader, id)
      }
      const left = (waiting.get(reader) ?? 1) - 1
      waiting.set(reader, left)
      if (left === 0) ready.push(reader)
    }
  }
  const whole = done === delay.size
  return {
    gates: delay.size,
    depth: whole ? depth : undefined,
    end: whole ? end : undefined,
    from,
    via,
  }
}

/** Counts the gates of a circuit and measures its longest path. */
export function circuitCost(sim: Simulator): CircuitCost {
  const { gates, depth } = walk(sim)
  return { gates, depth }
}

/**
 * The gates along the longest way through the circuit, first to last, and
 * the nets that join them. Empty when there is no gate, or a loop.
 */
export function criticalPath(sim: Simulator): CriticalPath {
  const { end, from, via } = walk(sim)
  const gates: ComponentId[] = []
  const nets: NetId[] = []
  for (let id = end; id !== undefined; id = from.get(id)) {
    const before = from.get(id)
    gates.unshift(id)
    if (before !== undefined) nets.unshift(via.get(`${before}>${id}`) as NetId)
  }
  if (gates.length === 0) return { gates, nets }
  const outer = (id: ComponentId, direction: 'in' | 'out'): NetId[] =>
    sim
      .getComponent(id)
      .ports.filter((port) => port.direction === direction)
      .map((port) => sim.netOf({ component: id, port: port.name }))
      .filter((net) => net !== undefined)
  const all = [...outer(gates[0], 'in'), ...nets, ...outer(gates[gates.length - 1], 'out')]
  return { gates, nets: [...new Set(all)] }
}
