import { t } from '../i18n/index.ts'
import type { CircuitDoc } from './document.ts'
import { autoLayout } from './layout.ts'
import { gateBuilder, sumOfProducts } from './sumOfProducts.ts'
import type { Cube } from './sumOfProducts.ts'
import type { TruthTable } from './truthTable.ts'

/*
 * Logic written as text, both ways: an expression the user types becomes a
 * small circuit, and the truth table of a part becomes an expression.
 *
 * The operators are those of the gates, so they mean the same at radix 2
 * and reduce to Boolean logic there: AND is the smaller value, OR the
 * larger, NOT is (n-1)-x, XOR is the sum modulo n, and `x=v` is the top
 * value where x is v and 0 elsewhere. Two ways of writing each are read:
 *
 *   OR   |  +  ∨          XOR  ^  ⊕          AND  &  *  ·  ∧, or two terms side by side
 *   NOT  ~x  !x  ¬x  x'   a value  x=2  x==2  a constant  0 to n-1
 *
 * Binding, loosest first: OR, XOR, AND, NOT. The circuit is built from the
 * expression's truth table as a sum of products (`sumOfProducts.ts`), so it
 * comes out small whatever way the expression was written.
 *
 * The text may be pasted from anywhere, so its length, its nesting and the
 * rows of its table are bounded, and a mistake is reported with its column.
 */

/** The longest expression read, in characters. */
export const MAX_EXPRESSION_LENGTH = 2000
/** The most rows the truth table of an expression may have. */
export const MAX_EXPRESSION_ROWS = 4096
/** How deep brackets and NOTs may nest. */
const MAX_DEPTH = 64
/** The longest name of a variable. */
export const MAX_VARIABLE_NAME = 16

export type Expr =
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'const'; readonly value: number }
  | { readonly kind: 'is'; readonly name: string; readonly value: number }
  | { readonly kind: 'not'; readonly arg: Expr }
  | { readonly kind: 'and' | 'or' | 'xor'; readonly args: readonly Expr[] }

/** A mistake in an expression, at a column counted from 1. */
export interface ExpressionError {
  readonly message: string
  readonly column: number
}

export interface Parsed {
  readonly expr: Expr
  /** The variables in the order of their names, as the switches and the table have them. */
  readonly variables: readonly string[]
}

type Token =
  | { readonly kind: 'name'; readonly text: string; readonly at: number }
  | { readonly kind: 'number'; readonly value: number; readonly at: number }
  | { readonly kind: 'op'; readonly text: string; readonly at: number }
  | { readonly kind: 'end'; readonly at: number }

const OR = new Set(['|', '+', '∨'])
const XOR = new Set(['^', '⊕'])
const AND = new Set(['&', '*', '·', '∧'])
const NOT = new Set(['~', '!', '¬'])
const OPERATORS = new Set([...OR, ...XOR, ...AND, ...NOT, "'", '(', ')', '=', '=='])

class Mistake extends Error {
  readonly column: number
  constructor(message: string, column: number) {
    super(message)
    this.column = column
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const char = text[at]
    if (/\s/.test(char)) {
      at++
    } else if (/[A-Za-z_]/.test(char)) {
      const start = at
      while (at < text.length && /[A-Za-z0-9_]/.test(text[at])) at++
      const name = text.slice(start, at)
      if (name.length > MAX_VARIABLE_NAME) {
        throw new Mistake(
          t('The name “{name}…” is longer than {most} letters.', { name: name.slice(0, 8), most: MAX_VARIABLE_NAME }),
          start + 1,
        )
      }
      tokens.push({ kind: 'name', text: name, at: start + 1 })
    } else if (/[0-9]/.test(char)) {
      const start = at
      while (at < text.length && /[0-9]/.test(text[at])) at++
      tokens.push({ kind: 'number', value: Number(text.slice(start, at).slice(0, 6)), at: start + 1 })
    } else if (char === '=' && text[at + 1] === '=') {
      tokens.push({ kind: 'op', text: '==', at: at + 1 })
      at += 2
    } else if (OPERATORS.has(char) || char === '’') {
      tokens.push({ kind: 'op', text: char === '’' ? "'" : char, at: at + 1 })
      at++
    } else {
      throw new Mistake(t('“{char}” is not part of an expression.', { char }), at + 1)
    }
  }
  tokens.push({ kind: 'end', at: text.length + 1 })
  return tokens
}

/** Reads an expression at `radix`, or says what is wrong with it and where. */
export function parseExpression(text: string, radix: number): Parsed | ExpressionError {
  if (text.length > MAX_EXPRESSION_LENGTH) {
    return {
      message: t('An expression is at most {most} characters long.', { most: MAX_EXPRESSION_LENGTH }),
      column: MAX_EXPRESSION_LENGTH + 1,
    }
  }
  try {
    const tokens = tokenize(text)
    let index = 0
    let depth = 0
    const names = new Set<string>()
    const peek = (): Token => tokens[index]
    const isOp = (token: Token, set: ReadonlySet<string>): boolean => token.kind === 'op' && set.has(token.text)
    const startsTerm = (token: Token): boolean =>
      token.kind === 'name' || token.kind === 'number' || isOp(token, NOT) || (token.kind === 'op' && token.text === '(')
    // What a token is written as. The end never reaches a message: it has messages of its own.
    const shown = (token: Token): string =>
      token.kind === 'end' ? '' : token.kind === 'number' ? String(token.value) : token.text
    const digit = (token: Token): number => {
      if (token.kind !== 'number') throw new Mistake(t('A value is missing after “=”.'), token.at)
      if (token.value >= radix) {
        throw new Mistake(
          t('Radix {radix} has no value {value}; the values are 0 to {top}.', { radix, value: token.value, top: radix - 1 }),
          token.at,
        )
      }
      return token.value
    }
    const deeper = (at: number): void => {
      if (++depth > MAX_DEPTH) throw new Mistake(t('The expression nests more than {most} deep.', { most: MAX_DEPTH }), at)
    }

    const list = (kind: 'and' | 'or' | 'xor', args: Expr[]): Expr => (args.length === 1 ? args[0] : { kind, args })

    const orExpr = (): Expr => {
      const args = [xorExpr()]
      while (isOp(peek(), OR)) {
        index++
        args.push(xorExpr())
      }
      return list('or', args)
    }
    const xorExpr = (): Expr => {
      const args = [andExpr()]
      while (isOp(peek(), XOR)) {
        index++
        args.push(andExpr())
      }
      return list('xor', args)
    }
    const andExpr = (): Expr => {
      const args = [unary()]
      for (;;) {
        if (isOp(peek(), AND)) index++
        else if (!startsTerm(peek())) break
        args.push(unary())
      }
      return list('and', args)
    }
    const unary = (): Expr => {
      const token = peek()
      if (isOp(token, NOT)) {
        index++
        deeper(token.at)
        const arg = unary()
        depth--
        return { kind: 'not', arg }
      }
      let expr = atom()
      while (peek().kind === 'op' && (peek() as { text: string }).text === "'") {
        index++
        expr = { kind: 'not', arg: expr }
      }
      return expr
    }
    const atom = (): Expr => {
      const token = peek()
      index++
      if (token.kind === 'number') return { kind: 'const', value: digit(token) }
      if (token.kind === 'name') {
        names.add(token.text)
        const next = peek()
        if (next.kind === 'op' && (next.text === '=' || next.text === '==')) {
          index++
          const value = digit(peek())
          index++
          return { kind: 'is', name: token.text, value }
        }
        return { kind: 'var', name: token.text }
      }
      if (token.kind === 'op' && token.text === '(') {
        deeper(token.at)
        const inner = orExpr()
        depth--
        const close = peek()
        if (!(close.kind === 'op' && close.text === ')')) throw new Mistake(t('A “)” is missing here.'), close.at)
        index++
        return inner
      }
      if (token.kind === 'end') throw new Mistake(t('The expression ends where a name or value should come.'), token.at)
      throw new Mistake(t('“{token}” cannot start a term here.', { token: shown(token) }), token.at)
    }

    if (peek().kind === 'end') return { message: t('Type an expression, such as a & ~b | c.'), column: 1 }
    const expr = orExpr()
    const rest = peek()
    if (rest.kind !== 'end') {
      const message =
        rest.kind === 'op' && rest.text === ')'
          ? t('This “)” has no “(” to close.')
          : t('“{token}” is not expected here.', { token: shown(rest) })
      throw new Mistake(message, rest.at)
    }
    const variables = [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    if (radix ** variables.length > MAX_EXPRESSION_ROWS) {
      return {
        message: t(
          'With {count} variables at radix {radix} the table has {rows} rows, and circuits are built for at most {most}.',
          { count: variables.length, radix, rows: radix ** variables.length, most: MAX_EXPRESSION_ROWS },
        ),
        column: 1,
      }
    }
    return { expr, variables }
  } catch (error) {
    if (error instanceof Mistake) return { message: error.message, column: error.column }
    throw error
  }
}

export function isExpressionError(result: Parsed | ExpressionError): result is ExpressionError {
  return 'message' in result
}

/** The digit an expression gives when each variable has the value in `values`. */
export function evaluateExpression(expr: Expr, values: ReadonlyMap<string, number>, radix: number): number {
  const top = radix - 1
  switch (expr.kind) {
    case 'var':
      return values.get(expr.name) ?? 0
    case 'const':
      return expr.value
    case 'is':
      return values.get(expr.name) === expr.value ? top : 0
    case 'not':
      return top - evaluateExpression(expr.arg, values, radix)
    case 'and':
      return Math.min(...expr.args.map((arg) => evaluateExpression(arg, values, radix)))
    case 'or':
      return Math.max(...expr.args.map((arg) => evaluateExpression(arg, values, radix)))
    case 'xor':
      return expr.args.reduce((sum, arg) => (sum + evaluateExpression(arg, values, radix)) % radix, 0)
  }
}

/** The value of each variable on a row of `minimize`, the first variable first. */
function valuesOf(variables: readonly string[], row: readonly number[]): Map<string, number> {
  return new Map(variables.map((name, index) => [name, row[index]]))
}

/**
 * The circuit of a parsed expression: a switch for each variable, named
 * after it, gates for the sum of products, and an output part `output`.
 */
export function expressionCircuit(parsed: Parsed, radix: number, output: string): CircuitDoc {
  const builder = gateBuilder(radix)
  const switches = parsed.variables.map((name) => ({
    pin: { component: builder.place('input', { label: name }), port: 'out' },
  }))
  const result = builder.build(switches, (row) =>
    evaluateExpression(parsed.expr, valuesOf(parsed.variables, row), radix),
  )
  const sink = builder.place('output', { label: output })
  builder.connect(result, { component: sink, port: 'in' })
  return autoLayout(builder.doc())
}

/** The terms of a sum of products written as an expression this module reads back. */
export function writeSumOfProducts(
  names: readonly string[],
  radix: number,
  terms: readonly { readonly level: number; readonly cubes: readonly Cube[] }[],
): string {
  const top = radix - 1
  const products: string[] = []
  for (const { level, cubes } of terms) {
    for (const cube of cubes) {
      const parts = cube.flatMap((want, index) => {
        if (want === -1) return []
        if (radix === 2) return [want === 1 ? names[index] : `~${names[index]}`]
        return [`${names[index]}=${want}`]
      })
      if (level < top || parts.length === 0) parts.unshift(String(level))
      products.push(parts.join(' & '))
    }
  }
  return products.length === 0 ? '0' : products.join(' | ')
}

/** Names of truth-table columns made into names an expression can hold, each different. */
export function variableNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((name, index) => {
    let base = name.replace(/[^A-Za-z0-9_]/g, '').slice(0, MAX_VARIABLE_NAME - 3)
    if (!/^[A-Za-z_]/.test(base)) base = `x${base === '' ? index : base}`.slice(0, MAX_VARIABLE_NAME - 3)
    let unique = base
    for (let number = 2; used.has(unique); number++) unique = `${base}${number}`
    used.add(unique)
    return unique
  })
}

/** The expression of one output of a truth table, or why it has none. */
export type TableExpression = { readonly kind: 'expression'; readonly text: string } | { readonly kind: 'none'; readonly reason: string }

/**
 * The output `output` of a truth table as a small sum of products, over the
 * inputs named `names` (by default as the table names them). Every input
 * and the output must be one digit wide.
 */
export function tableExpression(
  table: TruthTable & { kind: 'table' },
  output: number,
  radix: number,
  names: readonly string[] = table.inputs.map((column) => column.name),
): TableExpression {
  if (table.inputs.some((column) => column.width !== 1) || table.outputs[output].width !== 1) {
    return { kind: 'none', reason: t('Only a part whose inputs and output are single wires has an expression.') }
  }
  const values = table.rows.map((row) => row.outputs[output][0])
  if (values.some((value) => !(value >= 0 && value < radix))) {
    return { kind: 'none', reason: t('Some rows give X or Z, which an expression cannot.') }
  }
  const count = table.inputs.length
  const rowIndex = (row: readonly number[]): number => row.reduce((sum, digit) => sum * radix + digit, 0)
  const terms = sumOfProducts(count, radix, (row) => values[rowIndex(row)])
  return { kind: 'expression', text: writeSumOfProducts(variableNames(names), radix, terms) }
}

/** The values of `digits` digits at `radix`, ordered so neighbours differ in one digit by one step. */
export function grayCode(digits: number, radix: number): number[][] {
  if (digits === 0) return [[]]
  const rest = grayCode(digits - 1, radix)
  const codes: number[][] = []
  for (let first = 0; first < radix; first++) {
    const order = first % 2 === 0 ? rest : [...rest].reverse()
    for (const tail of order) codes.push([first, ...tail])
  }
  return codes
}

/** The most rows or columns a Karnaugh map is drawn with. */
export const MAX_MAP_SIDE = 9

/** A Karnaugh map: the row of the truth table in each cell. */
export type KarnaughMap =
  | {
      readonly kind: 'map'
      /** How many of the inputs, from the first, run down the side. */
      readonly rowInputs: number
      /** The values of the side's inputs, row by row, the first input first. */
      readonly rows: readonly (readonly number[])[]
      /** The values of the top's inputs, column by column. */
      readonly columns: readonly (readonly number[])[]
      /** The truth-table row of each cell, by row and then column. */
      readonly cells: readonly (readonly number[])[]
    }
  | { readonly kind: 'none'; readonly reason: string }

/**
 * The Karnaugh map of a function of `inputs` single-digit inputs: half of
 * them down the side, the rest across, each in Gray order so that cells
 * that touch differ in one input.
 */
export function karnaughMap(inputs: number, radix: number): KarnaughMap {
  if (inputs < 2 || inputs > 4) return { kind: 'none', reason: t('A Karnaugh map is drawn for 2 to 4 inputs.') }
  const rowInputs = Math.floor(inputs / 2)
  const columnInputs = inputs - rowInputs
  if (radix ** columnInputs > MAX_MAP_SIDE) {
    return { kind: 'none', reason: t('At radix {radix} the map of {count} inputs is too wide to draw here.', { radix, count: inputs }) }
  }
  const rows = grayCode(rowInputs, radix)
  const columns = grayCode(columnInputs, radix)
  const index = (digits: readonly number[]): number => digits.reduce((sum, digit) => sum * radix + digit, 0)
  return {
    kind: 'map',
    rowInputs,
    rows,
    columns,
    cells: rows.map((row) => columns.map((column) => index([...row, ...column]))),
  }
}
