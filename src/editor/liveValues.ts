import { X, Z } from '../core/index.ts'
import type { Digit } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import { terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { SimBridge } from './simBridge.ts'

/** What a wire carries right now. */
export interface WireValue {
  readonly digit: Digit
  /** True when two outputs drive the wire to different values. */
  readonly conflict: boolean
}

/**
 * The values of a running circuit, laid over the drawing: one snapshot for
 * one frame.
 */
export interface LiveValues {
  /** The value on the wires at a terminal, wired or not. */
  at(terminal: Terminal): WireValue
  /** The value of a net, by the names `terminalNets` gives. */
  net(net: string | undefined): WireValue
  /** What the face of a switch, button, constant or lamp shows. */
  face(componentId: string): Digit | undefined
  /** What an output pin drives. */
  output(componentId: string, port: string): Digit
}

const FLOATING: WireValue = { digit: Z, conflict: false }

/** Reads the simulator behind `bridge` for everything `doc` draws. */
export function readLiveValues(doc: CircuitDoc, bridge: SimBridge): LiveValues {
  const sim = bridge.sim
  const netOf = terminalNets(doc)
  const nets = new Map<string, WireValue>()

  const probe = (key: string): WireValue | undefined => {
    const found = bridge.probeTerminal(key)
    return found ? { digit: found.value[0], conflict: found.conflict } : undefined
  }

  // One terminal is enough to read a whole net: all of it carries the same.
  for (const [key, name] of netOf) {
    if (nets.has(name)) continue
    const value = probe(key)
    if (value) nets.set(name, value)
  }

  const net = (name: string | undefined): WireValue =>
    (name === undefined ? undefined : nets.get(name)) ?? FLOATING

  return {
    net,
    at(terminal) {
      const key = terminalKey(terminal)
      const name = netOf.get(key)
      return name !== undefined ? net(name) : (probe(key) ?? FLOATING)
    },
    face(componentId) {
      const component = doc.components[componentId]
      const simId = bridge.simComponent(componentId)
      if (!component || simId === undefined) return undefined
      switch (component.type) {
        case 'input':
        case 'button': {
          // The state, not the pin, so a click shows at once even when paused.
          const digit = (sim.getState(simId) as readonly Digit[])[0]
          return digit < sim.radix ? digit : X
        }
        case 'const':
          return component.params.value < sim.radix ? component.params.value : X
        case 'output':
          return probe(terminalKey({ kind: 'pin', component: componentId, port: 'in' }))?.digit
        default:
          return undefined
      }
    },
    output(componentId, port) {
      const simId = bridge.simComponent(componentId)
      if (simId !== undefined) return sim.readPin({ component: simId, port })[0]
      // A named circuit has no pin of its own: read the node behind it.
      const inside = probe(terminalKey({ kind: 'pin', component: componentId, port }))
      return inside ? inside.digit : X
    },
  }
}

/** The types whose face answers a click. */
export function isPokeable(type: string): boolean {
  return type === 'input' || type === 'button'
}
