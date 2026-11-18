import { describe, expect, it } from 'vitest'
import { calcLines, readNumber, writeBalanced, writeInRadix } from './calculator.ts'

describe('readNumber', () => {
  it('reads digits of the radix', () => {
    expect(readNumber('120', 3, 'radix')).toBe(15)
    expect(readNumber('ff', 16, 'radix')).toBe(255)
  })

  it('reads decimal', () => {
    expect(readNumber('15', 3, 'decimal')).toBe(15)
  })

  it('reads a minus sign and ignores spaces', () => {
    expect(readNumber('-1 0', 2, 'radix')).toBe(-2)
    expect(readNumber('−5', 10, 'decimal')).toBe(-5)
    expect(readNumber('-0', 10, 'decimal')).toBe(0)
  })

  it('refuses a digit the radix has no room for, and anything else', () => {
    expect(readNumber('3', 3, 'radix')).toBeUndefined()
    expect(readNumber('A', 3, 'decimal')).toBeUndefined()
    expect(readNumber('', 3, 'radix')).toBeUndefined()
    expect(readNumber('1.5', 10, 'decimal')).toBeUndefined()
  })

  it('refuses a number too large to compute with exactly', () => {
    expect(readNumber('9'.repeat(20), 10, 'decimal')).toBeUndefined()
  })
})

describe('writeInRadix', () => {
  it('writes the most significant digit first', () => {
    expect(writeInRadix(15, 3)).toBe('120')
    expect(writeInRadix(255, 16)).toBe('FF')
    expect(writeInRadix(0, 5)).toBe('0')
    expect(writeInRadix(-6, 2)).toBe('−110')
  })

  it('goes back to the same number', () => {
    for (const value of [1, 7, 100, 12345]) {
      for (const radix of [2, 3, 7, 16]) {
        expect(readNumber(writeInRadix(value, radix), radix, 'radix')).toBe(value)
      }
    }
  })
})

describe('writeBalanced', () => {
  it('writes balanced ternary', () => {
    expect(writeBalanced(0, 3)).toBe('0')
    expect(writeBalanced(1, 3)).toBe('+1')
    expect(writeBalanced(2, 3)).toBe('+1 −1')
    expect(writeBalanced(-2, 3)).toBe('−1 +1')
    expect(writeBalanced(5, 3)).toBe('+1 −1 −1')
  })

  it('works for any odd radix', () => {
    expect(writeBalanced(7, 5)).toBe('+1 +2')
    expect(writeBalanced(8, 5)).toBe('+2 −2')
  })

  it('has no balanced form for an even radix', () => {
    expect(writeBalanced(4, 2)).toBeUndefined()
  })

  it('adds up to the number it stands for', () => {
    for (let value = -50; value <= 50; value++) {
      const digits = writeBalanced(value, 3)!
        .split(' ')
        .map((digit) => Number(digit.replace('−', '-')))
      expect(digits.reduce((sum, digit) => sum * 3 + digit, 0)).toBe(value)
    }
  })
})

describe('calcLines', () => {
  it('gives each number, the sum and the product', () => {
    expect(calcLines(4, 5).map((line) => line.value)).toEqual([4, 5, 9, 20])
  })

  it('leaves out what needs a number that is missing', () => {
    expect(calcLines(4, undefined).map((line) => line.value)).toEqual([4, undefined, undefined, undefined])
  })

  it('leaves out a product too large to compute exactly', () => {
    expect(calcLines(2 ** 40, 2 ** 40)[3].value).toBeUndefined()
  })
})
