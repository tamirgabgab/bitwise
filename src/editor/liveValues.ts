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

  const probe = (component: string, port: string): WireValue | undefined => {
    const simId = bridge.simComponent(component)
    if (simId === undefined) return undefined
    const { value, conflict } = sim.probe({ component: simId, port })
    return { digit: value[0], conflict }
  }

  // One pin is enough to read a whole net: every pin on it sees the same.
  for (const wire of Object.values(doc.wires)) {
    for (const end of [wire.from, wire.to]) {
      if (end.kind !== 'pin') continue
      const net = netOf.get(terminalKey(end))
      if (net === undefined || nets.has(net)) continue
      const value = probe(end.component, end.port)
      if (value) nets.set(net, value)
    }
  }

  const net = (name: string | undefined): WireValue =>
    (name === undefined ? undefined : nets.get(name)) ?? FLOATING

  return {
    net,
    at(terminal) {
      const name = netOf.get(terminalKey(terminal))
      if (name !== undefined) return net(name)
      if (terminal.kind === 'junction') return FLOATING
      return probe(terminal.component, terminal.port) ?? FLOATING
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
          return probe(componentId, 'in')?.digit
        default:
          return undefined
      }
    },
    output(componentId, port) {
      const simId = bridge.simComponent(componentId)
      if (simId === undefined) return X
      return sim.readPin({ component: simId, port })[0]
    },
  }
}

/** The types whose face answers a click. */
export function isPokeable(type: string): boolean {
  return type === 'input' || type === 'button'
}
