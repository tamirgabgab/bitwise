import { resolveParams, validatePorts } from './component.ts'
import type {
  ComponentDef,
  ComponentRegistry,
  EvalEnv,
  Params,
  PortSpec,
} from './component.ts'
import { builtinComponents } from './components/index.ts'
import { EventQueue } from './eventQueue.ts'
import { MAX_WIDTH, X, Z, checkRadix, filled, resolve, signalsEqual } from './signal.ts'
import type { Signal } from './signal.ts'

export type ComponentId = number
export type NetId = number

/** One port of one component. */
export interface PinRef {
  readonly component: ComponentId
  readonly port: string
}

export interface AddComponentOptions {
  readonly params?: Readonly<Record<string, number>>
  /** Ticks from an input change to the output change. Default 1. */
  readonly delay?: number
}

export interface ComponentInfo {
  readonly id: ComponentId
  readonly type: string
  readonly params: Params
  readonly delay: number
  readonly ports: readonly PortSpec[]
  readonly state: unknown
}

export interface NetInfo {
  readonly id: NetId
  readonly width: number
  readonly value: Signal
  /** True when two outputs drive a digit of this net to different values. */
  readonly conflict: boolean
  readonly pins: readonly PinRef[]
}

/** What a probe held against a pin reads. */
export interface Probe {
  readonly value: Signal
  readonly conflict: boolean
}

interface Port {
  readonly spec: PortSpec
  net: NetId | undefined
  /** Outputs only: the value this port currently puts on its net. */
  driven: Signal
  /** Outputs only: the value of the most recently scheduled change. */
  scheduled: Signal
  /** Outputs only: `seq` of the last event applied to this port. */
  appliedSeq: number
}

interface Instance {
  readonly id: ComponentId
  readonly def: ComponentDef
  readonly params: Params
  delay: number
  state: unknown
  readonly ports: Map<string, Port>
}

interface Net {
  readonly id: NetId
  readonly width: number
  readonly pins: Map<string, PinRef>
  value: Signal
  conflict: boolean
}

function pinKey(pin: PinRef): string {
  return `${pin.component}:${pin.port}`
}

function checkDelay(delay: number): void {
  // A delay of 0 would let a feedback loop spin forever inside one tick.
  if (!Number.isInteger(delay) || delay < 1) {
    throw new Error(`Delay must be an integer of at least 1, got ${delay}`)
  }
}

/**
 * An event-driven logic simulator.
 *
 * The circuit is a set of components whose pins are attached to nets. A net
 * is one electrical node: every pin on it sees the same value. The circuit
 * can be edited at any time, also while it runs.
 *
 * Every wire carries digits from 0 to radix - 1 (a radix of 2 is ordinary
 * binary logic), or X or Z. The radix belongs to the whole circuit.
 *
 * Time is counted in integer ticks. When an input of a component changes,
 * the component is evaluated at once and its new outputs take effect `delay`
 * ticks later. Because every delay is at least 1, each tick is a bounded
 * amount of work, so an oscillating circuit can never hang the simulator.
 */
export class Simulator {
  private readonly registry: ComponentRegistry
  private readonly instances = new Map<ComponentId, Instance>()
  private readonly nets = new Map<NetId, Net>()
  private readonly queue = new EventQueue()
  private now = 0
  private seq = 0
  private nextComponentId = 1
  private nextNetId = 1
  private batchDepth = 0
  private readonly batchedNets = new Set<NetId>()
  private readonly batchedInstances = new Set<Instance>()
  private env: EvalEnv

  constructor(registry: ComponentRegistry = builtinComponents, radix = 2) {
    checkRadix(radix)
    this.registry = registry
    this.env = { radix }
  }

  /** How many values a wire can carry. */
  get radix(): number {
    return this.env.radix
  }

  /**
   * Changes the radix. Values of the old radix mean nothing in the new one,
   * so the circuit starts over, as `restart` does.
   */
  setRadix(radix: number): void {
    checkRadix(radix)
    if (radix === this.env.radix) return
    this.env = { radix }
    this.restart()
  }

  /**
   * Starts the circuit over, like switching the power off and on: time goes
   * back to 0, every component returns to its initial state, and every
   * output is unknown until it is evaluated again.
   */
  restart(): void {
    this.queue.clear()
    this.now = 0
    for (const instance of this.instances.values()) {
      instance.state = instance.def.initialState?.(instance.params)
      for (const port of instance.ports.values()) {
        const unknown = filled(port.spec.width, X)
        port.driven = unknown
        port.scheduled = unknown
        port.appliedSeq = 0
      }
    }
    this.seq = 0
    this.propagate(this.nets.keys(), this.instances.values())
  }

  /** How many nets have two outputs fighting over them right now. */
  get conflicts(): number {
    let count = 0
    for (const net of this.nets.values()) {
      if (net.conflict) count++
    }
    return count
  }

  /** The current time, in ticks. */
  get time(): number {
    return this.now
  }

  /** Number of output changes still waiting to happen. 0 means stable. */
  get pendingEvents(): number {
    return this.queue.size
  }

  // ---- Components ----

  addComponent(type: string, options: AddComponentOptions = {}): ComponentId {
    const def = this.registry.get(type)
    const params = resolveParams(def, options.params)
    const delay = options.delay ?? 1
    checkDelay(delay)
    const specs = def.ports(params)
    validatePorts(def, specs)

    const ports = new Map<string, Port>()
    for (const spec of specs) {
      // Until the first evaluation takes effect, an output is unknown.
      const initial = filled(spec.width, X)
      ports.set(spec.name, {
        spec,
        net: undefined,
        driven: initial,
        scheduled: initial,
        appliedSeq: 0,
      })
    }
    const instance: Instance = {
      id: this.nextComponentId++,
      def,
      params,
      delay,
      state: def.initialState?.(params),
      ports,
    }
    this.instances.set(instance.id, instance)
    this.propagate([], [instance])
    return instance.id
  }

  /**
   * Applies several edits as one. Nets are recomputed and components are
   * evaluated once, after the last edit, so no component ever sees a
   * half-finished circuit (a pin that is detached only to be attached to
   * another net a moment later never reads as floating).
   */
  batch(edit: () => void): void {
    this.batchDepth++
    try {
      edit()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        const nets = [...this.batchedNets]
        const instances = [...this.batchedInstances]
        this.batchedNets.clear()
        this.batchedInstances.clear()
        this.propagate(nets, instances)
      }
    }
  }

  removeComponent(id: ComponentId): void {
    const instance = this.instance(id)
    const touched: NetId[] = []
    for (const port of instance.ports.values()) {
      if (port.net === undefined) continue
      this.net(port.net).pins.delete(pinKey({ component: id, port: port.spec.name }))
      touched.push(port.net)
    }
    // Events still queued for this component are dropped when they come up.
    this.instances.delete(id)
    this.propagate(touched)
  }

  setDelay(id: ComponentId, delay: number): void {
    checkDelay(delay)
    this.instance(id).delay = delay
  }

  /**
   * Replaces a component's internal state from outside the circuit, for
   * example to flip an input source, and lets the change propagate.
   */
  setState(id: ComponentId, state: unknown): void {
    const instance = this.instance(id)
    const previous = instance.state
    instance.state = state
    try {
      this.evaluate(instance)
    } catch (error) {
      instance.state = previous
      throw error
    }
  }

  /** A component's internal state, as `setState` or its own evaluation left it. */
  getState(id: ComponentId): unknown {
    return this.instance(id).state
  }

  getComponent(id: ComponentId): ComponentInfo {
    const instance = this.instance(id)
    return {
      id,
      type: instance.def.type,
      params: instance.params,
      delay: instance.delay,
      ports: [...instance.ports.values()].map((port) => port.spec),
      state: instance.state,
    }
  }

  componentIds(): ComponentId[] {
    return [...this.instances.keys()]
  }

  // ---- Nets ----

  addNet(width = 1): NetId {
    if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH) {
      throw new Error(`Net width must be an integer from 1 to ${MAX_WIDTH}, got ${width}`)
    }
    const net: Net = {
      id: this.nextNetId++,
      width,
      pins: new Map(),
      value: filled(width, Z),
      conflict: false,
    }
    this.nets.set(net.id, net)
    return net.id
  }

  /** Removes a net. Every pin that was on it is left unattached. */
  removeNet(id: NetId): void {
    const net = this.net(id)
    const readers: Instance[] = []
    for (const pin of net.pins.values()) {
      const instance = this.instance(pin.component)
      const port = this.port(instance, pin.port)
      port.net = undefined
      if (port.spec.direction === 'in') readers.push(instance)
    }
    this.nets.delete(id)
    this.propagate([], readers)
  }

  /** Attaches an unattached pin to a net of the same width. */
  attach(pin: PinRef, netId: NetId): void {
    const instance = this.instance(pin.component)
    const port = this.port(instance, pin.port)
    const net = this.net(netId)
    if (port.net !== undefined) {
      throw new Error(`Pin ${pinKey(pin)} is already attached to net ${port.net}`)
    }
    if (port.spec.width !== net.width) {
      throw new Error(
        `Pin ${pinKey(pin)} is ${port.spec.width} digits wide but net ${netId} ` +
          `is ${net.width} digits wide`,
      )
    }
    net.pins.set(pinKey(pin), { component: pin.component, port: pin.port })
    port.net = netId
    this.propagate([netId], port.spec.direction === 'in' ? [instance] : [])
  }

  /** Detaches a pin from its net. Does nothing if it is not attached. */
  detach(pin: PinRef): void {
    const instance = this.instance(pin.component)
    const port = this.port(instance, pin.port)
    if (port.net === undefined) return
    const netId = port.net
    this.net(netId).pins.delete(pinKey(pin))
    port.net = undefined
    this.propagate([netId], port.spec.direction === 'in' ? [instance] : [])
  }

  /**
   * Makes two pins share a net and returns that net. Creates a net when
   * neither pin has one, and merges the two nets when both do.
   */
  connect(a: PinRef, b: PinRef): NetId {
    const portA = this.port(this.instance(a.component), a.port)
    const portB = this.port(this.instance(b.component), b.port)
    if (portA.spec.width !== portB.spec.width) {
      throw new Error(
        `Cannot connect ${pinKey(a)} (${portA.spec.width} digits) to ` +
          `${pinKey(b)} (${portB.spec.width} digits)`,
      )
    }
    if (portA.net === undefined && portB.net === undefined) {
      const netId = this.addNet(portA.spec.width)
      this.attach(a, netId)
      this.attach(b, netId)
      return netId
    }
    if (portA.net === undefined) {
      this.attach(a, portB.net as NetId)
      return portB.net as NetId
    }
    if (portB.net === undefined) {
      this.attach(b, portA.net)
      return portA.net
    }
    if (portA.net !== portB.net) this.mergeNets(portA.net, portB.net)
    return portA.net
  }

  netOf(pin: PinRef): NetId | undefined {
    return this.port(this.instance(pin.component), pin.port).net
  }

  getNet(id: NetId): NetInfo {
    const net = this.net(id)
    return {
      id,
      width: net.width,
      value: net.value,
      conflict: net.conflict,
      pins: [...net.pins.values()],
    }
  }

  netIds(): NetId[] {
    return [...this.nets.keys()]
  }

  /**
   * The value at a pin: what an output drives, or what an input sees. An
   * input that is not attached to anything floats (Z).
   */
  readPin(pin: PinRef): Signal {
    const port = this.port(this.instance(pin.component), pin.port)
    if (port.spec.direction === 'out') return port.driven
    return this.inputValue(port)
  }

  /**
   * What a probe on the wire at this pin reads: the value of the pin's net,
   * with all its drivers resolved. A pin on no net reads what it drives, or
   * floats (Z) if it is an input.
   */
  probe(pin: PinRef): Probe {
    const port = this.port(this.instance(pin.component), pin.port)
    if (port.net !== undefined) {
      const net = this.net(port.net)
      return { value: net.value, conflict: net.conflict }
    }
    const value = port.spec.direction === 'out' ? port.driven : filled(port.spec.width, Z)
    return { value, conflict: false }
  }

  // ---- Time ----

  /** Advances time by one tick. */
  step(): void {
    this.run(1)
  }

  /** Advances time by `ticks` ticks, applying every change that falls due. */
  run(ticks: number): void {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`Ticks must be a non-negative integer, got ${ticks}`)
    }
    const target = this.now + ticks
    for (;;) {
      const next = this.queue.peek()
      if (next === undefined || next.time > target) break
      this.now = next.time
      this.processCurrentTick()
    }
    this.now = target
  }

  /**
   * Runs until nothing is left to change, for at most `maxTicks` ticks.
   * Returns true if the circuit became stable and false if it is still
   * changing, which means it oscillates or needs more time.
   */
  settle(maxTicks = 1000): boolean {
    if (!Number.isInteger(maxTicks) || maxTicks < 0) {
      throw new Error(`maxTicks must be a non-negative integer, got ${maxTicks}`)
    }
    const limit = this.now + maxTicks
    for (;;) {
      const next = this.queue.peek()
      if (next === undefined) return true
      if (next.time > limit) {
        this.now = limit
        return false
      }
      this.now = next.time
      this.processCurrentTick()
    }
  }

  // ---- Internals ----

  private instance(id: ComponentId): Instance {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Unknown component ${id}`)
    return instance
  }

  private net(id: NetId): Net {
    const net = this.nets.get(id)
    if (!net) throw new Error(`Unknown net ${id}`)
    return net
  }

  private port(instance: Instance, name: string): Port {
    const port = instance.ports.get(name)
    if (!port) {
      throw new Error(`Component ${instance.id} (${instance.def.type}) has no port "${name}"`)
    }
    return port
  }

  private inputValue(port: Port): Signal {
    if (port.net === undefined) return filled(port.spec.width, Z)
    return this.net(port.net).value
  }

  /** Moves every pin of net `from` onto net `into` and deletes `from`. */
  private mergeNets(into: NetId, from: NetId): void {
    const target = this.net(into)
    const source = this.net(from)
    const readers: Instance[] = []
    for (const [key, pin] of source.pins) {
      const instance = this.instance(pin.component)
      const port = this.port(instance, pin.port)
      port.net = into
      target.pins.set(key, pin)
      // These inputs saw the old net's value, so they must look again even
      // if the merged net keeps the value the target had before.
      if (port.spec.direction === 'in') readers.push(instance)
    }
    this.nets.delete(from)
    this.propagate([into], readers)
  }

  /** Applies every event due at the current time, then lets it spread. */
  private processCurrentTick(): void {
    const touched = new Set<NetId>()
    for (;;) {
      const next = this.queue.peek()
      if (next === undefined || next.time !== this.now) break
      this.queue.pop()
      const instance = this.instances.get(next.component)
      if (!instance) continue
      const port = instance.ports.get(next.port)
      // An event scheduled before one that already took effect is stale.
      // This happens when a delay is shortened while a change is in flight.
      if (!port || next.seq < port.appliedSeq) continue
      port.appliedSeq = next.seq
      if (signalsEqual(port.driven, next.value)) continue
      port.driven = next.value
      if (port.net !== undefined) touched.add(port.net)
    }
    this.propagate(touched)
  }

  /**
   * Recomputes the given nets, then evaluates each affected component once:
   * every component reading a net whose value changed, plus `also`.
   */
  private propagate(netIds: Iterable<NetId>, also: Iterable<Instance> = []): void {
    if (this.batchDepth > 0) {
      for (const id of netIds) this.batchedNets.add(id)
      for (const instance of also) this.batchedInstances.add(instance)
      return
    }
    const dirty = new Set<Instance>(also)
    for (const id of netIds) {
      const net = this.nets.get(id)
      if (!net || !this.refresh(net)) continue
      for (const pin of net.pins.values()) {
        const instance = this.instance(pin.component)
        if (this.port(instance, pin.port).spec.direction === 'in') dirty.add(instance)
      }
    }
    for (const instance of dirty) {
      // A batch may have removed a component after queueing it.
      if (this.instances.get(instance.id) === instance) this.evaluate(instance)
    }
  }

  /** Recomputes a net from its drivers. Returns true if its value changed. */
  private refresh(net: Net): boolean {
    const drivers: Signal[] = []
    for (const pin of net.pins.values()) {
      const port = this.port(this.instance(pin.component), pin.port)
      if (port.spec.direction === 'out') drivers.push(port.driven)
    }
    const { value, conflict } = resolve(net.width, drivers)
    net.conflict = conflict
    if (signalsEqual(net.value, value)) return false
    net.value = value
    return true
  }

  /**
   * Evaluates a component against its current inputs and schedules every
   * output that differs from the change already on its way.
   */
  private evaluate(instance: Instance): void {
    const inputs: Record<string, Signal> = {}
    for (const port of instance.ports.values()) {
      if (port.spec.direction === 'in') inputs[port.spec.name] = this.inputValue(port)
    }
    const result = instance.def.evaluate(inputs, instance.params, instance.state, this.env)

    // Check everything before changing anything, so a faulty definition
    // cannot leave the component half updated.
    const outputs: [Port, Signal][] = []
    for (const port of instance.ports.values()) {
      if (port.spec.direction !== 'out') continue
      const value = result.outputs[port.spec.name]
      if (value === undefined || value.length !== port.spec.width) {
        throw new Error(
          `Component "${instance.def.type}" returned an invalid value for ` +
            `output "${port.spec.name}"`,
        )
      }
      outputs.push([port, value])
    }

    if (result.state !== undefined) instance.state = result.state
    for (const [port, value] of outputs) {
      if (signalsEqual(port.scheduled, value)) continue
      port.scheduled = value
      this.queue.push({
        time: this.now + instance.delay,
        seq: ++this.seq,
        component: instance.id,
        port: port.spec.name,
        value,
      })
    }
  }
}
