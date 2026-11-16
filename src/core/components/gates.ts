import type { ComponentDef, ParamSpec, PortSpec } from '../component.ts'
import { MAX_WIDTH, andBit, notBit, orBit, xorBit } from '../signal.ts'
import type { Bit, Signal } from '../signal.ts'

const widthParam: ParamSpec = { default: 1, min: 1, max: MAX_WIDTH }
const inputsParam: ParamSpec = { default: 2, min: 2, max: 8 }

/**
 * A gate with 2 to 8 inputs named in0, in1, ... and one output named out.
 * With a width above 1 it works on buses, bit by bit.
 */
function multiInputGate(
  type: string,
  combine: (a: Bit, b: Bit) => Bit,
  invert: boolean,
): ComponentDef {
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
    evaluate(inputs, params) {
      const out: Bit[] = []
      for (let bit = 0; bit < params.width; bit++) {
        let result = inputs.in0[bit]
        for (let i = 1; i < params.inputs; i++) {
          result = combine(result, inputs[`in${i}`][bit])
        }
        out.push(invert ? notBit(result) : result)
      }
      return { outputs: { out } }
    },
  }
}

/** A gate with one input named in and one output named out. */
function singleInputGate(type: string, apply: (a: Bit) => Bit): ComponentDef {
  return {
    type,
    params: { width: widthParam },
    ports({ width }) {
      return [
        { name: 'in', direction: 'in', width },
        { name: 'out', direction: 'out', width },
      ]
    },
    evaluate(inputs) {
      const out: Signal = inputs.in.map(apply)
      return { outputs: { out } }
    },
  }
}

export const andGate = multiInputGate('and', andBit, false)
export const orGate = multiInputGate('or', orBit, false)
export const nandGate = multiInputGate('nand', andBit, true)
export const norGate = multiInputGate('nor', orBit, true)
/** With more than two inputs this is odd parity: 1 when an odd number are 1. */
export const xorGate = multiInputGate('xor', xorBit, false)
export const xnorGate = multiInputGate('xnor', xorBit, true)

export const notGate = singleInputGate('not', notBit)
/** Passes 0 and 1 through. A floating or unknown input reads as X. */
export const bufferGate = singleInputGate('buffer', (a) => notBit(notBit(a)))
