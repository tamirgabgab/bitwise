import type { ComponentDef, ParamSpec, PortSpec } from '../component.ts'
import { MAX_RADIX, MAX_WIDTH, X, filled } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { numberValue } from './output.ts'

/*
 * Parts that choose. A select input is read as a number in the radix, so
 * one select digit chooses among as many ways as the radix has values: two
 * at radix 2, three at radix 3. A part can also have fewer ways than its
 * select input can name; a number with no way behind it is not an error,
 * it just chooses nothing.
 */

/** The most ways one of these parts can have. */
export const MAX_WAYS = MAX_RADIX

const waysParam: ParamSpec = { default: 2, min: 2, max: MAX_WAYS }
/** How many digits the select input has. */
const selectParam: ParamSpec = { default: 1, min: 1, max: 4 }
const widthParam: ParamSpec = { default: 1, min: 1, max: MAX_WIDTH }

function numbered(name: string, count: number, direction: PortSpec['direction'], width: number): PortSpec[] {
  return Array.from({ length: count }, (_, index) => ({ name: `${name}${index}`, direction, width }))
}

/** What passes through: a floating digit reads as unknown, as in a gate. */
function passed(signal: Signal): Signal {
  return signal.map((digit) => (digit < 0 ? X : digit))
}

/**
 * A multiplexer: the output follows the data input that `sel` names. With
 * `sel` unknown the output is unknown, unless every input agrees anyway.
 * A number with no input behind it gives X.
 */
export const multiplexer: ComponentDef = {
  type: 'mux',
  params: { inputs: waysParam, select: selectParam, width: widthParam },
  ports({ inputs, select, width }) {
    return [
      ...numbered('in', inputs, 'in', width),
      { name: 'sel', direction: 'in', width: select },
      { name: 'out', direction: 'out', width },
    ]
  },
  evaluate(inputs, params, _state, { radix }) {
    const chosen = numberValue(inputs.sel, radix)
    if (chosen !== undefined) {
      return { outputs: { out: chosen < params.inputs ? passed(inputs[`in${chosen}`]) : filled(params.width, X) } }
    }
    // Position by position: where all the inputs carry the same, so does the output.
    const out = passed(inputs.in0).map((digit, position) => {
      for (let index = 1; index < params.inputs; index++) {
        if (inputs[`in${index}`][position] !== digit) return X
      }
      return digit
    })
    return { outputs: { out } }
  },
}

/**
 * A demultiplexer: the data input comes out on the output that `sel` names
 * and every other output gives 0. With `sel` unknown all of them are X.
 */
export const demultiplexer: ComponentDef = {
  type: 'demux',
  params: { outputs: waysParam, select: selectParam, width: widthParam },
  ports({ outputs, select, width }) {
    return [
      { name: 'in', direction: 'in', width },
      { name: 'sel', direction: 'in', width: select },
      ...numbered('out', outputs, 'out', width),
    ]
  },
  evaluate(inputs, params, _state, { radix }) {
    const chosen = numberValue(inputs.sel, radix)
    const outputs: Record<string, Signal> = {}
    for (let index = 0; index < params.outputs; index++) {
      outputs[`out${index}`] =
        chosen === undefined
          ? filled(params.width, X)
          : index === chosen
            ? passed(inputs.in)
            : filled(params.width, 0)
    }
    return { outputs }
  },
}

/**
 * A decoder: the output that `sel` names gives the top value and every
 * other output gives 0. With `sel` unknown all of them are X.
 */
export const decoder: ComponentDef = {
  type: 'decoder',
  params: { outputs: waysParam, select: selectParam },
  ports({ outputs, select }) {
    return [{ name: 'sel', direction: 'in', width: select }, ...numbered('out', outputs, 'out', 1)]
  },
  evaluate(inputs, params, _state, { radix }) {
    const chosen = numberValue(inputs.sel, radix)
    const outputs: Record<string, Signal> = {}
    for (let index = 0; index < params.outputs; index++) {
      outputs[`out${index}`] = [chosen === undefined ? X : index === chosen ? radix - 1 : 0]
    }
    return { outputs }
  },
}
