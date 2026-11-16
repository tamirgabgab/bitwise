import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import { formatSignal, parseSignal } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { builtinComponents } from './index.ts'

/** Evaluates a gate directly, with inputs given as text in port order. */
function gate(type: string, inputs: string[], params: Record<string, number> = {}): string {
  const def = builtinComponents.get(type)
  const resolved = resolveParams(def, params)
  const values: Record<string, Signal> = {}
  const inputPorts = def.ports(resolved).filter((port) => port.direction === 'in')
  inputPorts.forEach((port, index) => {
    values[port.name] = parseSignal(inputs[index])
  })
  return formatSignal(def.evaluate(values, resolved, undefined).outputs.out)
}

const VALUES = ['0', '1', 'X', 'Z']

/**
 * Full truth tables over 0, 1, X and Z. Each row is one value of the first
 * input, each character in it one value of the second, both in the order
 * 0, 1, X, Z.
 */
const TWO_INPUT_TABLES: Record<string, string[]> = {
  and: ['0000', '01XX', '0XXX', '0XXX'],
  or: ['01XX', '1111', 'X1XX', 'X1XX'],
  nand: ['1111', '10XX', '1XXX', '1XXX'],
  nor: ['10XX', '0000', 'X0XX', 'X0XX'],
  xor: ['01XX', '10XX', 'XXXX', 'XXXX'],
  xnor: ['10XX', '01XX', 'XXXX', 'XXXX'],
}

describe('two-input gates', () => {
  for (const [type, table] of Object.entries(TWO_INPUT_TABLES)) {
    it(`${type} matches its truth table, including X and Z inputs`, () => {
      const actual = VALUES.map((a) => VALUES.map((b) => gate(type, [a, b])).join(''))
      expect(actual).toEqual(table)
    })
  }
})

describe('single-input gates', () => {
  it('not inverts, and reads X or Z as X', () => {
    expect(VALUES.map((a) => gate('not', [a])).join('')).toBe('10XX')
  })

  it('buffer passes 0 and 1, and reads X or Z as X', () => {
    expect(VALUES.map((a) => gate('buffer', [a])).join('')).toBe('01XX')
  })
})

describe('gates with more than two inputs', () => {
  it('and needs every input high', () => {
    const ones = new Array<string>(8).fill('1')
    expect(gate('and', ones, { inputs: 8 })).toBe('1')
    expect(gate('and', [...ones.slice(0, 7), '0'], { inputs: 8 })).toBe('0')
  })

  it('or needs one input high', () => {
    expect(gate('or', ['0', '0', '0'], { inputs: 3 })).toBe('0')
    expect(gate('or', ['0', 'X', '1'], { inputs: 3 })).toBe('1')
  })

  it('xor is odd parity', () => {
    expect(gate('xor', ['1', '1', '1'], { inputs: 3 })).toBe('1')
    expect(gate('xor', ['1', '1', '0'], { inputs: 3 })).toBe('0')
    expect(gate('xor', ['1', '0', '0', '0'], { inputs: 4 })).toBe('1')
  })

  it('xnor is even parity', () => {
    expect(gate('xnor', ['1', '1', '0'], { inputs: 3 })).toBe('1')
    expect(gate('xnor', ['1', '1', '1'], { inputs: 3 })).toBe('0')
  })

  it('names its ports in0, in1, ... and out', () => {
    const def = builtinComponents.get('nand')
    const names = def.ports(resolveParams(def, { inputs: 3 })).map((port) => port.name)
    expect(names).toEqual(['in0', 'in1', 'in2', 'out'])
  })
})

describe('gates on buses', () => {
  it('works bit by bit', () => {
    expect(gate('and', ['1100', '1010'], { width: 4 })).toBe('1000')
    expect(gate('xor', ['1100', '1010'], { width: 4 })).toBe('0110')
    expect(gate('not', ['10XZ'], { width: 4 })).toBe('01XX')
  })
})

describe('gate parameters', () => {
  const and = builtinComponents.get('and')

  it('defaults to two inputs of one bit', () => {
    expect(resolveParams(and)).toEqual({ inputs: 2, width: 1 })
  })

  it('rejects an input count outside 2 to 8', () => {
    expect(() => resolveParams(and, { inputs: 1 })).toThrow()
    expect(() => resolveParams(and, { inputs: 9 })).toThrow()
  })

  it('rejects fractional values and unknown parameters', () => {
    expect(() => resolveParams(and, { inputs: 2.5 })).toThrow()
    expect(() => resolveParams(and, { speed: 3 })).toThrow()
  })
})

describe('built-in registry', () => {
  it('holds every Phase 1 component', () => {
    expect(builtinComponents.types().sort()).toEqual(
      ['and', 'buffer', 'input', 'nand', 'nor', 'not', 'or', 'xnor', 'xor'].sort(),
    )
  })

  it('rejects an unknown type', () => {
    expect(() => builtinComponents.get('flux-capacitor')).toThrow()
  })
})
