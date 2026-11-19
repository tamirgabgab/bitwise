import { describe, expect, it } from 'vitest'
import { Simulator, formatSignal } from '../core/index.ts'
import type { ComponentId } from '../core/index.ts'
import { addComponent, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'
import {
  MAX_EXPRESSION_LENGTH,
  evaluateExpression,
  expressionCircuit,
  grayCode,
  isExpressionError,
  karnaughMap,
  parseExpression,
  tableExpression,
  variableNames,
} from './expression.ts'
import type { Parsed } from './expression.ts'
import { SimBridge } from './simBridge.ts'
import { digitsOf } from './sumOfProducts.ts'
import { truthTable } from './truthTable.ts'

function parsed(text: string, radix = 2): Parsed {
  const result = parseExpression(text, radix)
  if (isExpressionError(result)) throw new Error(`${result.message} (column ${result.column})`)
  return result
}

/** The expression's digit on every row, the first variable most significant. */
function column(text: string, radix = 2): number[] {
  const { expr, variables } = parsed(text, radix)
  return Array.from({ length: radix ** variables.length }, (_, row) => {
    const digits = digitsOf(row, radix, variables.length).reverse()
    return evaluateExpression(expr, new Map(variables.map((name, index) => [name, digits[index]])), radix)
  })
}

/** What the built circuit gives on every row, read through the simulator. */
function circuitColumn(doc: CircuitDoc, variables: readonly string[], radix: number): number[] {
  const bridge = new SimBridge(new Simulator(undefined, radix))
  bridge.sync(doc)
  const find = (type: string, label: string): ComponentId => {
    const part = Object.values(doc.components).find((component) => component.type === type && component.label === label)
    return bridge.simComponent(part!.id)!
  }
  const output = find('output', 'F')
  return Array.from({ length: radix ** variables.length }, (_, row) => {
    const digits = digitsOf(row, radix, variables.length).reverse()
    variables.forEach((name, index) => bridge.sim.setState(find('input', name), [digits[index]]))
    bridge.sim.settle()
    return Number.parseInt(formatSignal(bridge.sim.readPin({ component: output, port: 'in' })), 16)
  })
}

describe('reading an expression', () => {
  it('reads both ways of writing at radix 2', () => {
    expect(column('a & ~b | c')).toEqual(column("a·b' + c"))
    expect(column('a & ~b | c')).toEqual(column("a b' + c"))
    expect(column('a ^ b')).toEqual([0, 1, 1, 0])
    expect(column('!(a * b)')).toEqual([1, 1, 1, 0])
    expect(column('a ⊕ b ∨ ¬a ∧ b')).toEqual(column('(a ^ b) | (~a & b)'))
  })

  it('binds AND tighter than XOR and XOR tighter than OR', () => {
    expect(column('a | b ^ c & d')).toEqual(column('a | (b ^ (c & d))'))
  })

  it('lists the variables by name', () => {
    expect(parsed('c & a10 & a2 | b').variables).toEqual(['a2', 'a10', 'b', 'c'])
  })

  it('uses the gates of radix n', () => {
    // NOT is 2-x, AND min, OR max, XOR the sum modulo 3, x=v the top value or 0.
    expect(column('~a', 3)).toEqual([2, 1, 0])
    expect(column('a & b', 3)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 2])
    expect(column('a ^ b', 3)).toEqual([0, 1, 2, 1, 2, 0, 2, 0, 1])
    expect(column('a=1', 3)).toEqual([0, 2, 0])
    expect(column('a==2 | 1', 3)).toEqual([1, 1, 2])
  })

  it('says what is wrong and where', () => {
    const at = (text: string, radix = 2): [string, number] => {
      const result = parseExpression(text, radix)
      if (!isExpressionError(result)) throw new Error('read')
      return [result.message, result.column]
    }
    expect(at('a & ')).toEqual(['The expression ends where a name or value should come.', 5])
    expect(at('(a | b')[1]).toBe(7)
    expect(at('a | b)')[0]).toMatch(/no “\(”/)
    expect(at('a $ b')).toEqual(['“$” is not part of an expression.', 3])
    expect(at('a=3', 3)[0]).toMatch(/no value 3/)
    expect(at('2')[1]).toBe(1)
    expect(at('')[0]).toMatch(/Type an expression/)
    expect(at('a=')[0]).toMatch(/value is missing/)
  })

  it('keeps its limits', () => {
    expect(isExpressionError(parseExpression('a'.repeat(MAX_EXPRESSION_LENGTH + 1), 2))).toBe(true)
    expect(isExpressionError(parseExpression('~'.repeat(100) + 'a', 2))).toBe(true)
    expect(isExpressionError(parseExpression('('.repeat(100) + 'a' + ')'.repeat(100), 2))).toBe(true)
    const many = Array.from({ length: 13 }, (_, index) => `v${index}`).join(' | ')
    expect(parseExpression(many, 2)).toMatchObject({ message: expect.stringMatching(/8192 rows/) })
  })
})

describe('building a circuit from an expression', () => {
  const cases: [string, number][] = [
    ['a & ~b | c', 2],
    ['a ^ b ^ c', 2],
    ['1', 2],
    ['0', 2],
    ['a | ~a', 2],
    ['a & b | ~a & c | b & c', 2],
    ['a ^ b', 3],
    ['(a=1) & ~b | 1 & c', 3],
    ['~(a & b)', 4],
  ]
  for (const [text, radix] of cases) {
    it(`gives the same table as ${text} at radix ${radix}`, () => {
      const result = parsed(text, radix)
      const doc = expressionCircuit(result, radix, 'F')
      expect(circuitColumn(doc, result.variables, radix)).toEqual(column(text, radix))
    })
  }

  it('makes the sum of products small', () => {
    const doc = expressionCircuit(parsed('a & b | a & ~b'), 2, 'F')
    // a & (b | ~b) is a: one switch wired straight to the output.
    const types = Object.values(doc.components).map((part) => part.type).sort()
    expect(types).toEqual(['input', 'input', 'output'])
  })
})

describe('the expression of a truth table', () => {
  const tableOf = (type: string, radix: number, params: Record<string, number> = {}) => {
    const doc = addComponent(emptyDoc(), type, { x: 0, y: 0 }, { params }).doc
    const table = truthTable(doc.components.c1, {}, radix)
    if (table?.kind !== 'table') throw new Error('no table')
    return table
  }

  it('writes a sum of products that reads back to the same table', () => {
    for (const [type, radix] of [['and', 2], ['xor', 2], ['nand', 3], ['or', 3], ['xor', 3]] as const) {
      const table = tableOf(type, radix)
      const written = tableExpression(table, 0, radix)
      if (written.kind !== 'expression') throw new Error(written.reason)
      expect(column(written.text, radix), `${type} at ${radix}: ${written.text}`).toEqual(
        table.rows.map((row) => row.outputs[0][0]),
      )
    }
  })

  it('writes AND and XOR as expected at radix 2', () => {
    expect(tableExpression(tableOf('and', 2), 0, 2)).toEqual({ kind: 'expression', text: 'in0 & in1' })
    expect(tableExpression(tableOf('xor', 2), 0, 2)).toMatchObject({ text: expect.stringMatching(/~in0 & in1|in0 & ~in1/) })
  })

  it('has none for a bus', () => {
    expect(tableExpression(tableOf('adder', 2, { width: 2 }), 0, 2).kind).toBe('none')
  })

  it('makes column names into names it can read', () => {
    expect(variableNames(['A', 'A', 'in 1', '2x', ''])).toEqual(['A', 'A2', 'in1', 'x2x', 'x4'])
  })
})

describe('Karnaugh maps', () => {
  it('orders values so neighbours differ in one digit', () => {
    expect(grayCode(2, 2)).toEqual([[0, 0], [0, 1], [1, 1], [1, 0]])
    const codes = grayCode(2, 3)
    expect(codes).toHaveLength(9)
    for (let index = 1; index < codes.length; index++) {
      const changed = codes[index].filter((digit, place) => digit !== codes[index - 1][place])
      expect(changed).toHaveLength(1)
    }
  })

  it('puts half the inputs down the side', () => {
    const map = karnaughMap(3, 2)
    if (map.kind !== 'map') throw new Error(map.reason)
    expect(map.rowInputs).toBe(1)
    expect(map.cells).toEqual([
      [0, 1, 3, 2],
      [4, 5, 7, 6],
    ])
  })

  it('draws up to four inputs and nine columns', () => {
    expect(karnaughMap(4, 3).kind).toBe('map')
    expect(karnaughMap(1, 2).kind).toBe('none')
    expect(karnaughMap(5, 2).kind).toBe('none')
    expect(karnaughMap(3, 4).kind).toBe('none')
  })
})
