import { Z, builtinComponents, filled, formatSignal } from '../core/index.ts'
import type { Signal } from '../core/index.ts'
import { SUB_TYPE, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'
import { flatten } from './flatten.ts'
import type { Library } from './flatten.ts'
import { SimBridge } from './simBridge.ts'

/*
 * The truth table of one part: its outputs for every value its inputs can
 * take, at the radix of the project. A built-in part answers straight from
 * its definition; a named circuit is run once for every row.
 *
 * Only a part whose outputs follow from its inputs alone has one. A part
 * that keeps a value, or a circuit with such a part inside, gets a reason
 * instead, and so does a table too long to read.
 */

/** The most rows a truth table may have. */
export const MAX_TRUTH_ROWS = 256

export interface TruthColumn {
  /** The port of a built-in part, or the id of the switch or output inside a circuit. */
  readonly port: string
  /** What the column is called: the port's name, or the label of the pin. */
  readonly name: string
  readonly width: number
}

export interface TruthRow {
  readonly inputs: readonly Signal[]
  readonly outputs: readonly Signal[]
}

export type TruthTable =
  | {
      readonly kind: 'table'
      readonly inputs: readonly TruthColumn[]
      readonly outputs: readonly TruthColumn[]
      /** The first input changes slowest, as truth tables are written. */
      readonly rows: readonly TruthRow[]
    }
  | { readonly kind: 'none'; readonly reason: string }

/** The drawings of the project, by circuit id, as the store keeps them. */
export type Circuits = Library

/** The values of the inputs in row `row`: the first column is the most significant. */
export function rowInputs(columns: readonly TruthColumn[], row: number, radix: number): Signal[] {
  const values: Signal[] = []
  let rest = row
  for (let index = columns.length - 1; index >= 0; index--) {
    const digits: number[] = []
    for (let digit = 0; digit < columns[index].width; digit++) {
      digits.push(rest % radix)
      rest = Math.floor(rest / radix)
    }
    values[index] = digits
  }
  return values
}

/**
 * The row the inputs are on, or undefined when one of them is X, Z or a
 * value the radix has no room for.
 */
export function rowOf(values: readonly Signal[], radix: number): number | undefined {
  let row = 0
  for (const signal of values) {
    for (let digit = signal.length - 1; digit >= 0; digit--) {
      const value = signal[digit]
      if (!(value >= 0 && value < radix)) return undefined
      row = row * radix + value
    }
  }
  return row
}

function tooLong(columns: readonly TruthColumn[], radix: number): TruthTable | undefined {
  const digits = columns.reduce((sum, column) => sum + column.width, 0)
  if (radix ** digits <= MAX_TRUTH_ROWS) return undefined
  const what = digits === 1 ? '1 input digit' : `${digits} input digits`
  return {
    kind: 'none',
    reason: `With ${what} at radix ${radix} the table has ${radix ** digits} rows, more than ${MAX_TRUTH_ROWS}.`,
  }
}

const KEEPS_VALUE = 'It keeps a value, so its outputs depend on more than its inputs.'

function builtinTable(part: DocComponent, radix: number): TruthTable | undefined {
  const def = builtinComponents.get(part.type)
  const ports = def.ports(part.params)
  const ins = ports.filter((port) => port.direction === 'in')
  const outs = ports.filter((port) => port.direction === 'out')
  if (ins.length === 0 || outs.length === 0) return undefined
  if (def.initialState) return { kind: 'none', reason: KEEPS_VALUE }

  const inputs = ins.map((port) => ({ port: port.name, name: port.name, width: port.width }))
  const outputs = outs.map((port) => ({ port: port.name, name: port.name, width: port.width }))
  const refused = tooLong(inputs, radix)
  if (refused) return refused

  const env = { radix, woke: false }
  const rows: TruthRow[] = []
  for (let row = 0; row < radix ** inputs.reduce((sum, column) => sum + column.width, 0); row++) {
    const values = rowInputs(inputs, row, radix)
    const given: Record<string, Signal> = {}
    inputs.forEach((column, index) => {
      given[column.port] = values[index]
    })
    const answer = def.evaluate(given, part.params, undefined, env).outputs
    rows.push({ inputs: values, outputs: outputs.map((column) => answer[column.port]) })
  }
  return { kind: 'table', inputs, outputs, rows }
}

/** True when a part of a flattened circuit keeps a value of its own. */
function keepsValue(type: string): boolean {
  // A switch keeps its position, but inside a circuit it is the way in.
  return type !== 'input' && builtinComponents.get(type).initialState !== undefined
}

function circuitTable(part: DocComponent, circuits: Circuits, radix: number): TruthTable | undefined {
  const sub = part.sub
  const circuit = sub && circuits[sub.circuit]
  if (!sub || !circuit) return undefined
  if (sub.inputs.length === 0 || sub.outputs.length === 0) return undefined
  const doc: CircuitDoc = circuit.doc
  const widthOf = (id: string): number => doc.components[id]?.params.width ?? 1
  const inputs = sub.inputs.map((pin) => ({ port: pin.port, name: pin.label, width: widthOf(pin.port) }))
  const outputs = sub.outputs.map((pin) => ({ port: pin.port, name: pin.label, width: widthOf(pin.port) }))

  const netlist = flatten(doc, circuits)
  for (const flat of netlist.parts.values()) {
    if (keepsValue(flat.type)) {
      return { kind: 'none', reason: 'A part inside keeps a value, so its outputs depend on more than its inputs.' }
    }
  }
  const refused = tooLong(inputs, radix)
  if (refused) return refused

  const bridge = new SimBridge()
  bridge.sim.setRadix(radix)
  bridge.sync(doc, circuits)
  const rows: TruthRow[] = []
  const total = radix ** inputs.reduce((sum, column) => sum + column.width, 0)
  for (let row = 0; row < total; row++) {
    const values = rowInputs(inputs, row, radix)
    inputs.forEach((column, index) => {
      const value = values[index]
      bridge.setInput(column.port, column.width === 1 ? value[0] : formatSignal(value))
    })
    if (!bridge.sim.settle()) {
      return { kind: 'none', reason: 'It does not settle: some of its wires keep changing.' }
    }
    rows.push({
      inputs: values,
      outputs: outputs.map((column) => {
        const probe = bridge.probeTerminal(terminalKey({ kind: 'pin', component: column.port, port: 'in' }))
        return probe?.value ?? filled(column.width, Z)
      }),
    })
  }
  return { kind: 'table', inputs, outputs, rows }
}

/** Tables already worked out, by the object they were worked out from. */
const builtinCache = new WeakMap<object, Map<string, TruthTable | undefined>>()
const circuitCache = new WeakMap<object, Map<string, TruthTable | undefined>>()

function cached(
  cache: WeakMap<object, Map<string, TruthTable | undefined>>,
  owner: object,
  key: string,
  work: () => TruthTable | undefined,
): TruthTable | undefined {
  let tables = cache.get(owner)
  if (!tables) {
    tables = new Map()
    cache.set(owner, tables)
  }
  if (!tables.has(key)) tables.set(key, work())
  return tables.get(key)
}

/**
 * The truth table of `part` at `radix`, or undefined for a part that has
 * none to show: one without inputs or outputs, a table gate (its table is
 * its settings) or writing on the canvas. `circuits` holds the drawings a
 * named-circuit part can stand for.
 */
export function truthTable(part: DocComponent, circuits: Circuits, radix: number): TruthTable | undefined {
  if (part.type === SUB_TYPE) {
    // The project's drawings are a new object after every edit of any of them.
    return cached(circuitCache, circuits, `${part.sub?.circuit}:${radix}`, () =>
      circuitTable(part, circuits, radix),
    )
  }
  if (part.type === 'table' || !builtinComponents.has(part.type)) return undefined
  return cached(builtinCache, part.params, `${part.type}:${radix}`, () => builtinTable(part, radix))
}
