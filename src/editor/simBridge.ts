import {
  Simulator,
  Z,
  circuitCost,
  criticalPath,
  formatSignal,
  parseSignal,
  stepSignal,
} from '../core/index.ts'
import type {
  CircuitCost,
  ComponentId,
  Digit,
  NetId,
  PinRef,
  Probe,
  Signal,
} from '../core/index.ts'
import type { CircuitDoc } from './document.ts'
import { flatten } from './flatten.ts'
import type { Library, Netlist } from './flatten.ts'
import type { InputValue } from './steps.ts'

interface Mirrored {
  readonly simId: ComponentId
  readonly type: string
  readonly params: Readonly<Record<string, number>>
}

/** One pin on an electrical node, as a probe reports it. */
export interface NodePin {
  /** The part, by its path: `c3`, or `c7/c3` inside a named circuit. */
  readonly part: string
  readonly type: string
  readonly port: string
  /** True for an output, which puts a value on the node. */
  readonly drives: boolean
  /** What the pin drives, or what it reads: its lowest digit. */
  readonly value: Digit
  /** The same, every digit of it. */
  readonly signal: Signal
}

/** Everything a probe held against a wire can tell. */
export interface NodeReading {
  /** The simulator's net, or undefined for a pin wired to nothing. */
  readonly net: NetId | undefined
  readonly value: Digit
  /** Every digit the node carries. More than one on a bus. */
  readonly signal: Signal
  readonly conflict: boolean
  /** True when pins of different widths are wired together here. */
  readonly mixed: boolean
  readonly pins: readonly NodePin[]
  /** The pin the reading was taken at, one of `pins`. */
  readonly here: NodePin | undefined
}

/** One pin of a part and what it carries. */
export interface PinReading {
  readonly port: string
  readonly direction: 'in' | 'out'
  readonly signal: Signal
}

/** What a part shows the inspector: its pins and, for a memory part, what it keeps. */
export interface PartReading {
  readonly pins: readonly PinReading[]
  /** The value a latch, flip-flop, register or counter keeps; undefined for other parts. */
  readonly stored: Signal | undefined
  /** Every word a RAM holds; undefined for other parts. */
  readonly memory?: readonly Signal[]
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
  /** The path of each simulator component, worked out when first asked. */
  private paths: Map<ComponentId, string> | undefined
  private last: { readonly doc: CircuitDoc; readonly library: Library } | undefined
  /** The pins that sit on a node with pins of another width. */
  private mixed = new Set<string>()

  constructor(sim: Simulator = new Simulator()) {
    this.sim = sim
  }

  /** The simulator component standing in for a part, by its path. */
  simComponent(key: string): ComponentId | undefined {
    return this.mirrored.get(key)?.simId
  }

  /**
   * Steps a switch to its next value, or its previous one for a negative
   * `step`, going round the radix. A switch on a bus counts as one number.
   * Returns false if the part is no switch.
   */
  cycleInput(docId: string, step: number): boolean {
    const entry = this.mirrored.get(docId)
    if (!entry || entry.type !== 'input') return false
    const radix = this.sim.radix
    const state = this.sim.getState(entry.simId) as readonly number[]
    const known = state.map((digit) => (digit >= 0 && digit < radix ? digit : 0))
    this.sim.setState(entry.simId, stepSignal(known, step, radix))
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
   * Puts a switch on a value: a number, or its digits as text with the most
   * significant first. Returns false if the part is no switch or the value
   * does not fit it at this radix.
   */
  setInput(docId: string, value: InputValue): boolean {
    const entry = this.mirrored.get(docId)
    if (!entry || entry.type !== 'input') return false
    const radix = this.sim.radix
    const state = this.sim.getState(entry.simId) as readonly number[]
    let digits: number[]
    if (typeof value === 'string') {
      try {
        digits = [...parseSignal(value, radix)]
      } catch {
        return false
      }
      if (digits.some((digit) => digit < 0)) return false
    } else {
      if (!Number.isInteger(value) || value < 0) return false
      digits = []
      for (let rest = value; rest > 0 || digits.length === 0; rest = Math.floor(rest / radix)) {
        digits.push(rest % radix)
      }
    }
    while (digits.length > state.length) {
      if (digits.pop() !== 0) return false
    }
    while (digits.length < state.length) digits.push(0)
    this.sim.setState(entry.simId, digits)
    return true
  }

  /** The path of the part a simulator component stands in for. */
  private pathOf(simId: ComponentId): string | undefined {
    if (!this.paths) {
      this.paths = new Map()
      for (const [key, entry] of this.mirrored) this.paths.set(entry.simId, key)
    }
    return this.paths.get(simId)
  }

  /**
   * The parts of the drawing that were evaluated at the current tick. A part
   * that stands for a named circuit counts when anything inside it was.
   */
  evaluatedParts(): Set<string> {
    return this.topParts(this.sim.evaluated)
  }

  /** The parts of the drawing that hold these simulator components. */
  private topParts(simIds: Iterable<ComponentId>): Set<string> {
    const parts = new Set<string>()
    for (const simId of simIds) {
      const path = this.pathOf(simId)
      if (path !== undefined) parts.add(path.split('/')[0])
    }
    return parts
  }

  /** The simulator pin at a terminal of the drawing, by `terminalKey`. */
  private refAt(key: string): PinRef | undefined {
    const pin = this.netlist?.probes.get(key)
    const simId = pin && this.simComponent(pin.part)
    return pin && simId !== undefined ? { component: simId, port: pin.port } : undefined
  }

  /** The number of gates and the longest path of the flattened circuit. */
  cost(): CircuitCost {
    return circuitCost(this.sim)
  }

  /**
   * The parts of the drawing on the longest path, and the simulator nets
   * between them. A part that stands for a named circuit is on it when any
   * gate inside it is.
   */
  criticalPath(): { parts: Set<string>; nets: Set<NetId> } {
    const path = criticalPath(this.sim)
    return { parts: this.topParts(path.gates), nets: new Set(path.nets) }
  }

  /** The simulator net at a terminal of the drawing, by `terminalKey`. */
  netAt(key: string): NetId | undefined {
    const ref = this.refAt(key)
    return ref && this.sim.netOf(ref)
  }

  /**
   * What each pin of a part carries, and what a memory part keeps. Undefined
   * for a part the simulator does not hold as one piece, such as a named circuit.
   */
  partReading(docId: string): PartReading | undefined {
    const component = this.simComponent(docId)
    if (component === undefined) return undefined
    const info = this.sim.getComponent(component)
    const pins = info.ports.map(
      (port): PinReading => ({
        port: port.name,
        direction: port.direction,
        signal: this.sim.readPin({ component, port: port.name }),
      }),
    )
    const memory = this.sim.getMemory(component)
    return { pins, stored: this.sim.getStored(component), ...(memory ? { memory } : {}) }
  }

  /**
   * What sits on the node at a terminal of the drawing, by `terminalKey`:
   * its value and every pin on it. Undefined when no part is on that node.
   */
  describeTerminal(key: string): NodeReading | undefined {
    const ref = this.refAt(key)
    if (ref === undefined) return undefined
    const sim = this.sim
    const net = sim.netOf(ref)
    const refs = net === undefined ? [ref] : sim.getNet(net).pins
    const pins: NodePin[] = []
    let here: NodePin | undefined
    for (const other of refs) {
      const info = sim.getComponent(other.component)
      const spec = info.ports.find((port) => port.name === other.port)
      const part = this.pathOf(other.component)
      if (!spec || part === undefined) continue
      const signal = sim.readPin(other)
      const pin: NodePin = {
        part,
        type: info.type,
        port: other.port,
        drives: spec.direction === 'out',
        value: signal[0] ?? Z,
        signal,
      }
      pins.push(pin)
      if (other.component === ref.component && other.port === ref.port) here = pin
    }
    const probe = sim.probe(ref)
    return {
      net,
      value: probe.value[0] ?? Z,
      signal: probe.value,
      conflict: probe.conflict,
      mixed: this.mixed.has(pinKey(ref)),
      pins,
      here,
    }
  }

  /** The output pin of every running clock, the ones inside named circuits too. */
  clockPins(): PinRef[] {
    const pins: PinRef[] = []
    for (const entry of this.mirrored.values()) {
      if (entry.type === 'clock' && entry.params.on !== 0) {
        pins.push({ component: entry.simId, port: 'out' })
      }
    }
    return pins
  }

  /**
   * The value of every switch of the drawing itself, by part id: a digit,
   * or for a switch on a bus its digits as text.
   */
  inputValues(): Record<string, InputValue> {
    const values: Record<string, InputValue> = {}
    const radix = this.sim.radix
    for (const [key, entry] of this.mirrored) {
      if (entry.type !== 'input' || key.includes('/')) continue
      const digits = (this.sim.getState(entry.simId) as readonly number[]).map((digit) =>
        digit >= 0 && digit < radix ? digit : 0,
      )
      values[key] = digits.length === 1 ? digits[0] : formatSignal(digits)
    }
    return values
  }

  /**
   * Whether the node at a terminal of the drawing, by `terminalKey`, has
   * pins of different widths on it. Such pins cannot share a wire, so each
   * width is left to itself.
   */
  mixedAt(key: string): boolean {
    const ref = this.refAt(key)
    return ref !== undefined && this.mixed.has(pinKey(ref))
  }

  /**
   * What the wires at a terminal of the drawing carry, by `terminalKey`.
   * Undefined when no part drives or reads that node at all.
   */
  probeTerminal(key: string): Probe | undefined {
    const ref = this.refAt(key)
    return ref && this.sim.probe(ref)
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
    this.paths = undefined
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
    const mixed = new Set<string>()
    for (const group of netlist.groups) {
      // A net has one width. Pins of another width wired to it get a net of
      // their own, and the drawing shows the wire as faulty.
      const byWidth = new Map<number, PinRef[]>()
      for (const pin of group) {
        const simId = this.simComponent(pin.part)
        if (simId === undefined) continue
        const width =
          sim.getComponent(simId).ports.find((port) => port.name === pin.port)?.width ?? 1
        const ref: PinRef = { component: simId, port: pin.port }
        const same = byWidth.get(width)
        if (same) same.push(ref)
        else byWidth.set(width, [ref])
      }
      for (const pins of byWidth.values()) {
        if (byWidth.size > 1) for (const pin of pins) mixed.add(pinKey(pin))
        if (pins.length >= 2) groups.push(pins)
      }
    }
    this.mixed = mixed
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
