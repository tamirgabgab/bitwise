import type { ComponentDef, PortSpec } from '../component.ts'
import { X, filled } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Between a digit and the bits that spell it in binary.
 *
 * A bit on a wire is 0 or the top value, radix - 1, the way a clock and the
 * control inputs of a flip-flop read it. That keeps NOT, AND and OR working
 * on bits as Boolean gates at any radix. At radix 2 a digit is one bit.
 */

/** The most bits a digit can need: the largest radix is 16. */
export const MAX_BITS = 4

const bitsParam = { default: 2, min: 1, max: MAX_BITS } as const

function bitPorts(bits: number, direction: PortSpec['direction']): PortSpec[] {
  const ports: PortSpec[] = []
  for (let i = 0; i < bits; i++) ports.push({ name: `b${i}`, direction, width: 1 })
  return ports
}

/**
 * Writes a digit in binary: outputs b0 (worth 1), b1 (worth 2) and so on.
 * A digit that is unknown, or too large for the bits there are, gives X on
 * every output.
 */
export const toBits: ComponentDef = {
  type: 'tobits',
  params: { bits: bitsParam },
  ports({ bits }) {
    return [{ name: 'in', direction: 'in', width: 1 }, ...bitPorts(bits, 'out')]
  },
  evaluate(inputs, { bits }, _state, { radix }) {
    const digit = inputs.in[0]
    const known = digit >= 0 && digit < radix && digit < 2 ** bits
    const outputs: Record<string, readonly Digit[]> = {}
    for (let i = 0; i < bits; i++) {
      outputs[`b${i}`] = known ? [(digit >> i) & 1 ? radix - 1 : 0] : filled(1, X)
    }
    return { outputs }
  },
}

/**
 * Reads bits as one digit. A bit that is neither 0 nor the top value makes
 * the output X, and so does a number the radix has no digit for.
 */
export const fromBits: ComponentDef = {
  type: 'frombits',
  params: { bits: bitsParam },
  ports({ bits }) {
    return [...bitPorts(bits, 'in'), { name: 'out', direction: 'out', width: 1 }]
  },
  evaluate(inputs, { bits }, _state, { radix }) {
    let value = 0
    for (let i = 0; i < bits; i++) {
      const bit = inputs[`b${i}`][0]
      if (bit === radix - 1) value += 2 ** i
      else if (bit !== 0) return { outputs: { out: [X] } }
    }
    return { outputs: { out: [value < radix ? value : X] } }
  },
}
