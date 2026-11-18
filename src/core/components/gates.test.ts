import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import { formatSignal, parseSignal } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { builtinComponents } from './index.ts'

/** Evaluates a gate directly, with inputs given as text in port order. */
function gate(
  type: string,
  inputs: string[],
  params: Record<string, number> = {},
  radix = 2,
): string {
  const def = builtinComponents.get(type)
  const resolved = resolveParams(def, params)
  const values: Record<string, Signal> = {}
  const inputPorts = def.ports(resolved).filter((port) => port.direction === 'in')
  inputPorts.forEach((port, index) => {
    values[port.name] = parseSignal(inputs[index], radix)
  })
  return formatSignal(def.evaluate(values, resolved, undefined, { radix, woke: false }).outputs.out)
}

const digitsOf = (radix: number): string[] => [...'0123456789ABCDEF'].slice(0, radix)

/** The table of a two-input gate over the digits of a radix, one row per first input. */
function table(type: string, radix: number): string[] {
  const digits = digitsOf(radix)
  return digits.map((a) => digits.map((b) => gate(type, [a, b], {}, radix)).join(''))
}

/** The outputs of a one-input gate for each digit of a radix, in order. */
function row(type: string, radix: number, params: Record<string, number> = {}): string {
  return digitsOf(radix)
    .map((a) => gate(type, [a], params, radix))
    .join('')
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

const binaryTable = (type: string): string[] =>
  VALUES.map((a) => VALUES.map((b) => gate(type, [a, b])).join(''))

describe('two-input gates', () => {
  for (const [type, expected] of Object.entries(TWO_INPUT_TABLES)) {
    it(`${type} matches its truth table, including X and Z inputs`, () => {
      expect(binaryTable(type)).toEqual(expected)
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

  it('takes the smallest, largest or summed digit above radix 2', () => {
    expect(gate('and', ['3', '1', '4'], { inputs: 3 }, 5)).toBe('1')
    expect(gate('or', ['3', '1', '2'], { inputs: 3 }, 5)).toBe('3')
    expect(gate('add', ['3', '4', '4'], { inputs: 3 }, 5)).toBe('1')
    expect(gate('mul', ['2', '3', '4'], { inputs: 3 }, 5)).toBe('4')
  })
})

describe('gates on buses', () => {
  it('works bit by bit', () => {
    expect(gate('and', ['1100', '1010'], { width: 4 })).toBe('1000')
    expect(gate('xor', ['1100', '1010'], { width: 4 })).toBe('0110')
    expect(gate('not', ['10XZ'], { width: 4 })).toBe('01XX')
  })

  it('works digit by digit above radix 2', () => {
    expect(gate('and', ['210', '122'], { width: 3 }, 3)).toBe('110')
    expect(gate('shift', ['210'], { width: 3 }, 3)).toBe('021')
  })
})

describe('gates above radix 2', () => {
  it('and is the smaller input and or the larger', () => {
    expect(table('and', 3)).toEqual(['000', '011', '012'])
    expect(table('or', 3)).toEqual(['012', '112', '222'])
  })

  it('nand is and plus one, as in the specification table', () => {
    expect(table('nand', 3)).toEqual(['111', '122', '120'])
  })

  it('nor is or plus one (the Webb function)', () => {
    expect(table('nor', 3)).toEqual(['120', '220', '000'])
  })

  it('add and mul work modulo the radix', () => {
    expect(table('add', 3)).toEqual(['012', '120', '201'])
    expect(table('mul', 3)).toEqual(['000', '012', '021'])
    expect(table('mul', 4)).toEqual(['0000', '0123', '0202', '0321'])
  })

  it('not mirrors the value and shift adds one', () => {
    expect(row('not', 3)).toBe('210')
    expect(row('shift', 3)).toBe('120')
    expect(row('not', 5)).toBe('43210')
    expect(row('shift', 5)).toBe('12340')
  })

  it('shift by k adds k', () => {
    expect(row('shift', 5, { by: 3 })).toBe('34012')
    expect(row('shift', 3, { by: 4 })).toBe('120')
  })

  it('is gives the top value for its one digit and 0 for the rest', () => {
    expect(row('is', 3, { match: 0 })).toBe('200')
    expect(row('is', 3, { match: 1 })).toBe('020')
    expect(row('is', 3, { match: 2 })).toBe('002')
    expect(row('is', 3, { match: 7 })).toBe('000')
  })

  it('reaches the full range at radix 16', () => {
    expect(gate('and', ['F', 'A'], {}, 16)).toBe('A')
    expect(gate('or', ['3', 'E'], {}, 16)).toBe('E')
    expect(gate('shift', ['F'], {}, 16)).toBe('0')
    expect(gate('not', ['1'], {}, 16)).toBe('E')
  })

  it('still lets a deciding input win over an unknown one', () => {
    expect(gate('and', ['0', 'X'], {}, 5)).toBe('0')
    expect(gate('and', ['3', 'Z'], {}, 5)).toBe('X')
    expect(gate('or', ['4', 'X'], {}, 5)).toBe('4')
    expect(gate('or', ['1', 'X'], {}, 5)).toBe('X')
    expect(gate('nand', ['0', 'X'], {}, 5)).toBe('1')
    expect(gate('mul', ['0', 'Z'], {}, 5)).toBe('0')
    expect(gate('add', ['0', 'X'], {}, 5)).toBe('X')
    expect(gate('shift', ['Z'], {}, 5)).toBe('X')
    expect(gate('is', ['X'], {}, 5)).toBe('X')
  })

  it('obeys De Morgan at every radix: max(x, y) = not(min(not x, not y))', () => {
    for (let radix = 2; radix <= 16; radix++) {
      const not = (x: string) => gate('not', [x], {}, radix)
      for (const a of digitsOf(radix)) {
        for (const b of digitsOf(radix)) {
          const viaAnd = not(gate('and', [not(a), not(b)], {}, radix))
          expect(viaAnd).toBe(gate('or', [a, b], {}, radix))
        }
      }
    }
  })
})

describe('the newer gates at radix 2', () => {
  it('shift is not', () => {
    expect(VALUES.map((a) => gate('shift', [a])).join('')).toBe('10XX')
  })

  it('add is xor and mul is and', () => {
    expect(binaryTable('add')).toEqual(TWO_INPUT_TABLES.xor)
    expect(binaryTable('mul')).toEqual(TWO_INPUT_TABLES.and)
  })

  it('is 1 passes its input and is 0 inverts it', () => {
    expect(row('is', 2, { match: 1 })).toBe('01')
    expect(row('is', 2, { match: 0 })).toBe('10')
  })
})

describe('sources and sinks', () => {
  function outputs(type: string, params: Record<string, number>, state: unknown, radix: number) {
    const def = builtinComponents.get(type)
    return def.evaluate({}, resolveParams(def, params), state, { radix, woke: false }).outputs
  }

  it('const gives its value, or X when the radix has no such digit', () => {
    expect(formatSignal(outputs('const', { value: 2 }, undefined, 3).out)).toBe('2')
    expect(formatSignal(outputs('const', { value: 2 }, undefined, 2).out)).toBe('X')
    expect(formatSignal(outputs('const', { value: 4, width: 3 }, undefined, 5).out)).toBe('444')
  })

  it('input and button give their state, or X for a digit out of range', () => {
    for (const type of ['input', 'button']) {
      expect(formatSignal(outputs(type, {}, [2], 3).out)).toBe('2')
      expect(formatSignal(outputs(type, {}, [2], 2).out)).toBe('X')
    }
  })

  it('output has one input and drives nothing', () => {
    const def = builtinComponents.get('output')
    const params = resolveParams(def)
    expect(def.ports(params)).toEqual([{ name: 'in', direction: 'in', width: 1 }])
    expect(def.evaluate({ in: [1] }, params, undefined, { radix: 2, woke: false }).outputs).toEqual({})
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
  it('holds every built-in component', () => {
    expect(builtinComponents.types().sort()).toEqual(
      [
        'add',
        'adder',
        'and',
        'buffer',
        'button',
        'clock',
        'compare',
        'const',
        'counter',
        'cycle',
        'decoder',
        'demux',
        'dff',
        'display',
        'frombits',
        'input',
        'is',
        'merge',
        'jkff',
        'mul',
        'mux',
        'nand',
        'nor',
        'not',
        'or',
        'output',
        'register',
        'shift',
        'split',
        'sr',
        'table',
        'tff',
        'tobits',
        'xnor',
        'xor',
      ].sort(),
    )
  })

  it('rejects an unknown type', () => {
    expect(() => builtinComponents.get('flux-capacitor')).toThrow()
  })
})
