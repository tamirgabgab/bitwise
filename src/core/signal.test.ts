import { describe, expect, it } from 'vitest'
import {
  Bit,
  X,
  Z,
  addDigit,
  andBit,
  checkRadix,
  digitChar,
  filled,
  formatSignal,
  isDigit,
  isKnown,
  isPrime,
  maxDigit,
  minDigit,
  mirrorDigit,
  mulDigit,
  notBit,
  orBit,
  parseSignal,
  resolve,
  shiftDigit,
  signalsEqual,
  xorBit,
} from './signal.ts'

const drivers = (...texts: string[]) => texts.map((text) => parseSignal(text))

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

describe('signals above radix 2', () => {
  it('parses and formats digits up to F', () => {
    expect(parseSignal('2101', 3)).toEqual([1, 0, 1, 2])
    expect(formatSignal(parseSignal('F0a9xZ', 16))).toBe('F0A9XZ')
    expect(digitChar(11)).toBe('B')
    expect(digitChar(X)).toBe('X')
    expect(digitChar(Z)).toBe('Z')
  })

  it('rejects a digit the radix has no room for', () => {
    expect(() => parseSignal('3', 3)).toThrow()
    expect(() => parseSignal('A', 10)).toThrow()
    expect(parseSignal('A', 11)).toEqual([10])
  })

  it('accepts a radix from 2 to 16 only', () => {
    expect(() => checkRadix(1)).toThrow()
    expect(() => checkRadix(17)).toThrow()
    expect(() => checkRadix(2.5)).toThrow()
    expect(() => checkRadix(16)).not.toThrow()
  })

  it('tells digits from X and Z', () => {
    expect([0, 7, X, Z].map(isKnown)).toEqual([true, true, false, false])
  })

  it('knows the primes', () => {
    const primes: number[] = []
    for (let n = 0; n <= 16; n++) if (isPrime(n)) primes.push(n)
    expect(primes).toEqual([2, 3, 5, 7, 11, 13])
  })
})

describe('digit logic', () => {
  it('min and max pick the smaller and the larger digit', () => {
    expect(minDigit(3, 1)).toBe(1)
    expect(maxDigit(3, 1, 5)).toBe(3)
  })

  it('0 decides min and the top digit decides max, even next to X or Z', () => {
    expect(minDigit(0, X)).toBe(0)
    expect(minDigit(Z, 0)).toBe(0)
    expect(minDigit(2, X)).toBe(X)
    expect(maxDigit(4, X, 5)).toBe(4)
    expect(maxDigit(Z, 4, 5)).toBe(4)
    expect(maxDigit(3, X, 5)).toBe(X)
  })

  it('mirror swaps the ends and is its own inverse', () => {
    for (let radix = 2; radix <= 16; radix++) {
      for (let x = 0; x < radix; x++) {
        expect(mirrorDigit(x, radix)).toBe(radix - 1 - x)
        expect(mirrorDigit(mirrorDigit(x, radix), radix)).toBe(x)
      }
    }
    expect(mirrorDigit(Z, 3)).toBe(X)
  })

  it('shift goes round the radix and comes back after radix steps', () => {
    for (let radix = 2; radix <= 16; radix++) {
      for (let x = 0; x < radix; x++) {
        let value = x
        for (let i = 0; i < radix; i++) value = shiftDigit(value, radix)
        expect(value).toBe(x)
        expect(shiftDigit(x, radix, radix - 1)).toBe((x + radix - 1) % radix)
      }
    }
    expect(shiftDigit(X, 3)).toBe(X)
  })

  it('add and mul work modulo the radix', () => {
    expect(addDigit(2, 2, 3)).toBe(1)
    expect(mulDigit(2, 2, 3)).toBe(1)
    expect(mulDigit(2, 2, 4)).toBe(0)
    expect(addDigit(0, X, 3)).toBe(X)
    expect(mulDigit(0, X, 3)).toBe(0)
    expect(mulDigit(2, Z, 3)).toBe(X)
  })

  it('is answers with the top digit or 0', () => {
    expect([0, 1, 2].map((x) => isDigit(x, 1, 3))).toEqual([0, 2, 0])
    expect(isDigit(Z, 1, 3)).toBe(X)
  })

  it('matches the Boolean gates at radix 2', () => {
    const values = [0, 1, X, Z]
    for (const a of values) {
      expect(mirrorDigit(a, 2)).toBe(notBit(a))
      expect(shiftDigit(a, 2)).toBe(notBit(a))
      for (const b of values) {
        expect(minDigit(a, b)).toBe(andBit(a, b))
        expect(maxDigit(a, b, 2)).toBe(orBit(a, b))
        expect(addDigit(a, b, 2)).toBe(xorBit(a, b))
        expect(mulDigit(a, b, 2)).toBe(andBit(a, b))
      }
    }
  })
})

describe('resolve above radix 2', () => {
  const ternary = (...texts: string[]) => texts.map((text) => parseSignal(text, 3))

  it('accepts drivers that agree on any digit', () => {
    const result = resolve(1, ternary('2', 'Z', '2'))
    expect(formatSignal(result.value)).toBe('2')
    expect(result.conflict).toBe(false)
  })

  it('reports a conflict between any two different digits', () => {
    const result = resolve(1, ternary('1', '2'))
    expect(formatSignal(result.value)).toBe('X')
    expect(result.conflict).toBe(true)
  })

  it('resolves each position of a bus on its own', () => {
    const result = resolve(3, ternary('2ZZ', 'Z1Z'))
    expect(formatSignal(result.value)).toBe('21Z')
    expect(result.conflict).toBe(false)
  })
})
