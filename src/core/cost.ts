import type { ComponentId, Simulator } from './simulator.ts'

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

/** Counts the gates of a circuit and measures its longest path. */
export function circuitCost(sim: Simulator): CircuitCost {
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
        waiting.set(pin.component, (waiting.get(pin.component) ?? 0) + 1)
      }
    }
  }

  // Gates in an order where each comes after all that feed it. A gate on a
  // loop never gets its turn.
  const reach = new Map<ComponentId, number>()
  const ready: ComponentId[] = []
  for (const [id, count] of waiting) {
    if (count === 0) ready.push(id)
  }
  let depth = 0
  let done = 0
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    done++
    const total = (reach.get(id) ?? 0) + (delay.get(id) ?? 1)
    depth = Math.max(depth, total)
    for (const reader of next.get(id) ?? []) {
      reach.set(reader, Math.max(reach.get(reader) ?? 0, total))
      const left = (waiting.get(reader) ?? 1) - 1
      waiting.set(reader, left)
      if (left === 0) ready.push(reader)
    }
  }
  return { gates: delay.size, depth: done === delay.size ? depth : undefined }
}
