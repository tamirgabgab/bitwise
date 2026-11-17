import { describe, expect, it } from 'vitest'
import { builtinComponents } from './components/index.ts'
import { gateTable } from './table.ts'

const table = (type: string, radix: number) => gateTable(builtinComponents.get(type), radix)

describe('gateTable', () => {
  it('is the truth table at radix 2', () => {
    expect(table('and', 2)).toEqual({ inputs: 2, rows: [[0, 0], [0, 1]] })
    expect(table('nand', 2)?.rows).toEqual([[1, 1], [1, 0]])
    expect(table('xor', 2)?.rows).toEqual([[0, 1], [1, 0]])
    expect(table('not', 2)).toEqual({ inputs: 1, rows: [[1, 0]] })
  })

  it('follows the rule of the gate at radix 3', () => {
    expect(table('and', 3)?.rows).toEqual([[0, 0, 0], [0, 1, 1], [0, 1, 2]])
    expect(table('nand', 3)?.rows).toEqual([[1, 1, 1], [1, 2, 2], [1, 2, 0]])
    expect(table('add', 3)?.rows).toEqual([[0, 1, 2], [1, 2, 0], [2, 0, 1]])
    expect(table('not', 3)?.rows).toEqual([[2, 1, 0]])
    expect(table('shift', 3)?.rows).toEqual([[1, 2, 0]])
  })

  it('has radix rows and columns', () => {
    const big = table('or', 16)
    expect(big?.rows).toHaveLength(16)
    expect(big?.rows.every((row) => row.length === 16)).toBe(true)
    expect(big?.rows[3][9]).toBe(9)
  })

  it('has no table for a part that is no simple gate', () => {
    for (const type of ['input', 'const', 'output', 'clock', 'cycle', 'dff', 'jkff', 'sr']) {
      expect(table(type, 2)).toBeUndefined()
    }
    expect(table('tobits', 4)).toBeUndefined()
    expect(table('display', 2)).toBeUndefined()
  })

  it('reads two bits as a digit', () => {
    expect(table('frombits', 4)?.rows[3][3]).toBe(3)
    expect(table('frombits', 4)?.rows[3][0]).toBe(1)
  })
})
