/*
 * Reads Verilog text into a tree, for `verilogImport.ts` to build circuits
 * from. Only the part of the language that describes a circuit is read:
 * modules, wires, gates, instances, `assign` and `always`. Whatever else it
 * meets is refused with the place of it in the text, never skipped, so that
 * a circuit is not built from half of what was written.
 */

import { msg, t } from '../i18n/index.ts'

/** A mistake in the text, or something this reader does not take, with its place. */
export class VerilogError extends Error {
  readonly offset: number
  constructor(message: string, offset: number) {
    super(message)
    this.offset = offset
  }
}

/** The widest number or signal that is read, the widest bus a part takes. */
export const MAX_VERILOG_WIDTH = 64

export type Expr =
  | { readonly kind: 'num'; readonly at: number; readonly value: bigint; readonly size?: number }
  | { readonly kind: 'id'; readonly at: number; readonly name: string }
  /** `name[index]` */
  | { readonly kind: 'bit'; readonly at: number; readonly name: string; readonly index: Expr }
  /** `name[high:low]`, or `name[base +: width]` and `name[base -: width]` with `step`. */
  | {
      readonly kind: 'part'
      readonly at: number
      readonly name: string
      readonly high: Expr
      readonly low: Expr
      readonly step?: '+' | '-'
    }
  | { readonly kind: 'concat'; readonly at: number; readonly parts: readonly Expr[] }
  | { readonly kind: 'repeat'; readonly at: number; readonly count: Expr; readonly value: Expr }
  | { readonly kind: 'unary'; readonly at: number; readonly op: string; readonly arg: Expr }
  | { readonly kind: 'binary'; readonly at: number; readonly op: string; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'cond'; readonly at: number; readonly test: Expr; readonly then: Expr; readonly else: Expr }

export type Stmt =
  | { readonly kind: 'block'; readonly at: number; readonly body: readonly Stmt[] }
  | { readonly kind: 'if'; readonly at: number; readonly test: Expr; readonly then: Stmt; readonly else?: Stmt }
  | {
      readonly kind: 'case'
      readonly at: number
      readonly subject: Expr
      readonly arms: readonly { readonly values: readonly Expr[]; readonly body: Stmt }[]
      readonly otherwise?: Stmt
    }
  | { readonly kind: 'set'; readonly at: number; readonly target: Expr; readonly value: Expr; readonly blocking: boolean }

export interface Range {
  readonly high: Expr
  readonly low: Expr
}

/** One name of a declaration. A port of the old style is declared more than once. */
export interface Decl {
  readonly at: number
  readonly name: string
  readonly dir?: 'input' | 'output'
  /** Said to be a `reg` (or `logic`), and so given its value in an `always`. */
  readonly reg?: true
  /** Said to be a net or a variable, and not only a port. */
  readonly net?: true
  readonly range?: Range
  /** `reg q = 0`: what it starts with. */
  readonly init?: Expr
  /** `reg [7:0] mem [0:15]`: a memory, and the numbers of its words. */
  readonly words?: Range
}

export interface Param {
  readonly at: number
  readonly name: string
  readonly range?: Range
  readonly value: Expr
}

export interface Edge {
  readonly at: number
  readonly edge: 'posedge' | 'negedge'
  readonly signal: Expr
}

export type Item =
  | { readonly kind: 'assign'; readonly at: number; readonly target: Expr; readonly value: Expr }
  | { readonly kind: 'gate'; readonly at: number; readonly type: string; readonly name?: string; readonly pins: readonly Expr[] }
  | {
      readonly kind: 'instance'
      readonly at: number
      readonly module: string
      readonly name: string
      /** `.port(value)`; a value left out is a pin left open. */
      readonly named?: readonly { readonly at: number; readonly port: string; readonly value?: Expr }[]
      readonly placed?: readonly (Expr | undefined)[]
    }
  /** With no edges it is combinational: `always @(*)` and `always_comb`. */
  | { readonly kind: 'always'; readonly at: number; readonly edges: readonly Edge[]; readonly body: Stmt }
  /** Read only for the words a memory starts with. */
  | { readonly kind: 'initial'; readonly at: number; readonly body: Stmt }

export interface Module {
  readonly at: number
  readonly name: string
  /** The ports in the order of the header. */
  readonly ports: readonly string[]
  readonly decls: readonly Decl[]
  readonly params: readonly Param[]
  readonly items: readonly Item[]
}

interface Token {
  readonly kind: 'id' | 'num' | 'op' | 'end'
  readonly text: string
  readonly at: number
  readonly value?: bigint
  readonly size?: number
}

const OPERATORS = [
  '<<<', '>>>', '===', '!==',
  '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '~&', '~|', '~^', '^~', '**', '+:', '-:',
  '(', ')', '[', ']', '{', '}', ';', ',', '.', ':', '=', '+', '-', '*', '/', '%', '&', '|', '^', '~', '!',
  '<', '>', '?', '#', '@',
] as const

const NUMBER = /(?:(\d[\d_]*)\s*)?'([sS]?)([bBoOdDhH])\s*([0-9a-fA-FxXzZ?_]+)|(\d[\d_]*)(\.\d)?/y
const NAME = /[A-Za-z_][A-Za-z0-9_$]*/y
const DIGIT_BITS: Readonly<Record<string, number>> = { b: 1, o: 3, h: 4 }

function readNumber(match: RegExpExecArray, at: number): Token {
  const [text, sized, signed, baseLetter, digits, plain, fraction] = match
  if (fraction !== undefined) throw new VerilogError(t('Only whole numbers are read.'), at)
  if (plain !== undefined) return { kind: 'num', text, at, value: BigInt(plain.replaceAll('_', '')) }
  if (signed !== '') throw new VerilogError(t('Signed numbers are not read.'), at)
  const size = sized === undefined ? undefined : Number(sized.replaceAll('_', ''))
  if (size !== undefined && (size < 1 || size > MAX_VERILOG_WIDTH)) {
    throw new VerilogError(t('A number is 1 to {max} bits wide.', { max: MAX_VERILOG_WIDTH }), at)
  }
  const base = baseLetter.toLowerCase()
  const clean = digits.replaceAll('_', '').toLowerCase()
  if (/[z?]/.test(clean)) throw new VerilogError(t('A bit left floating (z) is not read.'), at)
  let value = 0n
  if (base === 'd') {
    // A decimal number is unknown as a whole or not at all, and unknown reads as 0.
    if (!/^\d+$/.test(clean) && clean !== 'x') throw new VerilogError(t('This is not a decimal number.'), at)
    value = clean === 'x' ? 0n : BigInt(clean)
  } else {
    const each = DIGIT_BITS[base]
    for (const digit of clean) {
      const worth = digit === 'x' ? 0 : Number.parseInt(digit, 16)
      if (Number.isNaN(worth) || worth >= 2 ** each) throw new VerilogError(t('This digit does not belong to the base of the number.'), at)
      value = (value << BigInt(each)) | BigInt(worth)
    }
  }
  if (size !== undefined) value &= (1n << BigInt(size)) - 1n
  return { kind: 'num', text, at, value, size }
}

function tokensOf(text: string): Token[] {
  const tokens: Token[] = []
  const end = text.length
  let at = 0
  while (at < end) {
    const char = text[at]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f') {
      at++
    } else if (text.startsWith('//', at)) {
      const stop = text.indexOf('\n', at)
      at = stop === -1 ? end : stop
    } else if (text.startsWith('/*', at)) {
      const stop = text.indexOf('*/', at + 2)
      if (stop === -1) throw new VerilogError(t('This comment is never closed.'), at)
      at = stop + 2
    } else if (text.startsWith('(*', at) && text[at + 2] !== ')') {
      // An attribute says nothing about the circuit.
      const stop = text.indexOf('*)', at + 2)
      if (stop === -1) throw new VerilogError(t('This attribute is never closed.'), at)
      at = stop + 2
    } else if (char === '`') {
      // A directive such as `timescale. A macro would change the text, so it is refused.
      if (/^`(define|include|ifdef|ifndef|else|endif|undef)\b/.test(text.slice(at, at + 9))) {
        throw new VerilogError(t('Macros and included files are not read. Write the text out in full.'), at)
      }
      const stop = text.indexOf('\n', at)
      at = stop === -1 ? end : stop
    } else if ((char >= '0' && char <= '9') || char === "'") {
      NUMBER.lastIndex = at
      const match = NUMBER.exec(text)
      if (!match) throw new VerilogError(t('This number is not understood.'), at)
      tokens.push(readNumber(match, at))
      at += match[0].length
    } else if (char === '$' || char === '\\') {
      throw new VerilogError(
        char === '$' ? t('System tasks such as $display are not read.') : t('Escaped names are not read.'),
        at,
      )
    } else {
      NAME.lastIndex = at
      const name = NAME.exec(text)
      if (name) {
        tokens.push({ kind: 'id', text: name[0], at })
        at += name[0].length
        continue
      }
      const op = OPERATORS.find((item) => text.startsWith(item, at))
      if (!op) throw new VerilogError(t('“{char}” is not understood here.', { char }), at)
      tokens.push({ kind: 'op', text: op, at })
      at += op.length
    }
  }
  tokens.push({ kind: 'end', text: '', at: end })
  return tokens
}

const GATES = new Set(['and', 'or', 'xor', 'nand', 'nor', 'xnor', 'not', 'buf'])

/** Words of the language that are understood nowhere, each with why, shown with `t`. */
const REFUSED: Readonly<Record<string, string>> = {
  inout: msg('A port that is both an input and an output is not read.'),
  signed: msg('Signed numbers are not read.'),
  integer: msg('Only wires and regs are read, not integers.'),
  real: msg('Only wires and regs are read, not real numbers.'),
  time: msg('Only wires and regs are read.'),
  genvar: msg('Generated code is not read. Write each part out.'),
  generate: msg('Generated code is not read. Write each part out.'),
  for: msg('Loops are not read. Write each part out.'),
  while: msg('Loops are not read.'),
  repeat: msg('Loops are not read.'),
  forever: msg('Loops are not read.'),
  function: msg('Functions are not read. Write the expression where it is used.'),
  task: msg('Tasks are not read.'),
  initial: msg('An initial block is not read. A register starts at 0.'),
  always_latch: msg('A latch is not read. Give the value on a clock edge.'),
  casez: msg('Only a plain case is read.'),
  casex: msg('Only a plain case is read.'),
  defparam: msg('Give a module its numbers where it is written.'),
  specify: msg('Timing is not read.'),
  primitive: msg('Only the built-in gates are read.'),
  tri: msg('Only wires and regs are read.'),
  wand: msg('Only wires and regs are read.'),
  wor: msg('Only wires and regs are read.'),
  supply0: msg('Write 1\'b0 where the value is used.'),
  supply1: msg('Write 1\'b1 where the value is used.'),
}

/**
 * What a missing name belongs to, with what is said when something else
 * stands in its place (`{found}`) and when the text ends there. Shown with `t`.
 */
const NAMES = {
  block: {
    found: msg('The name of the block is expected here, not “{found}”.'),
    end: msg('The name of the block is expected here, not the end of the text.'),
  },
  module: {
    found: msg('The name of the module is expected here, not “{found}”.'),
    end: msg('The name of the module is expected here, not the end of the text.'),
  },
  number: {
    found: msg('The name of the number is expected here, not “{found}”.'),
    end: msg('The name of the number is expected here, not the end of the text.'),
  },
  port: {
    found: msg('The name of the port is expected here, not “{found}”.'),
    end: msg('The name of the port is expected here, not the end of the text.'),
  },
  signal: {
    found: msg('The name of the signal is expected here, not “{found}”.'),
    end: msg('The name of the signal is expected here, not the end of the text.'),
  },
  gate: {
    found: msg('The name of the gate is expected here, not “{found}”.'),
    end: msg('The name of the gate is expected here, not the end of the text.'),
  },
  used: {
    found: msg('The name of a module is expected here, not “{found}”.'),
    end: msg('The name of a module is expected here, not the end of the text.'),
  },
  part: {
    found: msg('The name of the part is expected here, not “{found}”.'),
    end: msg('The name of the part is expected here, not the end of the text.'),
  },
} as const

const RESERVED = new Set([
  ...GATES, ...Object.keys(REFUSED),
  'module', 'macromodule', 'endmodule', 'input', 'output', 'wire', 'reg', 'logic', 'assign', 'always',
  'always_comb', 'always_ff', 'begin', 'end', 'if', 'else', 'case', 'endcase', 'default', 'posedge',
  'negedge', 'or', 'parameter', 'localparam',
])

const BINARY: readonly (readonly string[])[] = [
  ['||'],
  ['&&'],
  ['|'],
  ['^', '~^', '^~'],
  ['&'],
  ['==', '!=', '===', '!=='],
  ['<', '<=', '>', '>='],
  ['<<', '>>', '<<<', '>>>'],
  ['+', '-'],
  ['*', '/', '%'],
  ['**'],
]
const UNARY = new Set(['+', '-', '!', '~', '&', '~&', '|', '~|', '^', '~^', '^~'])

/** The modules of a text, in the order they are written. */
export function parseVerilog(text: string): Module[] {
  const tokens = tokensOf(text)
  let index = 0
  const peek = (): Token => tokens[index]
  const next = (): Token => tokens[index++]
  const is = (text: string): boolean => peek().kind !== 'num' && peek().text === text
  const take = (text: string): boolean => {
    if (!is(text)) return false
    index++
    return true
  }
  /** `said.found` with the token put in, or `said.end` when the text is over. */
  const notHere = (
    token: Token,
    said: { readonly found: string; readonly end: string },
    values: Readonly<Record<string, string>> = {},
  ): string => (token.kind === 'end' ? t(said.end, values) : t(said.found, { ...values, found: token.text }))
  const EXPECTED = {
    found: msg('“{wanted}” is expected here, not “{found}”.'),
    end: msg('“{wanted}” is expected here, not the end of the text.'),
  }
  const expect = (text: string): Token => {
    if (!is(text)) {
      // What is missing belongs right after what was read last, not before what comes next.
      const last = tokens[index - 1]
      const at = last ? last.at + last.text.length : peek().at
      throw new VerilogError(notHere(peek(), EXPECTED, { wanted: text }), at)
    }
    return next()
  }
  const refuse = (): void => {
    const token = peek()
    if (token.kind === 'id' && Object.hasOwn(REFUSED, token.text)) throw new VerilogError(t(REFUSED[token.text]), token.at)
  }
  const name = (what: keyof typeof NAMES): Token => {
    refuse()
    const token = peek()
    if (token.kind !== 'id' || RESERVED.has(token.text)) throw new VerilogError(notHere(token, NAMES[what]), token.at)
    return next()
  }

  // ---- Expressions ----
  const primary = (): Expr => {
    refuse()
    const token = next()
    if (token.kind === 'num') return { kind: 'num', at: token.at, value: token.value!, size: token.size }
    if (token.kind === 'op' && token.text === '(') {
      const inner = expression()
      expect(')')
      return inner
    }
    if (token.kind === 'op' && token.text === '{') {
      const first = expression()
      if (take('{')) {
        const parts = [expression()]
        while (take(',')) parts.push(expression())
        expect('}')
        expect('}')
        return { kind: 'repeat', at: token.at, count: first, value: { kind: 'concat', at: token.at, parts } }
      }
      const parts = [first]
      while (take(',')) parts.push(expression())
      expect('}')
      return { kind: 'concat', at: token.at, parts }
    }
    if (token.kind === 'id' && !RESERVED.has(token.text)) {
      if (is('(')) throw new VerilogError(t('Functions are not read. Write the expression where it is used.'), token.at)
      if (!take('[')) return { kind: 'id', at: token.at, name: token.text }
      const first = expression()
      let picked: Expr
      if (take(':')) picked = { kind: 'part', at: token.at, name: token.text, high: first, low: expression() }
      else if (is('+:') || is('-:')) {
        const step = next().text === '+:' ? '+' : '-'
        picked = { kind: 'part', at: token.at, name: token.text, high: first, low: expression(), step }
      } else picked = { kind: 'bit', at: token.at, name: token.text, index: first }
      expect(']')
      if (is('[')) throw new VerilogError(t('A bit of a word of a memory is not read. Give the word a name of its own first.'), peek().at)
      return picked
    }
    throw new VerilogError(
      notHere(token, {
        found: msg('A value is expected here, not “{found}”.'),
        end: msg('A value is expected here, not the end of the text.'),
      }),
      token.at,
    )
  }
  const unary = (): Expr => {
    const token = peek()
    if (token.kind === 'op' && UNARY.has(token.text)) {
      next()
      return { kind: 'unary', at: token.at, op: token.text === '^~' ? '~^' : token.text, arg: unary() }
    }
    return primary()
  }
  const binary = (level: number): Expr => {
    if (level === BINARY.length) return unary()
    let left = binary(level + 1)
    while (peek().kind === 'op' && BINARY[level].includes(peek().text)) {
      const token = next()
      const op = token.text === '^~' ? '~^' : token.text === '===' ? '==' : token.text === '!==' ? '!=' : token.text
      left = { kind: 'binary', at: token.at, op, left, right: binary(level + 1) }
    }
    return left
  }
  function expression(): Expr {
    const test = binary(0)
    if (!is('?')) return test
    const at = next().at
    const then = expression()
    expect(':')
    return { kind: 'cond', at, test, then, else: expression() }
  }

  /** `#3` or `#(1, 2)`: a delay, which a drawing has no use for. */
  const delay = (): void => {
    if (!take('#')) return
    if (take('(')) {
      let depth = 1
      while (depth > 0) {
        const token = next()
        if (token.kind === 'end') throw new VerilogError(t('This delay is never closed.'), token.at)
        if (token.text === '(') depth++
        if (token.text === ')') depth--
      }
    } else next()
  }
  const range = (): Range | undefined => {
    if (!take('[')) return undefined
    const high = expression()
    expect(':')
    const low = expression()
    expect(']')
    return { high, low }
  }

  // ---- Statements ----
  const statement = (): Stmt => {
    refuse()
    const token = peek()
    if (take('begin')) {
      if (take(':')) name('block')
      const body: Stmt[] = []
      while (!take('end')) {
        if (peek().kind === 'end') throw new VerilogError(t('This “begin” has no “end”.'), token.at)
        body.push(statement())
      }
      return { kind: 'block', at: token.at, body }
    }
    if (take('if')) {
      expect('(')
      const test = expression()
      expect(')')
      const then = statement()
      return take('else')
        ? { kind: 'if', at: token.at, test, then, else: statement() }
        : { kind: 'if', at: token.at, test, then }
    }
    if (take('case')) {
      expect('(')
      const subject = expression()
      expect(')')
      const arms: { values: Expr[]; body: Stmt }[] = []
      let otherwise: Stmt | undefined
      while (!take('endcase')) {
        if (peek().kind === 'end') throw new VerilogError(t('This “case” has no “endcase”.'), token.at)
        if (take('default')) {
          take(':')
          if (otherwise) throw new VerilogError(t('A case has one default.'), token.at)
          otherwise = statement()
          continue
        }
        const values = [expression()]
        while (take(',')) values.push(expression())
        expect(':')
        arms.push({ values, body: statement() })
      }
      return otherwise
        ? { kind: 'case', at: token.at, subject, arms, otherwise }
        : { kind: 'case', at: token.at, subject, arms }
    }
    if (take(';')) return { kind: 'block', at: token.at, body: [] }
    const target = primary()
    const blocking = !is('<=')
    if (blocking) expect('=')
    else next()
    delay()
    const value = expression()
    expect(';')
    return { kind: 'set', at: token.at, target, value, blocking }
  }

  // ---- A module ----
  const readModule = (): Module => {
    const start = next()
    const title = name('module')
    const ports: string[] = []
    const decls: Decl[] = []
    const params: Param[] = []
    const items: Item[] = []

    const parameters = (closing: string): void => {
      // `parameter [3:0] A = 1, B = 2`
      if (!take('parameter')) take('localparam')
      const bounds = range()
      for (;;) {
        const param = name('number')
        expect('=')
        params.push({ at: param.at, name: param.text, value: expression(), ...(bounds ? { range: bounds } : {}) })
        if (!take(',')) break
        if (is('parameter') || is('localparam')) return parameters(closing)
      }
      expect(closing)
    }
    if (take('#')) {
      expect('(')
      parameters(')')
    }

    /** `input wire [3:0] a, b`: the words before the names, as one declaration. */
    const kind = (): Omit<Decl, 'name' | 'at'> | undefined => {
      refuse()
      let dir: Decl['dir']
      let reg = false
      let net = false
      if (take('input')) dir = 'input'
      else if (take('output')) dir = 'output'
      refuse()
      if (take('reg') || take('logic')) reg = net = true
      else if (take('wire')) net = true
      if (!dir && !net) return undefined
      refuse()
      const bounds = range()
      return { ...(dir ? { dir } : {}), ...(reg ? { reg } : {}), ...(net ? { net } : {}), ...(bounds ? { range: bounds } : {}) }
    }

    if (take('(')) {
      let said: Omit<Decl, 'name' | 'at'> | undefined
      while (!take(')')) {
        said = kind() ?? said
        const port = name('port')
        ports.push(port.text)
        if (said) decls.push({ ...said, at: port.at, name: port.text })
        if (!is(')')) expect(',')
      }
    }
    expect(';')

    while (!take('endmodule')) {
      const token = peek()
      if (token.kind === 'end') throw new VerilogError(t('This module has no “endmodule”.'), start.at)
      if (take(';')) continue
      if (is('parameter') || is('localparam')) {
        parameters(';')
        continue
      }
      if (take('initial')) {
        items.push({ kind: 'initial', at: token.at, body: statement() })
        continue
      }
      const said = kind()
      if (said) {
        for (;;) {
          const signal = name('signal')
          if (is('[')) {
            if (!said.reg || said.dir) throw new VerilogError(t('Only a reg inside the module holds several words.'), peek().at)
            decls.push({ ...said, at: signal.at, name: signal.text, words: range() })
            if (!take(',')) break
            continue
          }
          if (take('=')) {
            const value = expression()
            if (said.reg) decls.push({ ...said, at: signal.at, name: signal.text, init: value })
            else {
              decls.push({ ...said, at: signal.at, name: signal.text })
              items.push({ kind: 'assign', at: signal.at, target: { kind: 'id', at: signal.at, name: signal.text }, value })
            }
          } else decls.push({ ...said, at: signal.at, name: signal.text })
          if (!take(',')) break
        }
        expect(';')
        continue
      }
      if (take('assign')) {
        delay()
        for (;;) {
          const target = primary()
          expect('=')
          items.push({ kind: 'assign', at: target.at, target, value: expression() })
          if (!take(',')) break
        }
        expect(';')
        continue
      }
      if (is('always') || is('always_comb') || is('always_ff')) {
        const word = next().text
        const edges: Edge[] = []
        if (word !== 'always_comb') {
          expect('@')
          if (!take('*')) {
            expect('(')
            if (!take('*')) {
              for (;;) {
                const at = peek().at
                const edge = take('posedge') ? 'posedge' : take('negedge') ? 'negedge' : undefined
                const signal = expression()
                // A plain name in the list only says when to look again: it is combinational.
                if (edge) edges.push({ at, edge, signal })
                if (!take('or') && !take(',')) break
              }
            }
            expect(')')
          }
          if (word === 'always_ff' && edges.length === 0) {
            throw new VerilogError(t('An always_ff needs the edge of a clock.'), token.at)
          }
        }
        items.push({ kind: 'always', at: token.at, edges, body: statement() })
        continue
      }
      if (token.kind === 'id' && GATES.has(token.text)) {
        next()
        delay()
        for (;;) {
          const label = peek().kind === 'id' && !is('(') ? name('gate').text : undefined
          expect('(')
          const pins = [expression()]
          while (take(',')) pins.push(expression())
          expect(')')
          items.push({ kind: 'gate', at: token.at, type: token.text, pins, ...(label ? { name: label } : {}) })
          if (!take(',')) break
        }
        expect(';')
        continue
      }
      // What is left is another module used as a part.
      const used = name('used')
      if (take('#')) throw new VerilogError(t('Give a module its numbers where it is written, not where it is used.'), used.at)
      for (;;) {
        const label = name('part')
        expect('(')
        const named: { at: number; port: string; value?: Expr }[] = []
        const placed: (Expr | undefined)[] = []
        if (is('.')) {
          do {
            const at = expect('.').at
            const port = name('port').text
            expect('(')
            if (is(')')) named.push({ at, port })
            else named.push({ at, port, value: expression() })
            expect(')')
          } while (take(','))
        } else if (!is(')')) {
          do placed.push(is(',') || is(')') ? undefined : expression())
          while (take(','))
        }
        expect(')')
        items.push(
          named.length > 0
            ? { kind: 'instance', at: label.at, module: used.text, name: label.text, named }
            : { kind: 'instance', at: label.at, module: used.text, name: label.text, placed },
        )
        if (!take(',')) break
      }
      expect(';')
    }
    return { at: start.at, name: title.text, ports, decls, params, items }
  }

  const modules: Module[] = []
  while (peek().kind !== 'end') {
    if (!is('module') && !is('macromodule')) {
      refuse()
      throw new VerilogError(notHere(peek(), EXPECTED, { wanted: 'module' }), peek().at)
    }
    modules.push(readModule())
  }
  return modules
}

/** The line and the column of a place in a text, both from 1. */
export function placeOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}
