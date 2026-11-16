import { describe, expect, it } from 'vitest'
import {
  Bit,
  andBit,
  filled,
  formatSignal,
  notBit,
  orBit,
  parseSignal,
  resolve,
  signalsEqual,
  xorBit,
} from './signal.ts'

const drivers = (...texts: string[]) => texts.map(parseSignal)

describe('parseSignal and formatSignal', () => {
  it('round-trips every bit value', () => {
    expect(formatSignal(parseSignal('10XZ'))).toBe('10XZ')
  })

  it('puts the least significant bit at index 0', () => {
    expect(parseSignal('100')).toEqual([Bit.Low, Bit.Low, Bit.High])
  })

  it('accepts lower-case x and z', () => {
    expect(formatSignal(parseSignal('xz'))).toBe('XZ')
  })

  it('rejects empty text and unknown characters', () => {
    expect(() => parseSignal('')).toThrow()
    expect(() => parseSignal('102')).toThrow()
  })
})

describe('filled and signalsEqual', () => {
  it('builds a signal of one repeated bit', () => {
    expect(formatSignal(filled(4, Bit.High))).toBe('1111')
  })

  it('compares by content and by width', () => {
    expect(signalsEqual(parseSignal('10'), parseSignal('10'))).toBe(true)
    expect(signalsEqual(parseSignal('10'), parseSignal('11'))).toBe(false)
    expect(signalsEqual(parseSignal('1'), parseSignal('01'))).toBe(false)
  })
})

describe('bit logic', () => {
  const { Low, High, Unknown, HiZ } = Bit

  it('NOT inverts 0 and 1 and gives X otherwise', () => {
    expect([Low, High, Unknown, HiZ].map(notBit)).toEqual([High, Low, Unknown, Unknown])
  })

  it('AND is 0 whenever either input is 0, even next to X or Z', () => {
    expect(andBit(Low, Unknown)).toBe(Low)
    expect(andBit(HiZ, Low)).toBe(Low)
    expect(andBit(High, High)).toBe(High)
    expect(andBit(High, Unknown)).toBe(Unknown)
    expect(andBit(High, HiZ)).toBe(Unknown)
  })

  it('OR is 1 whenever either input is 1, even next to X or Z', () => {
    expect(orBit(High, Unknown)).toBe(High)
    expect(orBit(HiZ, High)).toBe(High)
    expect(orBit(Low, Low)).toBe(Low)
    expect(orBit(Low, Unknown)).toBe(Unknown)
    expect(orBit(Low, HiZ)).toBe(Unknown)
  })

  it('XOR needs both inputs known', () => {
    expect(xorBit(Low, High)).toBe(High)
    expect(xorBit(High, High)).toBe(Low)
    expect(xorBit(High, Unknown)).toBe(Unknown)
    expect(xorBit(HiZ, Low)).toBe(Unknown)
  })
})

describe('resolve', () => {
  it('floats when nothing drives the net', () => {
    expect(resolve(2, [])).toEqual({ value: parseSignal('ZZ'), conflict: false })
  })

  it('ignores drivers that are high impedance', () => {
    const result = resolve(1, drivers('Z', '1', 'Z'))
    expect(formatSignal(result.value)).toBe('1')
    expect(result.conflict).toBe(false)
  })

  it('accepts several drivers that agree', () => {
    const result = resolve(1, drivers('0', '0'))
    expect(formatSignal(result.value)).toBe('0')
    expect(result.conflict).toBe(false)
  })

  it('reports a conflict when a 0 meets a 1', () => {
    const result = resolve(1, drivers('0', '1'))
    expect(formatSignal(result.value)).toBe('X')
    expect(result.conflict).toBe(true)
  })

  it('still sees the conflict when an X driver sits between them', () => {
    expect(resolve(1, drivers('0', 'X', '1')).conflict).toBe(true)
  })

  it('reads X without a conflict when one driver is unknown', () => {
    const result = resolve(1, drivers('1', 'X'))
    expect(formatSignal(result.value)).toBe('X')
    expect(result.conflict).toBe(false)
  })

  it('resolves each bit of a bus on its own', () => {
    const result = resolve(4, drivers('01ZZ', 'Z10Z'))
    expect(formatSignal(result.value)).toBe('010Z')
    expect(result.conflict).toBe(false)
  })
})
