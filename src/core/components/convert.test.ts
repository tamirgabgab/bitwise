import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import { X, Z } from '../signal.ts'
import type { Digit } from '../signal.ts'
import { Simulator } from '../simulator.ts'
import { fromBits, toBits } from './convert.ts'

function bitsOf(digit: Digit, radix: number, bits = 2): Digit[] {
  const params = resolveParams(toBits, { bits })
  const { outputs } = toBits.evaluate({ in: [digit] }, params, undefined, { radix, woke: false })
  return Array.from({ length: bits }, (_, i) => outputs[`b${i}`][0])
}

function digitOf(bitValues: readonly Digit[], radix: number): Digit {
  const params = resolveParams(fromBits, { bits: bitValues.length })
  const inputs: Record<string, Digit[]> = {}
  bitValues.forEach((bit, i) => {
    inputs[`b${i}`] = [bit]
  })
  return fromBits.evaluate(inputs, params, undefined, { radix, woke: false }).outputs.out[0]
}

describe('tobits', () => {
  it('writes a digit of radix 4 as two bits, each 0 or the top value', () => {
    expect(bitsOf(0, 4)).toEqual([0, 0])
    expect(bitsOf(1, 4)).toEqual([3, 0])
    expect(bitsOf(2, 4)).toEqual([0, 3])
    expect(bitsOf(3, 4)).toEqual([3, 3])
  })

  it('is a plain wire at radix 2 with one bit', () => {
    expect(bitsOf(0, 2, 1)).toEqual([0])
    expect(bitsOf(1, 2, 1)).toEqual([1])
  })

  it('writes the digits of radix 3 with the top value 2 for a set bit', () => {
    expect(bitsOf(1, 3)).toEqual([2, 0])
    expect(bitsOf(2, 3)).toEqual([0, 2])
  })

  it('gives X when the digit is unknown or does not fit the bits', () => {
    expect(bitsOf(X, 4)).toEqual([X, X])
    expect(bitsOf(Z, 4)).toEqual([X, X])
    expect(bitsOf(5, 4)).toEqual([X, X])
    expect(bitsOf(2, 4, 1)).toEqual([X])
    expect(bitsOf(9, 16, 4)).toEqual([15, 0, 0, 15])
  })

  it('names its pins b0, b1 and so on', () => {
    expect(toBits.ports(resolveParams(toBits, { bits: 3 })).map((port) => port.name)).toEqual([
      'in',
      'b0',
      'b1',
      'b2',
    ])
  })
})

describe('frombits', () => {
  it('reads two bits as a digit of radix 4', () => {
    expect(digitOf([0, 0], 4)).toBe(0)
    expect(digitOf([3, 0], 4)).toBe(1)
    expect(digitOf([0, 3], 4)).toBe(2)
    expect(digitOf([3, 3], 4)).toBe(3)
  })

  it('takes only 0 and the top value for a bit', () => {
    expect(digitOf([1, 0], 4)).toBe(X)
    expect(digitOf([X, 0], 4)).toBe(X)
    expect(digitOf([Z, 3], 4)).toBe(X)
  })

  it('gives X for a number the radix has no digit for', () => {
    expect(digitOf([2, 2], 3)).toBe(X)
    expect(digitOf([0, 2], 3)).toBe(2)
  })

  it('undoes tobits for every digit, at every radix', () => {
    for (let radix = 2; radix <= 16; radix++) {
      for (let digit = 0; digit < radix; digit++) {
        expect(digitOf(bitsOf(digit, radix, 4), radix)).toBe(digit)
      }
    }
  })
})

describe('bits through Boolean gates at radix 4', () => {
  it('inverts a digit bit by bit: 1 becomes 2', () => {
    const sim = new Simulator(undefined, 4)
    const input = sim.addComponent('input')
    const split = sim.addComponent('tobits')
    const join = sim.addComponent('frombits')
    sim.connect({ component: input, port: 'out' }, { component: split, port: 'in' })
    for (const bit of ['b0', 'b1']) {
      const not = sim.addComponent('not')
      sim.connect({ component: split, port: bit }, { component: not, port: 'in' })
      sim.connect({ component: not, port: 'out' }, { component: join, port: bit })
    }
    const read = () => sim.readPin({ component: join, port: 'out' })[0]
    const answers: Digit[] = []
    for (let digit = 0; digit < 4; digit++) {
      sim.setState(input, [digit])
      sim.settle()
      answers.push(read())
    }
    expect(answers).toEqual([3, 2, 1, 0])
  })
})
