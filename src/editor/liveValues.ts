import { X, Z, filled } from '../core/index.ts'
import type { Digit, Signal } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import { terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { SimBridge } from './simBridge.ts'

/** What a wire carries right now. */
export interface WireValue {
  /** The lowest digit: all there is on a plain wire. */
  readonly digit: Digit
  /** Every digit, the lowest first. More than one on a bus. */
  readonly signal: Signal
  /** True when two outputs drive the wire to different values. */
  readonly conflict: boolean
  /** True when pins of different widths are wired together here. */
  readonly mixed: boolean
}

/**
 * The values of a running circuit, laid over the drawing: one snapshot for
 * one frame.
 */
export interface LiveValues {
  /** The radix the circuit runs in. */
  readonly radix: number
  /** The value on the wires at a terminal, wired or not. */
  at(terminal: Terminal): WireValue
  /** The value of a net, by the names `terminalNets` gives. */
  net(net: string | undefined): WireValue
  /** What the face of a switch, button, constant or lamp shows. */
  face(componentId: string): Digit | undefined
  /** The same for a part on a bus: every digit of it. */
  faceSignal(componentId: string): Signal | undefined
  /** What an output pin drives. */
  output(componentId: string, port: string): Digit
  /** The same, every digit of it. */
  outputSignal(componentId: string, port: string): Signal
}

const FLOATING: WireValue = { digit: Z, signal: [Z], conflict: false, mixed: false }

/** Reads the simulator behind `bridge` for everything `doc` draws. */
export function readLiveValues(doc: CircuitDoc, bridge: SimBridge): LiveValues {
  const sim = bridge.sim
  const netOf = terminalNets(doc)
  const nets = new Map<string, WireValue>()

  const probe = (key: string): WireValue | undefined => {
    const found = bridge.probeTerminal(key)
    return found
      ? {
          digit: found.value[0],
          signal: found.value,
          conflict: found.conflict,
          mixed: bridge.mixedAt(key),
        }
      : undefined
  }

  // One terminal is enough to read a whole net: all of it carries the same.
  for (const [key, name] of netOf) {
    if (nets.has(name)) continue
    const value = probe(key)
    if (value) nets.set(name, value)
  }

  const net = (name: string | undefined): WireValue =>
    (name === undefined ? undefined : nets.get(name)) ?? FLOATING

  const faceSignal = (componentId: string): Signal | undefined => {
    const component = doc.components[componentId]
    const simId = bridge.simComponent(componentId)
    if (!component || simId === undefined) return undefined
    switch (component.type) {
      case 'input':
      case 'button':
        // The state, not the pin, so a click shows at once even when paused.
        return (sim.getState(simId) as readonly Digit[]).map((digit) =>
          digit < sim.radix ? digit : X,
        )
      case 'const':
        return filled(
          component.params.width ?? 1,
          component.params.value < sim.radix ? component.params.value : X,
        )
      case 'output':
        return probe(terminalKey({ kind: 'pin', component: componentId, port: 'in' }))?.signal
      default:
        return undefined
    }
  }
  const outputSignal = (componentId: string, port: string): Signal => {
    const simId = bridge.simComponent(componentId)
    if (simId !== undefined) return sim.readPin({ component: simId, port })
    // A named circuit has no pin of its own: read the node behind it.
    const inside = probe(terminalKey({ kind: 'pin', component: componentId, port }))
    return inside ? inside.signal : [X]
  }

  return {
    radix: sim.radix,
    net,
    faceSignal,
    outputSignal,
    at(terminal) {
      const key = terminalKey(terminal)
      const name = netOf.get(key)
      return name !== undefined ? net(name) : (probe(key) ?? FLOATING)
    },
    face(componentId) {
      return faceSignal(componentId)?.[0]
    },
    output(componentId, port) {
      return outputSignal(componentId, port)[0]
    },
  }
}

/** The types whose face answers a click. */
export function isPokeable(type: string): boolean {
  return type === 'input' || type === 'button'
}
