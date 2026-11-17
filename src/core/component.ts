import { MAX_WIDTH } from './signal.ts'
import type { Signal } from './signal.ts'

export type PortDirection = 'in' | 'out'

export interface PortSpec {
  readonly name: string
  readonly direction: PortDirection
  /** Number of digits. 1 for a plain wire. */
  readonly width: number
}

/** An integer setting of a component, such as its number of inputs. */
export interface ParamSpec {
  readonly default: number
  readonly min: number
  readonly max: number
}

export type Params = Readonly<Record<string, number>>

/** Signals keyed by port name. */
export type PortValues = Readonly<Record<string, Signal>>

/** What a component may know about the circuit it sits in. */
export interface EvalEnv {
  /** How many values a wire can carry: digits run from 0 to radix - 1. */
  readonly radix: number
  /**
   * True when this evaluation is the one the component asked for with
   * `wake`, and false when an input changed or the circuit was edited.
   */
  readonly woke: boolean
}

export interface EvalResult<S> {
  /** A value for every output port, each as wide as its port. */
  readonly outputs: PortValues
  /** New internal state. Leave it out to keep the current state. */
  readonly state?: S
  /**
   * Asks to be evaluated again after this many ticks (at least 1) even if no
   * input changes. This is how a clock keeps itself going. A component has
   * one such request at a time: while one is waiting, another is ignored.
   */
  readonly wake?: number
}

/**
 * The definition of a component type. It is data plus one pure function, so
 * adding a component never touches the engine.
 *
 * `S` is the type of the component's internal state (a flip-flop's stored
 * digit, a switch's position). Stateless components leave it out.
 */
export interface ComponentDef<S = unknown> {
  readonly type: string
  readonly params: Readonly<Record<string, ParamSpec>>
  ports(params: Params): readonly PortSpec[]
  initialState?(params: Params): S
  /**
   * Computes the outputs from the current inputs. Must be pure: the engine
   * decides when it runs and when the outputs take effect.
   */
  evaluate(inputs: PortValues, params: Params, state: S, env: EvalEnv): EvalResult<S>
}

/** Fills in defaults and rejects unknown, fractional or out-of-range values. */
export function resolveParams(
  def: ComponentDef,
  given: Readonly<Record<string, number>> = {},
): Params {
  for (const name of Object.keys(given)) {
    if (!(name in def.params)) {
      throw new Error(`Component "${def.type}" has no parameter "${name}"`)
    }
  }
  const params: Record<string, number> = {}
  for (const [name, spec] of Object.entries(def.params)) {
    const value = given[name] ?? spec.default
    if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
      throw new Error(
        `Parameter "${name}" of "${def.type}" must be an integer from ` +
          `${spec.min} to ${spec.max}, got ${value}`,
      )
    }
    params[name] = value
  }
  return params
}

/** Checks the port list a definition produced before the engine relies on it. */
export function validatePorts(def: ComponentDef, ports: readonly PortSpec[]): void {
  const names = new Set<string>()
  for (const port of ports) {
    if (names.has(port.name)) {
      throw new Error(`Component "${def.type}" declares port "${port.name}" twice`)
    }
    names.add(port.name)
    if (!Number.isInteger(port.width) || port.width < 1 || port.width > MAX_WIDTH) {
      throw new Error(
        `Port "${port.name}" of "${def.type}" has invalid width ${port.width}`,
      )
    }
  }
}

/** The set of component types a simulator can instantiate. */
export class ComponentRegistry {
  private readonly defs = new Map<string, ComponentDef>()

  register<S>(def: ComponentDef<S>): this {
    if (this.defs.has(def.type)) {
      throw new Error(`Component type "${def.type}" is already registered`)
    }
    this.defs.set(def.type, def as ComponentDef)
    return this
  }

  get(type: string): ComponentDef {
    const def = this.defs.get(type)
    if (!def) throw new Error(`Unknown component type "${type}"`)
    return def
  }

  has(type: string): boolean {
    return this.defs.has(type)
  }

  types(): string[] {
    return [...this.defs.keys()]
  }
}
