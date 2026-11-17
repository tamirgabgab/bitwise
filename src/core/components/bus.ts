import type { ComponentDef, ParamSpec, PortSpec } from '../component.ts'
import { MAX_WIDTH } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Between a bus and the wires in it. A splitter takes a bus apart into
 * branches and a merger puts branches together into a bus. Branch 0 holds
 * the least significant digits.
 */

const widthParam: ParamSpec = { default: 4, min: 2, max: MAX_WIDTH }
/** How many digits each branch carries. The last branch takes what is left. */
const eachParam: ParamSpec = { default: 1, min: 1, max: MAX_WIDTH }

/** The width of every branch of a bus `width` digits wide, lowest first. */
export function branchWidths(width: number, each: number): number[] {
  const widths: number[] = []
  for (let from = 0; from < width; from += each) widths.push(Math.min(each, width - from))
  return widths
}

function branchPorts(width: number, each: number, direction: PortSpec['direction']): PortSpec[] {
  return branchWidths(width, each).map((size, index) => ({
    name: `d${index}`,
    direction,
    width: size,
  }))
}

/** Takes a bus apart: input `in`, outputs d0 (the lowest digits), d1, ... */
export const splitter: ComponentDef = {
  type: 'split',
  params: { width: widthParam, each: eachParam },
  ports({ width, each }) {
    return [{ name: 'in', direction: 'in', width }, ...branchPorts(width, each, 'out')]
  },
  evaluate(inputs, { width, each }) {
    const outputs: Record<string, readonly Digit[]> = {}
    branchWidths(width, each).forEach((size, index) => {
      outputs[`d${index}`] = inputs.in.slice(index * each, index * each + size)
    })
    return { outputs }
  },
}

/** Puts a bus together: inputs d0 (the lowest digits), d1, ..., output `out`. */
export const merger: ComponentDef = {
  type: 'merge',
  params: { width: widthParam, each: eachParam },
  ports({ width, each }) {
    return [...branchPorts(width, each, 'in'), { name: 'out', direction: 'out', width }]
  },
  evaluate(inputs, { width, each }) {
    const out: Digit[] = []
    branchWidths(width, each).forEach((_size, index) => out.push(...inputs[`d${index}`]))
    return { outputs: { out } }
  },
}
