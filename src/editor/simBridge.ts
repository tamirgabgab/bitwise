import { Simulator } from '../core/index.ts'
import type { ComponentId, NetId, PinRef } from '../core/index.ts'
import { pinGroups } from './connectivity.ts'
import type { CircuitDoc, DocComponent } from './document.ts'

interface Mirrored {
  readonly simId: ComponentId
  readonly type: string
  readonly params: Readonly<Record<string, number>>
}

function pinKey(pin: PinRef): string {
  return `${pin.component}:${pin.port}`
}

/**
 * Keeps a simulator in step with the drawing.
 *
 * Each sync changes only what differs from the last one: a part that stays
 * keeps its simulator component, and a pin whose connections did not change
 * is never detached. That is what lets a circuit keep running, and a latch
 * keep its value, while the user edits somewhere else.
 */
export class SimBridge {
  readonly sim: Simulator
  private readonly mirrored = new Map<string, Mirrored>()
  private lastWires: CircuitDoc['wires'] | undefined

  constructor(sim: Simulator = new Simulator()) {
    this.sim = sim
  }

  /** The simulator component standing in for a part of the drawing. */
  simComponent(docId: string): ComponentId | undefined {
    return this.mirrored.get(docId)?.simId
  }

  sync(doc: CircuitDoc): void {
    this.sim.batch(() => {
      const componentsChanged = this.syncComponents(doc)
      if (componentsChanged || doc.wires !== this.lastWires) this.syncNets(doc)
      this.lastWires = doc.wires
    })
  }

  private syncComponents(doc: CircuitDoc): boolean {
    let changed = false
    for (const [docId, entry] of this.mirrored) {
      const component: DocComponent | undefined = doc.components[docId]
      // An id can come back as a different part after undo and a new edit.
      if (component && component.type === entry.type && component.params === entry.params) {
        continue
      }
      this.sim.removeComponent(entry.simId)
      this.mirrored.delete(docId)
      changed = true
    }
    for (const component of Object.values(doc.components)) {
      const entry = this.mirrored.get(component.id)
      if (entry) {
        if (this.sim.getComponent(entry.simId).delay !== component.delay) {
          this.sim.setDelay(entry.simId, component.delay)
        }
        continue
      }
      const simId = this.sim.addComponent(component.type, {
        params: component.params,
        delay: component.delay,
      })
      this.mirrored.set(component.id, { simId, type: component.type, params: component.params })
      changed = true
    }
    return changed
  }

  private syncNets(doc: CircuitDoc): void {
    const sim = this.sim
    const groups: PinRef[][] = []
    for (const group of pinGroups(doc)) {
      const pins: PinRef[] = []
      for (const pin of group) {
        const simId = this.simComponent(pin.component)
        if (simId !== undefined) pins.push({ component: simId, port: pin.port })
      }
      if (pins.length >= 2) groups.push(pins)
    }
    // Bigger groups choose first, so they keep the net most of their pins
    // are already on and as few pins as possible have to move.
    groups.sort((a, b) => b.length - a.length)

    const wanted = new Map<string, NetId>()
    const claimed = new Set<NetId>()
    for (const pins of groups) {
      const votes = new Map<NetId, number>()
      for (const pin of pins) {
        const net = sim.netOf(pin)
        if (net !== undefined && !claimed.has(net)) votes.set(net, (votes.get(net) ?? 0) + 1)
      }
      let target: NetId | undefined
      let best = 0
      for (const [net, count] of votes) {
        if (count > best) {
          target = net
          best = count
        }
      }
      if (target === undefined) {
        const first = pins[0]
        const port = sim.getComponent(first.component).ports.find((p) => p.name === first.port)
        target = sim.addNet(port?.width ?? 1)
      }
      claimed.add(target)
      for (const pin of pins) wanted.set(pinKey(pin), target)
    }

    const toAttach: [PinRef, NetId][] = []
    for (const simId of sim.componentIds()) {
      for (const port of sim.getComponent(simId).ports) {
        const pin: PinRef = { component: simId, port: port.name }
        const current = sim.netOf(pin)
        const target = wanted.get(pinKey(pin))
        if (current === target) continue
        if (current !== undefined) sim.detach(pin)
        if (target !== undefined) toAttach.push([pin, target])
      }
    }
    for (const [pin, net] of toAttach) sim.attach(pin, net)
    for (const net of sim.netIds()) {
      if (sim.getNet(net).pins.length === 0) sim.removeNet(net)
    }
  }
}
