import { describe, expect, it } from 'vitest'
import { resolveParams } from '../component.ts'
import { X, Z } from '../signal.ts'
import { gateTable } from '../table.ts'
import { TABLE_CELLS, tableCell, tableGate } from './table.ts'

const env = (radix: number) => ({ radix, woke: false })

function run(params: Record<string, number>, values: readonly number[], radix: number): number {
  const resolved = resolveParams(tableGate, params)
  const inputs: Record<string, number[]> = {}
  values.forEach((value, index) => {
    inputs[`in${index}`] = [value]
  })
  return tableGate.evaluate(inputs, resolved, undefined, env(radix)).outputs.out[0]
}

describe('table gate', () => {
  it('holds an answer for two inputs at the largest radix', () => {
    expect(TABLE_CELLS).toBe(256)
    expect(tableCell(2, 0, 0)).toBe('c0')
    expect(tableCell(2, 1, 2)).toBe('c18')
    expect(tableCell(2, 15, 15)).toBe('c255')
    expect(tableCell(1, 3)).toBe('c3')
  })

  it('answers X until the table is filled in', () => {
    expect(run({}, [0, 1], 2)).toBe(X)
  })

  it('looks up two inputs by row and column', () => {
    // XOR at radix 2, written out by hand.
    const xor = {
      [tableCell(2, 0, 0)]: 0,
      [tableCell(2, 0, 1)]: 1,
      [tableCell(2, 1, 0)]: 1,
      [tableCell(2, 1, 1)]: 0,
    }
    expect(run(xor, [0, 0], 2)).toBe(0)
    expect(run(xor, [0, 1], 2)).toBe(1)
    expect(run(xor, [1, 0], 2)).toBe(1)
    expect(run(xor, [1, 1], 2)).toBe(0)
  })

  it('looks up one input in a row', () => {
    const cycle = { inputs: 1, c0: 1, c1: 2, c2: 0 }
    expect(run(cycle, [0], 3)).toBe(1)
    expect(run(cycle, [1], 3)).toBe(2)
    expect(run(cycle, [2], 3)).toBe(0)
    expect(tableGate.ports(resolveParams(tableGate, cycle)).map((port) => port.name)).toEqual([
      'in0',
      'out',
    ])
  })

  it('treats unknown and floating inputs as X', () => {
    const filled = { [tableCell(2, 0, 0)]: 1 }
    expect(run(filled, [X, 0], 2)).toBe(X)
    expect(run(filled, [0, Z], 2)).toBe(X)
  })

  it('reads an answer the radix has no room for as X', () => {
    const params = { inputs: 1, c0: 2, c1: 1 }
    expect(run(params, [0], 3)).toBe(2)
    expect(run(params, [0], 2)).toBe(X)
    expect(run(params, [1], 2)).toBe(1)
  })

  it('keeps its answers when the radix grows', () => {
    const params = { inputs: 1, c0: 1, c1: 0 }
    expect(run(params, [1], 2)).toBe(0)
    expect(run(params, [1], 5)).toBe(0)
    expect(run(params, [4], 5)).toBe(X)
  })

  it('shows its own table in the palette', () => {
    const table = gateTable(tableGate, 3)
    expect(table?.inputs).toBe(2)
    expect(table?.rows.flat().every((digit) => digit === X)).toBe(true)
  })
})
