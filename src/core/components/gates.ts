import type { ComponentDef, ParamSpec, PortSpec } from '../component.ts'
import {
  MAX_RADIX,
  MAX_WIDTH,
  X,
  addDigit,
  isDigit,
  maxDigit,
  minDigit,
  mirrorDigit,
  mulDigit,
  shiftDigit,
} from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Every gate works at any radix. With a radix of 2 each one is the Boolean
 * gate its name says; with more values it is the usual generalization:
 * AND is the smaller input, OR the larger, NOT mirrors the value.
 */

const widthParam: ParamSpec = { default: 1, min: 1, max: MAX_WIDTH }
const inputsParam: ParamSpec = { default: 2, min: 2, max: 8 }

type Combine = (a: Digit, b: Digit, radix: number) => Digit
type Finish = (a: Digit, radix: number) => Digit

/**
 * A gate with 2 to 8 inputs named in0, in1, ... and one output named out.
 * The inputs are combined pairwise, and `finish` is applied to the result.
 * With a width above 1 it works on buses, digit by digit.
 */
function multiInputGate(type: string, combine: Combine, finish?: Finish): ComponentDef {
  return {
    type,
    params: { inputs: inputsParam, width: widthParam },
    ports({ inputs, width }) {
      const ports: PortSpec[] = []
      for (let i = 0; i < inputs; i++) {
        ports.push({ name: `in${i}`, direction: 'in', width })
      }
      ports.push({ name: 'out', direction: 'out', width })
      return ports
    },
    evaluate(inputs, params, _state, { radix }) {
      const out: Digit[] = []
      for (let position = 0; position < params.width; position++) {
        let result = inputs.in0[position]
        for (let i = 1; i < params.inputs; i++) {
          result = combine(result, inputs[`in${i}`][position], radix)
        }
        out.push(finish ? finish(result, radix) : result)
      }
      return { outputs: { out } }
    },
  }
}

/**
 * A gate with one input named in and one output named out. `setting` names
 * an extra parameter whose value is handed to `apply`.
 */
function singleInputGate(
  type: string,
  apply: (a: Digit, radix: number, setting: number) => Digit,
  setting?: { readonly name: string; readonly spec: ParamSpec },
): ComponentDef {
  return {
    type,
    params: setting ? { [setting.name]: setting.spec, width: widthParam } : { width: widthParam },
    ports({ width }) {
      return [
        { name: 'in', direction: 'in', width },
        { name: 'out', direction: 'out', width },
      ]
    },
    evaluate(inputs, params, _state, { radix }) {
      const value = setting ? params[setting.name] : 0
      return { outputs: { out: inputs.in.map((digit) => apply(digit, radix, value)) } }
    },
  }
}

const increment: Finish = (a, radix) => shiftDigit(a, radix)

/** The smaller of its inputs. */
export const andGate = multiInputGate('and', minDigit)
/** The larger of its inputs. */
export const orGate = multiInputGate('or', maxDigit)
/**
 * AND, then plus one modulo the radix. On its own it can build every truth
 * table at any radix, as Boolean NAND does at radix 2.
 */
export const nandGate = multiInputGate('nand', minDigit, increment)
/** OR, then plus one modulo the radix (the Webb function). Also universal. */
export const norGate = multiInputGate('nor', maxDigit, increment)
/**
 * The sum of its inputs modulo the radix. At radix 2 with more than two
 * inputs this is odd parity: 1 when an odd number of inputs are 1.
 */
export const xorGate = multiInputGate('xor', addDigit)
export const xnorGate = multiInputGate('xnor', addDigit, mirrorDigit)
/** The sum of its inputs modulo the radix. */
export const addGate = multiInputGate('add', addDigit)
/** The product of its inputs modulo the radix. */
export const mulGate = multiInputGate('mul', mulDigit)

/** Mirrors the value: x becomes (radix - 1) - x. */
export const notGate = singleInputGate('not', mirrorDigit)
/** Passes a digit through. A floating or unknown input reads as X. */
export const bufferGate = singleInputGate('buffer', (a) => (a < 0 ? X : a))
/** Adds `by` modulo the radix. At radix 2 it is the same gate as NOT. */
export const shiftGate = singleInputGate('shift', shiftDigit, {
  name: 'by',
  spec: { default: 1, min: 1, max: MAX_RADIX - 1 },
})
/** True (radix - 1) when the input is exactly `match`, otherwise 0. */
export const isGate = singleInputGate('is', (a, radix, match) => isDigit(a, match, radix), {
  name: 'match',
  spec: { default: 0, min: 0, max: MAX_RADIX - 1 },
})
