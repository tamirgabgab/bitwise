import { resolveParams } from './component.ts'
import type { ComponentDef } from './component.ts'
import type { Digit } from './signal.ts'

/**
 * What a gate answers for every input, at one radix. For a gate with two
 * inputs, `rows[a][b]` is the answer to in0 = a and in1 = b. For a gate with
 * one input there is a single row, `rows[0][a]`.
 */
export interface GateTable {
  readonly inputs: 1 | 2
  readonly rows: readonly (readonly Digit[])[]
}

/**
 * The table of a component as it comes out of the palette, with its default
 * parameters. Undefined for a part that is no simple gate: one with memory,
 * with a bus, with more than two inputs or with more than one output.
 */
export function gateTable(def: ComponentDef, radix: number): GateTable | undefined {
  if (def.initialState) return undefined
  const params = resolveParams(def)
  const ports = def.ports(params)
  const ins = ports.filter((port) => port.direction === 'in')
  const outs = ports.filter((port) => port.direction === 'out')
  if (outs.length !== 1 || ins.length < 1 || ins.length > 2) return undefined
  if (ports.some((port) => port.width !== 1)) return undefined

  const env = { radix, woke: false }
  const answer = (values: readonly Digit[]): Digit => {
    const inputs: Record<string, Digit[]> = {}
    ins.forEach((port, index) => {
      inputs[port.name] = [values[index]]
    })
    return def.evaluate(inputs, params, undefined, env).outputs[outs[0].name][0]
  }
  const digits = Array.from({ length: radix }, (_, digit) => digit)
  if (ins.length === 1) return { inputs: 1, rows: [digits.map((a) => answer([a]))] }
  return { inputs: 2, rows: digits.map((a) => digits.map((b) => answer([a, b]))) }
}
