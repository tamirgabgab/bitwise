import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import type { ComponentDef } from '../component.ts'
import { formatSignal, parseSignal } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { adder, comparator } from './arith.ts'

function run(
  def: ComponentDef,
  width: number,
  inputs: Record<string, string>,
  radix = 2,
): Record<string, string> {
  const params = resolveParams(def, { width })
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
