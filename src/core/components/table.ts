import type { ComponentDef, ParamSpec, Params } from '../component.ts'
import { MAX_RADIX, X, isKnown } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * A gate the user defines by filling in its table, at any radix. With one
 * input the table is a row of answers; with two it is a square, rows by the
 * first input and columns by the second.
 *
 * The answers are parameters `c0` to `c255`, laid out for the largest radix:
 * with two inputs the answer to (a, b) is `c(a * 16 + b)`, with one input
 * the answer to a is `c(a)`. So a table keeps its answers when the radix
 * changes, and an answer the radix has no room for reads as X.
 */

/** How many answers a table holds: enough for two inputs at the largest radix. */
export const TABLE_CELLS = MAX_RADIX * MAX_RADIX

/** The parameter that holds the answer to in0 = a and, with two inputs, in1 = b. */
export function tableCell(inputs: number, a: number, b = 0): string {
  return `c${inputs === 1 ? a : a * MAX_RADIX + b}`
}

const cellParam: ParamSpec = { default: X, min: X, max: MAX_RADIX - 1 }

const params: Record<string, ParamSpec> = { inputs: { default: 2, min: 1, max: 2 } }
for (let cell = 0; cell < TABLE_CELLS; cell++) params[`c${cell}`] = cellParam

/** The answer the table gives, or X when an input is unknown or the answer does not fit. */
function answer(params: Params, values: readonly Digit[], radix: number): Digit {
  if (!values.every((value) => isKnown(value) && value < radix)) return X
  const cell = params[tableCell(params.inputs, values[0], values[1])]
  return cell >= 0 && cell < radix ? cell : X
}

export const tableGate: ComponentDef = {
  type: 'table',
  params,
  ports({ inputs }) {
    const ins = Array.from({ length: inputs }, (_, index) => ({
      name: `in${index}`,
      direction: 'in' as const,
      width: 1,
    }))
    return [...ins, { name: 'out', direction: 'out', width: 1 }]
  },
  evaluate(inputs, params, _state, { radix }) {
    const values = params.inputs === 1 ? [inputs.in0[0]] : [inputs.in0[0], inputs.in1[0]]
    return { outputs: { out: [answer(params, values, radix)] } }
  },
}
