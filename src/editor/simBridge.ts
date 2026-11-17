import { Simulator } from '../core/index.ts'
import type { ComponentId, NetId, PinRef, Probe } from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import { flatten } from './flatten.ts'
import type { Library, Netlist } from './flatten.ts'

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
 *
 * Parts that stand for a named circuit are flattened first (`flatten.ts`),
 * so the simulator only ever holds built-in components. A part is known here
 * by its path, which for a part of the drawing itself is simply its id.
 */
export class SimBridge {
  readonly sim: Simulator
  private readonly mirrored = new Map<string, Mirrored>()
  private netlist: Netlist | undefined
  private last: { readonly doc: CircuitDoc; readonly library: Library } | undefined

  constructor(sim: Simulator = new Simulator()) {
    this.sim = sim
  }

  /** The simulator component standing in for a part, by its path. */
  simComponent(key: string): ComponentId | undefined {
    return this.mirrored.get(key)?.simId
  }

  /**
   * Steps a switch to its next value, or its previous one for a negative
   * `step`, going round the radix. Returns false if the part is no switch.
   */
  cycleInput(docId: string, step: number): boolean {
    const entry = this.mirrored.get(docId)
    if (!entry || entry.type !== 'input') return false
    const radix = this.sim.radix
    const state = this.sim.getState(entry.simId) as readonly number[]
    this.sim.setState(
      entry.simId,
      state.map((digit) => (((digit < 0 ? 0 : digit) + step) % radix + radix) % radix),
    )
    return true
  }

  /**
   * Presses a push button (it gives the top value) or lets go of it (0).
   * Returns false if the part is no button.
   */
  setButton(docId: string, pressed: boolean): boolean {
    const entry = this.mirrored.get(docId)
    if (!entry || entry.type !== 'button') return false
    const state = this.sim.getState(entry.simId) as readonly number[]
    this.sim.setState(entry.simId, state.map(() => (pressed ? this.sim.radix - 1 : 0)))
    return true
  }

  /**
   * Puts a switch on a value. Returns false if the part is no switch or the
   * radix has no such value.
   */
  setInput(docId: string, digit: number): boolean {
    const entry = this.mirrored.get(docId)
    if (!entry || entry.type !== 'input') return false
    if (!Number.isInteger(digit) || digit < 0 || digit >= this.sim.radix) return false
    const state = this.sim.getState(entry.simId) as readonly number[]
    this.sim.setState(entry.simId, state.map(() => digit))
    return true
  }

  /** The output pin of every clock, the ones inside named circuits too. */
  clockPins(): PinRef[] {
    const pins: PinRef[] = []
    for (const entry of this.mirrored.values()) {
      if (entry.type === 'clock') pins.push({ component: entry.simId, port: 'out' })
    }
    return pins
  }

  /** The value of every switch of the drawing itself, by part id. */
  inputValues(): Record<string, number> {
    const values: Record<string, number> = {}
    for (const [key, entry] of this.mirrored) {
      if (entry.type !== 'input' || key.includes('/')) continue
      const digit = (this.sim.getState(entry.simId) as readonly number[])[0]
      values[key] = digit >= 0 && digit < this.sim.radix ? digit : 0
    }
    return values
  }

  /**
   * What the wires at a terminal of the drawing carry, by `terminalKey`.
   * Undefined when no part drives or reads that node at all.
   */
  probeTerminal(key: string): Probe | undefined {
    const pin = this.netlist?.probes.get(key)
    if (pin === undefined) return undefined
    const simId = this.simComponent(pin.part)
    if (simId === undefined) return undefined
    return this.sim.probe({ component: simId, port: pin.port })
  }

  /**
   * Brings the simulator in step with `doc`. `library` holds the drawings
   * that its named-circuit parts stand for.
   */
  sync(doc: CircuitDoc, library: Library = {}): void {
    const last = this.last
    if (
      last &&
      last.library === library &&
      last.doc.components === doc.components &&
      last.doc.wires === doc.wires &&
      last.doc.junctions === doc.junctions
    ) {
      return
    }
    const netlist = flatten(doc, library)
    this.sim.batch(() => {
      this.syncComponents(netlist)
      this.syncNets(netlist)
    })
    this.netlist = netlist
    this.last = { doc, library }
  }

  private syncComponents(netlist: Netlist): void {
    for (const [key, entry] of this.mirrored) {
      const part = netlist.parts.get(key)
      // An id can come back as a different part after undo and a new edit.
      if (part && part.type === entry.type && part.params === entry.params) continue
      this.sim.removeComponent(entry.simId)
      this.mirrored.delete(key)
    }
    for (const part of netlist.parts.values()) {
      const entry = this.mirrored.get(part.key)
      if (entry) {
        if (this.sim.getComponent(entry.simId).delay !== part.delay) {
          this.sim.setDelay(entry.simId, part.delay)
        }
        continue
      }
      const simId = this.sim.addComponent(part.type, { params: part.params, delay: part.delay })
      this.mirrored.set(part.key, { simId, type: part.type, params: part.params })
    }
  }

  private syncNets(netlist: Netlist): void {
    const sim = this.sim
    const groups: PinRef[][] = []
    for (const group of netlist.groups) {
      const pins: PinRef[] = []
      for (const pin of group) {
        const simId = this.simComponent(pin.part)
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
