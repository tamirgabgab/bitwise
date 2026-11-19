import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import type { ComponentDef } from '../component.ts'
import { formatSignal, parseSignal } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { ALU_OPERATIONS, adder, alu, comparator, multiplier, shifter, subtractor } from './arith.ts'

/** A number written in the radix with `digits` digits, the most significant first. */
const written = (value: number, radix: number, digits: number): string =>
  value.toString(radix).toUpperCase().padStart(digits, '0')

function run(
  def: ComponentDef,
  width: number | Record<string, number>,
  inputs: Record<string, string>,
  radix = 2,
): Record<string, string> {
  const params = resolveParams(def, typeof width === 'number' ? { width } : width)
  const values: Record<string, Signal> = {}
  for (const port of def.ports(params)) {
    if (port.direction !== 'in') continue
    values[port.name] = parseSignal(inputs[port.name] ?? 'Z'.repeat(port.width), radix)
  }
  const result = def.evaluate(values, params, undefined, { radix, woke: false })
  const outputs: Record<string, string> = {}
  for (const [name, signal] of Object.entries(result.outputs)) outputs[name] = formatSignal(signal)
  return outputs
}

describe('adder', () => {
  it('adds two binary numbers', () => {
    expect(run(adder, 4, { a: '0101', b: '0011' })).toEqual({ sum: '1000', cout: '0' })
    expect(run(adder, 4, { a: '1111', b: '0001' })).toEqual({ sum: '0000', cout: '1' })
  })

  it('agrees with ordinary addition for every pair of two-digit numbers at radix 3', () => {
    for (let a = 0; a < 9; a++) {
      for (let b = 0; b < 9; b++) {
        const text = (n: number): string => n.toString(3).padStart(2, '0')
        const total = a + b
        expect(run(adder, 2, { a: text(a), b: text(b) }, 3)).toEqual({
          sum: text(total % 9),
          cout: total >= 9 ? '2' : '0',
        })
      }
    }
  })

  it('adds 1 for a carry in at the top value, and nothing otherwise', () => {
    expect(run(adder, 2, { a: '01', b: '01', cin: '1' })).toEqual({ sum: '11', cout: '0' })
    expect(run(adder, 2, { a: '12', b: '10', cin: '2' }, 3)).toEqual({ sum: '00', cout: '2' })
    // 1 is not the top value at radix 3, so it is no carry.
    expect(run(adder, 2, { a: '12', b: '10', cin: '1' }, 3)).toEqual({ sum: '22', cout: '0' })
  })

  it('adds hexadecimal digits', () => {
    expect(run(adder, 2, { a: '9F', b: '01' }, 16)).toEqual({ sum: 'A0', cout: '0' })
  })

  it('does not know the sum from an unknown digit upwards', () => {
    expect(run(adder, 4, { a: '01X1', b: '0001' })).toEqual({ sum: 'XXX0', cout: '0' })
    expect(run(adder, 2, { a: 'X1', b: '01' })).toEqual({ sum: 'X0', cout: 'X' })
  })

  it('finds its carry again when two digits settle it', () => {
    // 0 + 0 cannot carry whatever came before, and 1 + 1 always does.
    expect(run(adder, 4, { a: '00X1', b: '0001' })).toEqual({ sum: '0XX0', cout: '0' })
    expect(run(adder, 4, { a: '11X1', b: '0101' })).toEqual({ sum: '0XX0', cout: '1' })
  })

  it('does not know anything with an unknown carry in, until the digits settle it', () => {
    expect(run(adder, 2, { a: '01', b: '00', cin: 'X' })).toEqual({ sum: 'XX', cout: '0' })
    expect(run(adder, 2, { a: '00', b: '00', cin: 'X' })).toEqual({ sum: '0X', cout: '0' })
  })
})

describe('comparator', () => {
  it('says which of two numbers is larger', () => {
    expect(run(comparator, 4, { a: '0101', b: '0110' })).toEqual({ lt: '1', eq: '0', gt: '0' })
    expect(run(comparator, 4, { a: '1000', b: '0111' })).toEqual({ lt: '0', eq: '0', gt: '1' })
    expect(run(comparator, 4, { a: '1010', b: '1010' })).toEqual({ lt: '0', eq: '1', gt: '0' })
  })

  it('answers with the top value at any radix', () => {
    expect(run(comparator, 2, { a: '12', b: '20' }, 3)).toEqual({ lt: '2', eq: '0', gt: '0' })
    expect(run(comparator, 1, { a: 'F', b: 'A' }, 16)).toEqual({ lt: '0', eq: '0', gt: 'F' })
  })

  it('is not troubled by an unknown digit below the first difference', () => {
    expect(run(comparator, 3, { a: '1X0', b: '0X1' })).toEqual({ lt: '0', eq: '0', gt: '1' })
  })

  it('does not know when an unknown digit could decide it', () => {
    expect(run(comparator, 3, { a: '1X0', b: '110' })).toEqual({ lt: 'X', eq: 'X', gt: 'X' })
    expect(run(comparator, 1, { a: '1' })).toEqual({ lt: 'X', eq: 'X', gt: 'X' })
  })
})

describe('subtractor', () => {
  it('agrees with ordinary subtraction, wrapping below 0, at radix 2 and 3', () => {
    for (const radix of [2, 3]) {
      const size = radix ** 2
      for (let a = 0; a < size; a++) {
        for (let b = 0; b < size; b++) {
          expect(run(subtractor, 2, { a: written(a, radix, 2), b: written(b, radix, 2) }, radix)).toEqual({
            diff: written((a - b + size) % size, radix, 2),
            bout: a < b ? String(radix - 1) : '0',
          })
        }
      }
    }
  })

  it('takes 1 more for a borrow in at the top value', () => {
    expect(run(subtractor, 2, { a: '10', b: '01', bin: '1' })).toEqual({ diff: '00', bout: '0' })
    expect(run(subtractor, 2, { a: '00', b: '00', bin: '1' })).toEqual({ diff: '11', bout: '1' })
    expect(run(subtractor, 1, { a: '2', b: '1', bin: '1' }, 3)).toEqual({ diff: '1', bout: '0' })
  })

  it('finds its borrow again when two digits settle it', () => {
    expect(run(subtractor, 3, { a: '1X0', b: '000' })).toEqual({ diff: 'XX0', bout: '0' })
    expect(run(subtractor, 3, { a: '0X0', b: '1X0' })).toEqual({ diff: 'XX0', bout: '1' })
    // 3 − 0 − 0 or 3 − 0 − 1: only the last digit is in doubt.
    expect(run(subtractor, 2, { a: '11', b: '00', bin: 'X' })).toEqual({ diff: '1X', bout: '0' })
  })
})

describe('multiplier', () => {
  it('gives the whole product, twice as wide', () => {
    for (const radix of [2, 3, 16]) {
      const size = radix ** 2
      for (let a = 0; a < size; a += radix === 16 ? 17 : 1) {
        for (let b = 0; b < size; b += radix === 16 ? 13 : 1) {
          expect(run(multiplier, 2, { a: written(a, radix, 2), b: written(b, radix, 2) }, radix)).toEqual({
            p: written(a * b, radix, 4),
          })
        }
      }
    }
  })

  it('does not know the product from one unknown digit', () => {
    expect(run(multiplier, 2, { a: '1X', b: '00' })).toEqual({ p: 'XXXX' })
  })

  it('stops at half the widest bus', () => {
    expect(multiplier.params.width.max * 2).toBe(64)
  })
})

describe('ALU', () => {
  const op = (name: (typeof ALU_OPERATIONS)[number], radix = 2): string =>
    written(ALU_OPERATIONS.indexOf(name), radix, radix === 2 ? 3 : 2)
  const alu4 = (name: (typeof ALU_OPERATIONS)[number], a: string, b: string, radix = 2) =>
    run(alu, { width: 4, select: radix === 2 ? 3 : 2 }, { a, b, op: op(name, radix) }, radix)

  it('adds and subtracts, with the carry and the borrow', () => {
    expect(alu4('ADD', '0111', '0001')).toEqual({ y: '1000', zero: '0', carry: '0' })
    expect(alu4('ADD', '1111', '0001')).toEqual({ y: '0000', zero: '1', carry: '1' })
    expect(alu4('SUB', '0101', '0101')).toEqual({ y: '0000', zero: '1', carry: '0' })
    expect(alu4('SUB', '0001', '0010')).toEqual({ y: '1111', zero: '0', carry: '1' })
  })

  it('works digit by digit as the gates do', () => {
    expect(alu4('AND', '1100', '1010')).toEqual({ y: '1000', zero: '0', carry: '0' })
    expect(alu4('OR', '1100', '1010')).toEqual({ y: '1110', zero: '0', carry: '0' })
    expect(alu4('XOR', '1100', '1010')).toEqual({ y: '0110', zero: '0', carry: '0' })
    expect(alu4('NOT', '1100', '0000')).toEqual({ y: '0011', zero: '0', carry: '0' })
    // At radix 3: min, max, the sum modulo 3, and 2 - x.
    expect(alu4('AND', '0122', '2101', 3)).toEqual({ y: '0101', zero: '0', carry: '0' })
    expect(alu4('OR', '0122', '2101', 3)).toEqual({ y: '2122', zero: '0', carry: '0' })
    expect(alu4('XOR', '0122', '2101', 3)).toEqual({ y: '2220', zero: '0', carry: '0' })
    expect(alu4('NOT', '0122', '0000', 3)).toEqual({ y: '2100', zero: '0', carry: '0' })
  })

  it('shifts one digit, with what went out as the carry', () => {
    expect(alu4('SHL', '1011', '0000')).toEqual({ y: '0110', zero: '0', carry: '1' })
    expect(alu4('SHR', '1010', '0000')).toEqual({ y: '0101', zero: '0', carry: '0' })
    expect(alu4('SHR', '0001', '0000')).toEqual({ y: '0000', zero: '1', carry: '1' })
    expect(alu4('SHL', '2000', '0000', 3)).toEqual({ y: '0000', zero: '2', carry: '2' })
  })

  it('knows nothing of an operation it does not have, or an unknown one', () => {
    expect(run(alu, { width: 2, select: 4 }, { a: '00', b: '00', op: '1000' })).toEqual({ y: 'XX', zero: 'X', carry: 'X' })
    expect(run(alu, { width: 2, select: 3 }, { a: '00', b: '00', op: '0X0' })).toEqual({ y: 'XX', zero: 'X', carry: 'X' })
    expect(run(alu, { width: 2, select: 3 }, { a: '00', b: '00' })).toEqual({ y: 'XX', zero: 'X', carry: 'X' })
  })

  it('still says zero is false when a known digit is not 0', () => {
    expect(alu4('AND', '1X00', '1100')).toEqual({ y: '1X00', zero: '0', carry: '0' })
    expect(alu4('AND', '0X00', '1100')).toEqual({ y: '0X00', zero: 'X', carry: '0' })
  })
})

describe('shifter', () => {
  const shift = (input: string, amount: string, left: number, rotate: number, radix = 2) =>
    run(shifter, { width: input.length, select: amount.length, left, rotate }, { in: input, amt: amount }, radix)

  it('moves the digits up or down, bringing in zeros', () => {
    expect(shift('0011', '1', 1, 0)).toEqual({ out: '0110' })
    expect(shift('0011', '10', 1, 0)).toEqual({ out: '1100' })
    expect(shift('1100', '11', 0, 0)).toEqual({ out: '0001' })
    expect(shift('1111', '111', 1, 0)).toEqual({ out: '0000' })
    expect(shift('1111', '0', 0, 0)).toEqual({ out: '1111' })
  })

  it('wraps the digits around when it rotates', () => {
    expect(shift('1001', '1', 1, 1)).toEqual({ out: '0011' })
    expect(shift('1001', '1', 0, 1)).toEqual({ out: '1100' })
    expect(shift('1001', '101', 1, 1)).toEqual({ out: '0011' })
  })

  it('reads the amount in the radix', () => {
    // 1 then 2 at radix 3 is five digits along: past the end of four.
    expect(shift('2101', '2', 1, 0, 3)).toEqual({ out: '0100' })
    expect(shift('2101', '2', 0, 1, 3)).toEqual({ out: '0121' })
  })

  it('knows nothing with an unknown amount, and keeps an unknown digit unknown', () => {
    expect(shift('1010', 'X', 1, 0)).toEqual({ out: 'XXXX' })
    expect(shift('1X10', '1', 1, 0)).toEqual({ out: 'X100' })
  })
})