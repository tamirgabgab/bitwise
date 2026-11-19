import { MAX_WORDS, MAX_WORD_WIDTH, memoryCell, packWord } from '../core/index.ts'
import { msg, t } from '../i18n/index.ts'
import { addComponent, addSubcircuit, addWire, emptyDoc, MAX_ITEMS } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { autoLayout } from './layout.ts'
import { MAX_CIRCUITS } from './project.ts'
import { MAX_CIRCUIT_NAME, MAX_FLAT_PARTS, cleanCircuitName, largestFlat, subRefOf } from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'
import { MAX_VERILOG_WIDTH, VerilogError, parseVerilog, placeOf } from './verilogParse.ts'
import type { Edge, Expr, Item, Module, Range, Stmt } from './verilogParse.ts'

/*
 * Builds circuits from Verilog text, at radix 2. Every module becomes a named
 * circuit: an `input` a switch, an `output` an output part, a module used
 * inside another a part standing for its circuit.
 *
 * The code is built as it is written, a part for each operator and each at
 * the width of its bus: a gate for `&`, an adder for `+`, a multiplexer for
 * `?:`, a comparator for `==`. A gate the project's kit does not have is made
 * from the gates it has. An `always` on a clock edge becomes flip-flops and
 * registers, and an `always @(*)` the multiplexers its `if` and `case` choose
 * with.
 *
 * A value is kept bit by bit until the whole module is read, and only then
 * drawn as wires. So the order of the text does not matter, a loop through
 * parts (two crossed NOR gates) is no trouble, and picking bits of a bus or
 * joining buses costs a splitter or a merger only where one is needed.
 */

/** The longest text that is read. */
export const MAX_VERILOG_LENGTH = 1_000_000

export interface VerilogBuilt {
  /** The new circuits, each after the circuits it uses. */
  readonly circuits: readonly Circuit[]
  /** The circuit to open: the last module that no other module uses. */
  readonly top: string
}

export interface VerilogProblem {
  readonly problem: string
  /** Where in the text, both from 1. */
  readonly line?: number
  readonly column?: number
}

export interface VerilogOptions {
  /** The gate types the project builds from. */
  readonly gates: ReadonlySet<string>
  /** The circuits of the project: their names are taken, and they count toward the limits. */
  readonly circuits: Circuits
  /** The number in the id of the first new circuit. */
  readonly nextCircuit: number
}

/** An output pin of a part. */
interface Source {
  readonly component: string
  readonly port: string
  readonly width: number
}

/** One bit of a value: a constant, a bit of a pin, or a bit of a signal not yet followed to its pin. */
type Bit = 0 | 1 | { readonly source: Source; readonly index: number } | { readonly signal: Signal; readonly index: number }
/** A bit followed to where it comes from. */
type Solid = 0 | 1 | { readonly source: Source; readonly index: number }
/** A value, the lowest bit first. */
type Bits = readonly Bit[]

interface Signal {
  readonly name: string
  readonly at: number
  readonly width: number
  /** The number of its lowest bit, the 0 of `[7:0]`. */
  readonly low: number
  readonly dir?: 'input' | 'output'
  readonly reg: boolean
  readonly init?: Expr
  /** What gives each bit its value, once something does. */
  readonly bits: (Bit | undefined)[]
}

interface Target {
  readonly signal: Signal
  readonly index: number
}

interface Port {
  readonly name: string
  readonly dir: 'input' | 'output'
  readonly width: number
  /** The switch or the output part, which is the name of the pin on a part of this circuit. */
  readonly part: string
}

interface Built {
  readonly circuit: Circuit
  readonly ports: readonly Port[]
}

/** What the bits of an `always` hold so far, for each signal it gives a value. */
type Env = Map<Signal, (Bit | undefined)[]>

interface Mode {
  readonly clocked: boolean
  /** In a clocked block, the signals given a value with `=`, which is seen at once. */
  readonly blocking: Set<Signal>
  /** On a clock edge, where the words given to memories are noted; elsewhere a memory takes none. */
  readonly writes?: Write[]
  /** On the way to here, what has to hold: made only when a memory is written. */
  readonly path?: () => Bit[]
  /** In the branch that resets the registers, where a memory takes no word either. */
  readonly resetting?: true
}

/** `reg [7:0] mem [0:15]`: a ROM where nothing writes it, a RAM where something does. */
interface Memory {
  readonly name: string
  readonly at: number
  readonly width: number
  readonly words: number
  /** Address bits: enough to name every word. */
  readonly address: number
  /** What each word starts with, from an `initial` block. */
  readonly start: bigint[]
  /** Given a word on a clock edge somewhere, so a RAM. */
  readonly written: boolean
  /** The RAM, once it is placed, and the address it is placed for: a RAM has one. */
  ram?: { readonly id: string; readonly address: Expr }
  /** The ROMs, one for each address the memory is read at. */
  readonly roms: { readonly id: string; readonly address: Expr }[]
  /** A word is given to it already: a RAM has one port to write. */
  wrote?: true
}

/** A word given to a memory on a clock edge. */
interface Write {
  readonly ram: string
  readonly data: Bits
  /** When it is written; always, when there is no condition. */
  readonly when?: Bits
}

/** The operators whose answer is as wide as the wider side. */
const ARITH = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '~^'])
/** The operators whose answer is as wide as the left side. */
const SHIFT = new Set(['<<', '>>', '<<<', '>>>', '**'])
/** The most inputs one gate takes. */
const GATE_INPUTS = 8
/** The widest signal a decoder is put on to ask it for a number; a wider one gets a comparator. */
const MAX_DECODED = 3
/** The widest signal one multiplexer chooses by. */
const MAX_SELECT = 4
/** Whether `named` numbers are enough of what `width` bits can say for one multiplexer of every way. */
const worthOneMux = (width: number, named: number): boolean => width <= MAX_SELECT && 2 ** width <= 2 * named

const mask = (width: number): bigint => (1n << BigInt(width)) - 1n
const bitLength = (value: bigint): number => (value <= 0n ? 1 : value.toString(2).length)
const sameBit = (a: Bit | undefined, b: Bit | undefined): boolean => {
  if (a === undefined || b === undefined || typeof a === 'number' || typeof b === 'number') return a === b
  if ('signal' in a) return 'signal' in b && a.signal === b.signal && a.index === b.index
  return (
    'source' in b && a.source.component === b.source.component && a.source.port === b.source.port && a.index === b.index
  )
}
const zeros = (width: number): Bit[] => Array<Bit>(Math.max(0, width)).fill(0)
/** A value cut to `width` bits, or filled up to it with zeros. */
const fit = (bits: Bits, width: number): Bit[] =>
  bits.length >= width ? bits.slice(0, width) : [...bits, ...zeros(width - bits.length)]
const bitsOf = (value: bigint, width: number): Bit[] =>
  Array.from({ length: width }, (_, index) => ((value >> BigInt(index)) & 1n) === 1n ? 1 : 0)
const flat = (expr: Expr, op: string): Expr[] =>
  expr.kind === 'binary' && expr.op === op ? [...flat(expr.left, op), ...flat(expr.right, op)] : [expr]
/** Whether two expressions are written alike, wherever they stand in the text. */
const alike = (a: Expr, b: Expr): boolean => {
  const written = (expr: Expr): string =>
    JSON.stringify(expr, (key, value: unknown) => (key === 'at' ? undefined : typeof value === 'bigint' ? `${value}n` : value))
  return written(a) === written(b)
}
/** A block of one statement is that statement. */
/** Said where a memory is given a word other than on a clock edge. */
const MEMORY_WRITE = msg('A memory is given a word only on a clock edge, as in “if (we) mem[a] <= d;”.')

/** The names given a word with `name[...] <=` somewhere in a statement: memories, if they are. */
function* wordsGiven(stmt: Stmt | undefined): Generator<string> {
  if (!stmt) return
  switch (stmt.kind) {
    case 'block':
      for (const inner of stmt.body) yield* wordsGiven(inner)
      return
    case 'if':
      yield* wordsGiven(stmt.then)
      yield* wordsGiven(stmt.else)
      return
    case 'case':
      for (const arm of stmt.arms) yield* wordsGiven(arm.body)
      yield* wordsGiven(stmt.otherwise)
      return
    case 'set':
      if (stmt.target.kind === 'bit') yield stmt.target.name
  }
}

const only = (stmt: Stmt | undefined): Stmt | undefined =>
  stmt?.kind === 'block' && stmt.body.length === 1 ? only(stmt.body[0]) : stmt

/**
 * The numbers that have to be known before a circuit is built, with what is
 * said when one is not known and when it is too large. Shown with `t`.
 */
const WHOLE = {
  high: {
    unknown: msg('The high bit of a range has to be a number, known before the circuit runs.'),
    large: msg('The high bit of a range is too large.'),
  },
  low: {
    unknown: msg('The low bit of a range has to be a number, known before the circuit runs.'),
    large: msg('The low bit of a range is too large.'),
  },
  place: {
    unknown: msg('The place of a bit has to be a number, known before the circuit runs.'),
    large: msg('The place of a bit is too large.'),
  },
  first: {
    unknown: msg('The first bit of a range has to be a number, known before the circuit runs.'),
    large: msg('The first bit of a range is too large.'),
  },
  width: {
    unknown: msg('The width of a range has to be a number, known before the circuit runs.'),
    large: msg('The width of a range is too large.'),
  },
  repeat: {
    unknown: msg('How many times a value is repeated has to be a number, known before the circuit runs.'),
    large: msg('How many times a value is repeated is too large.'),
  },
} as const

function buildModule(
  module: Module,
  modules: ReadonlyMap<string, Built>,
  kit: ReadonlySet<string>,
): { doc: CircuitDoc; ports: Port[] } {
  let doc = emptyDoc()
  let spots = 0
  let items = 0
  /** Where in the text the work is, for a refusal that has no better place. */
  let here = module.at

  const room = (): void => {
    if (++items > MAX_ITEMS) {
      throw new VerilogError(
        t('“{name}” comes to more than {max} parts and wires, the most one circuit holds.', {
          name: module.name,
          max: MAX_ITEMS,
        }),
        here,
      )
    }
  }
  // The layout at the end puts every part in its place; until then they only must not pile up.
  const spot = (): { x: number; y: number } => ({ x: 8 * (spots % 100), y: 8 * Math.floor(spots++ / 100) })
  const place = (type: string, params: Readonly<Record<string, number>>, label?: string): string => {
    room()
    const added = addComponent(doc, type, spot(), label === undefined ? { params } : { params, label })
    doc = added.doc
    return added.id
  }
  const wire = (from: Source, component: string, port: string): void => {
    room()
    const added = addWire(
      doc,
      { kind: 'pin', component: from.component, port: from.port },
      { kind: 'pin', component, port },
    )
    if (added) doc = added.doc
  }
  const pinBits = (component: string, port: string, width: number): Bit[] => {
    const source = { component, port, width }
    return Array.from({ length: width }, (_, index) => ({ source, index }))
  }

  // A value is attached to a pin only at the end, when every signal is known.
  const links: { readonly bits: Bits; readonly component: string; readonly port: string; readonly at: number }[] = []
  const link = (bits: Bits, component: string, port: string): void =>
    void links.push({ bits, component, port, at: here })
  /** Places a part with values on its inputs, and gives the bits of an output of it. */
  const part = (
    type: string,
    params: Readonly<Record<string, number>>,
    inputs: Readonly<Record<string, Bits | undefined>>,
    label?: string,
  ): ((port: string, width: number) => Bit[]) => {
    const id = place(type, params, label)
    for (const [port, bits] of Object.entries(inputs)) if (bits) link(bits, id, port)
    return (port, width) => pinBits(id, port, width)
  }

  // ---- Names ----
  const params = new Map<string, { readonly value: bigint; readonly size?: number }>()
  const signals = new Map<string, Signal>()
  const memories = new Map<string, Memory>()
  const signal = (name: string, at: number): Signal => {
    const found = signals.get(name)
    if (!found && memories.has(name)) {
      throw new VerilogError(t('“{name}” is a memory: one word of it is read at a time, as in {name}[0].', { name }), at)
    }
    if (!found) {
      throw new VerilogError(
        params.has(name) ? t('“{name}” is a number, not a signal.', { name }) : t('“{name}” is not declared.', { name }),
        at,
      )
    }
    return found
  }
  /** In an `always`, what a signal holds by now, when the block has given it a value. */
  let scope: ((signal: Signal, index: number) => Bit | undefined) | undefined
  const refs = (from: Signal, start: number, count: number): Bit[] =>
    Array.from({ length: count }, (_, offset) => {
      const index = start + offset
      return scope?.(from, index) ?? { signal: from, index }
    })

  const checked = (width: number, at: number): number => {
    if (width < 1 || width > MAX_VERILOG_WIDTH) {
      throw new VerilogError(
        t('A value is 1 to {max} bits wide, and this one would be {width}.', { max: MAX_VERILOG_WIDTH, width }),
        at,
      )
    }
    return width
  }
  /** A number that has to be known before the circuit is built: `what` says which, from `WHOLE`. */
  const whole = (expr: Expr, what: keyof typeof WHOLE): number => {
    const value = constant(expr, MAX_VERILOG_WIDTH)
    if (value === undefined) throw new VerilogError(t(WHOLE[what].unknown), expr.at)
    if (value > 1_000_000n) throw new VerilogError(t(WHOLE[what].large), expr.at)
    return Number(value)
  }
  const bounds = (range: Range | undefined): { low: number; width: number } => {
    if (!range) return { low: 0, width: 1 }
    const high = whole(range.high, 'high')
    const low = whole(range.low, 'low')
    if (high < low) {
      throw new VerilogError(t('A range runs from the high bit down to the low one, as in [7:0].'), range.high.at)
    }
    return { low, width: checked(high - low + 1, range.high.at) }
  }
  const bitOf = (from: Signal, index: Expr): number => {
    const place = whole(index, 'place') - from.low
    if (place < 0 || place >= from.width) throw new VerilogError(t('“{name}” has no bit there.', { name: from.name }), index.at)
    return place
  }
  const partOf = (expr: Extract<Expr, { kind: 'part' }>): { from: Signal; start: number; count: number } => {
    const from = signal(expr.name, expr.at)
    let high: number
    let low: number
    if (expr.step === undefined) {
      high = whole(expr.high, 'high')
      low = whole(expr.low, 'low')
    } else {
      const base = whole(expr.high, 'first')
      const count = whole(expr.low, 'width')
      if (count < 1) throw new VerilogError(t('A range holds at least one bit.'), expr.low.at)
      low = expr.step === '+' ? base : base - count + 1
      high = low + count - 1
    }
    if (high < low) throw new VerilogError(t('A range runs from the high bit down to the low one, as in [7:0].'), expr.at)
    if (low < from.low || high >= from.low + from.width) {
      throw new VerilogError(t('“{name}” does not have all of these bits.', { name: from.name }), expr.at)
    }
    return { from, start: low - from.low, count: high - low + 1 }
  }
  const times = (expr: Extract<Expr, { kind: 'repeat' }>): number => {
    const count = whole(expr.count, 'repeat')
    if (count < 1) throw new VerilogError(t('A value is repeated at least once.'), expr.count.at)
    return count
  }

  // ---- What an expression is worth before anything is built ----
  /** The width of an expression taken alone, by the rules of the language. */
  function widthOf(expr: Expr): number {
    switch (expr.kind) {
      case 'num':
        return expr.size ?? 32
      case 'id': {
        const param = params.get(expr.name)
        return param ? (param.size ?? 32) : signal(expr.name, expr.at).width
      }
      case 'bit':
        return memories.get(expr.name)?.width ?? 1
      case 'part':
        return partOf(expr).count
      case 'concat':
        return checked(expr.parts.reduce((sum, item) => sum + widthOf(item), 0), expr.at)
      case 'repeat':
        return checked(times(expr) * widthOf(expr.value), expr.at)
      case 'unary':
        return expr.op === '+' || expr.op === '-' || expr.op === '~' ? widthOf(expr.arg) : 1
      case 'binary':
        if (ARITH.has(expr.op)) return Math.max(widthOf(expr.left), widthOf(expr.right))
        return SHIFT.has(expr.op) ? widthOf(expr.left) : 1
      case 'cond':
        return Math.max(widthOf(expr.then), widthOf(expr.else))
    }
  }

  /** Whether an expression of numbers alone is other than 0; undefined when a signal is in it. */
  function truthConstant(expr: Expr): boolean | undefined {
    const value = constant(expr, widthOf(expr))
    return value === undefined ? undefined : value !== 0n
  }

  /** The value of an expression of numbers alone, worked out `width` bits wide; undefined when a signal is in it. */
  function constant(expr: Expr, width: number): bigint | undefined {
    const all = mask(width)
    switch (expr.kind) {
      case 'num':
        return expr.value & all
      case 'id': {
        const param = params.get(expr.name)
        return param === undefined ? undefined : param.value & all
      }
      case 'bit':
      case 'part':
        return undefined
      case 'concat': {
        let value = 0n
        for (const item of expr.parts) {
          const size = widthOf(item)
          const piece = constant(item, size)
          if (piece === undefined) return undefined
          value = (value << BigInt(size)) | piece
        }
        return value & all
      }
      case 'repeat': {
        const size = widthOf(expr.value)
        const piece = constant(expr.value, size)
        if (piece === undefined) return undefined
        let value = 0n
        for (let count = times(expr); count > 0; count--) value = (value << BigInt(size)) | piece
        return value & all
      }
      case 'unary': {
        if (expr.op === '+' || expr.op === '-' || expr.op === '~') {
          const value = constant(expr.arg, width)
          if (value === undefined) return undefined
          return (expr.op === '+' ? value : expr.op === '-' ? -value : ~value) & all
        }
        const size = widthOf(expr.arg)
        const value = constant(expr.arg, size)
        if (value === undefined) return undefined
        const odd = value.toString(2).replaceAll('0', '').length % 2 === 1
        const answer: Readonly<Record<string, boolean>> = {
          '!': value === 0n,
          '&': value === mask(size),
          '~&': value !== mask(size),
          '|': value !== 0n,
          '~|': value === 0n,
          '^': odd,
          '~^': !odd,
        }
        return answer[expr.op] ? 1n : 0n
      }
      case 'binary': {
        const { op } = expr
        if (op === '&&' || op === '||') {
          const left = truthConstant(expr.left)
          const right = truthConstant(expr.right)
          if (left === undefined || right === undefined) return undefined
          return (op === '&&' ? left && right : left || right) ? 1n : 0n
        }
        if (!ARITH.has(op) && !SHIFT.has(op)) {
          const size = Math.max(widthOf(expr.left), widthOf(expr.right))
          const left = constant(expr.left, size)
          const right = constant(expr.right, size)
          if (left === undefined || right === undefined) return undefined
          const answer: Readonly<Record<string, boolean>> = {
            '==': left === right,
            '!=': left !== right,
            '<': left < right,
            '<=': left <= right,
            '>': left > right,
            '>=': left >= right,
          }
          return answer[op] ? 1n : 0n
        }
        const left = constant(expr.left, width)
        const right = constant(expr.right, SHIFT.has(op) ? widthOf(expr.right) : width)
        if (left === undefined || right === undefined) return undefined
        if ((op === '/' || op === '%') && right === 0n) throw new VerilogError(t('This divides by 0.'), expr.at)
        if (SHIFT.has(op) && right > BigInt(MAX_VERILOG_WIDTH)) return op === '**' && left <= 1n ? left : 0n
        switch (op) {
          case '+':
            return (left + right) & all
          case '-':
            return (left - right) & all
          case '*':
            return (left * right) & all
          case '/':
            return (left / right) & all
          case '%':
            return (left % right) & all
          case '&':
            return left & right
          case '|':
            return left | right
          case '^':
            return left ^ right
          case '~^':
            return ~(left ^ right) & all
          case '**':
            return (left ** right) & all
          case '<<':
          case '<<<':
            return (left << right) & all
          default:
            return left >> right
        }
      }
      case 'cond': {
        const test = truthConstant(expr.test)
        return test === undefined ? undefined : constant(test ? expr.then : expr.else, width)
      }
    }
  }

  /** The largest value an expression can come to when it is worked out `width` bits wide. */
  function most(expr: Expr, width: number): bigint {
    const fixed = constant(expr, width)
    if (fixed !== undefined) return fixed
    const all = mask(width)
    const capped = (value: bigint): bigint => (value > all ? all : value)
    switch (expr.kind) {
      case 'unary':
        return expr.op === '+' ? most(expr.arg, width) : expr.op === '-' || expr.op === '~' ? all : 1n
      case 'binary': {
        const { op } = expr
        if (op === '<<' || op === '<<<' || op === '>>' || op === '>>>') {
          const by = constant(expr.right, widthOf(expr.right))
          const left = most(expr.left, width)
          if (op.startsWith('<')) return by === undefined || by > BigInt(width) ? all : capped(left << by)
          return by === undefined ? left : by > BigInt(width) ? 0n : left >> by
        }
        if (!ARITH.has(op)) return op === '**' ? all : 1n
        const left = most(expr.left, width)
        const right = most(expr.right, width)
        if (op === '+') return capped(left + right)
        if (op === '*') return capped(left * right)
        if (op === '&') return left < right ? left : right
        if (op === '|' || op === '^') return mask(Math.max(bitLength(left), bitLength(right)))
        return all
      }
      case 'cond': {
        const then = most(expr.then, width)
        const other = most(expr.else, width)
        return then > other ? then : other
      }
      default:
        return capped(mask(widthOf(expr)))
    }
  }
  /** How many bits an expression needs at most. */
  const digits = (expr: Expr, width: number): number => Math.min(width, bitLength(most(expr, width)))

  // ---- Gates, from the kit of the project ----
  const has = (type: string): boolean => kit.has(type)
  const cannot = (): never => {
    throw new VerilogError(t('The gate kit of this project has no gates to build this from.'), here)
  }
  const placeGate = (type: string, inputs: readonly Bits[], width: number): Bit[] =>
    part(
      type,
      { inputs: inputs.length, width },
      Object.fromEntries(inputs.map((bits, index) => [`in${index}`, bits])),
    )('out', width)

  const keyOf = (bits: Bits): string =>
    bits
      .map((bit) =>
        typeof bit === 'number'
          ? String(bit)
          : 'signal' in bit
            ? `@${bit.signal.name}.${bit.index}`
            : `${bit.source.component}.${bit.source.port}.${bit.index}`,
      )
      .join(',')
  const inverted = new Map<string, Bit[]>()
  /** NOT of a value. One value is turned over once, however often it is asked for. */
  const invert = (bits: Bits): Bit[] => {
    if (bits.every((bit) => typeof bit === 'number')) return bits.map((bit) => (bit === 0 ? 1 : 0))
    const key = keyOf(bits)
    let out = inverted.get(key)
    if (!out) {
      const width = bits.length
      if (has('not')) out = part('not', { width }, { in: bits })('out', width)
      else if (has('shift')) out = part('shift', { by: 1, width }, { in: bits })('out', width)
      else if (has('nand')) out = placeGate('nand', [bits, bits], width)
      else if (has('nor')) out = placeGate('nor', [bits, bits], width)
      else if (has('is')) out = part('is', { match: 0, width }, { in: bits })('out', width)
      else if (has('add')) out = placeGate('add', [bits, Array<Bit>(width).fill(1)], width)
      else if (has('xor')) out = placeGate('xor', [bits, Array<Bit>(width).fill(1)], width)
      else return cannot()
      inverted.set(key, out)
    }
    return out
  }

  /** A gate of the language on values `width` wide, built from what the kit has. */
  function gate(type: string, inputs: readonly Bits[], width: number): Bit[] {
    if (type === 'not') return invert(inputs[0])
    if (type === 'buf') return has('buffer') ? part('buffer', { width }, { in: inputs[0] })('out', width) : [...inputs[0]]
    const negated = type === 'nand' || type === 'nor' || type === 'xnor'
    const plain = type.replace(/^n(?=and|or)/, '').replace('xnor', 'xor')
    if (inputs.length === 1) return negated ? invert(inputs[0]) : [...inputs[0]]
    if (inputs.length > GATE_INPUTS) {
      // More than one gate takes: gates of the plain kind first, and the asked one over them.
      const groups: Bits[] = []
      for (let start = 0; start < inputs.length; start += GATE_INPUTS) {
        groups.push(gate(plain, inputs.slice(start, start + GATE_INPUTS), width))
      }
      return gate(type, groups, width)
    }
    if (has(type)) return placeGate(type, inputs, width)
    const turned = (): Bit[][] => inputs.map((bits) => invert(bits))
    switch (type) {
      case 'and':
        if (has('mul')) return placeGate('mul', inputs, width)
        if (has('nand')) return invert(placeGate('nand', inputs, width))
        if (has('nor')) return placeGate('nor', turned(), width)
        return has('or') ? invert(placeGate('or', turned(), width)) : cannot()
      case 'or':
        if (has('nor')) return invert(placeGate('nor', inputs, width))
        if (has('nand')) return placeGate('nand', turned(), width)
        return has('and') || has('mul') ? invert(gate('and', turned(), width)) : cannot()
      case 'nand':
        return has('and') || has('mul') ? invert(gate('and', inputs, width)) : gate('or', turned(), width)
      case 'nor':
        return has('or') ? invert(placeGate('or', inputs, width)) : gate('and', turned(), width)
      case 'xor': {
        if (has('add')) return placeGate('add', inputs, width)
        // Two at a time: one or the other, and not both.
        return inputs.reduce<Bit[]>(
          (left, right) =>
            left.length === 0
              ? [...right]
              : gate('or', [gate('and', [left, invert(right)], width), gate('and', [invert(left), right], width)], width),
          [],
        )
      }
      default:
        return invert(gate('xor', inputs, width))
    }
  }
  /** One bit that is 1 when the gate over all the bits of a value is. */
  const reduce = (type: string, bits: Bits): Bit[] => gate(type, bits.map((bit) => [bit]), 1)

  // ---- Larger parts ----
  /** `yes` where `test` is 1 and `no` where it is 0. */
  const mux = (test: Bits, yes: Bits, no: Bits): Bit[] => {
    if (yes.every((bit, index) => sameBit(bit, no[index]))) return [...yes]
    const width = yes.length
    return part('mux', { inputs: 2, select: 1, width }, { in0: no, in1: yes, sel: test })('out', width)
  }
  /** One bit that is 1 when an expression is other than 0. */
  function truth(expr: Expr): Bit[] {
    const width = widthOf(expr)
    const bits = build(expr, width, digits(expr, width))
    return bits.length === 1 ? bits : reduce('or', bits)
  }

  const decoders = new Map<string, (port: string, width: number) => Bit[]>()
  /** One bit that is 1 when a value of a few bits is the number `value`. */
  const equals = (bits: Bits, value: bigint): Bit[] => {
    if (value >= 1n << BigInt(bits.length)) return [0]
    if (bits.length === 1) return value === 1n ? [...bits] : invert(bits)
    // A decoder has an output for every number, so every question about one value shares it.
    const key = keyOf(bits)
    let out = decoders.get(key)
    if (!out) decoders.set(key, (out = part('decoder', { outputs: 2 ** bits.length, select: bits.length }, { sel: bits })))
    return out(`out${value}`, 1)
  }

  const comparators = new Map<string, (port: string, width: number) => Bit[]>()
  function compare(expr: Extract<Expr, { kind: 'binary' }>): Bit[] {
    const width = Math.max(widthOf(expr.left), widthOf(expr.right))
    if (expr.op === '==' || expr.op === '!=') {
      // Against a number, a signal of a few bits needs no comparator.
      const [known, other] =
        constant(expr.right, width) !== undefined ? [expr.right, expr.left] : [expr.left, expr.right]
      const value = constant(known, width)
      const few = digits(other, width)
      if (value !== undefined && few <= MAX_DECODED) {
        const same = equals(build(other, width, few), value)
        return expr.op === '==' ? same : invert(same)
      }
    }
    const size = Math.max(digits(expr.left, width), digits(expr.right, width))
    const a = build(expr.left, width, size)
    const b = build(expr.right, width, size)
    // One comparator says less, equal and greater, so two questions about the same pair share it.
    const key = `${keyOf(a)}|${keyOf(b)}`
    let out = comparators.get(key)
    if (!out) comparators.set(key, (out = part('compare', { width: size }, { a, b })))
    switch (expr.op) {
      case '==':
        return out('eq', 1)
      case '!=':
        return invert(out('eq', 1))
      case '<':
        return out('lt', 1)
      case '>':
        return out('gt', 1)
      case '<=':
        return invert(out('gt', 1))
      default:
        return invert(out('lt', 1))
    }
  }

  /** A sum of several values: an adder for each two, a value of one bit going in as the carry. */
  function sum(terms: readonly Expr[], context: number, width: number): Bit[] {
    const sized = terms.map((expr) => ({ expr, size: digits(expr, context) }))
    const wide = sized.filter((term) => term.size > 1)
    const ones = sized.filter((term) => term.size <= 1)
    const first = wide.shift() ?? ones.shift()!
    let size = Math.min(width, first.size)
    let total = build(first.expr, context, size)
    while (wide.length > 0 || ones.length > 0) {
      // With nothing wide left to add, a value of one bit still goes in as the carry: `q + 1`.
      const other = wide.shift()
      const carry = ones.shift()
      const each = Math.min(width, Math.max(size, other?.size ?? 1))
      const out = part(
        'adder',
        { width: each },
        {
          a: fit(total, each),
          b: other ? build(other.expr, context, each) : zeros(each),
          cin: carry ? build(carry.expr, context, 1) : undefined,
        },
      )
      // With room left, the carry out is the next bit of the sum.
      total = each < width ? [...out('sum', each), ...out('cout', 1)] : out('sum', each)
      size = total.length
    }
    return fit(total, width)
  }

  function difference(expr: Extract<Expr, { kind: 'binary' }>, context: number, width: number): Bit[] {
    // `a - b - c` with a `c` of one bit is one subtractor with its borrow in.
    const [from, take, borrow] =
      expr.left.kind === 'binary' && expr.left.op === '-' && digits(expr.right, context) === 1
        ? [expr.left.left, expr.left.right, expr.right]
        : [expr.left, expr.right, undefined]
    const each = Math.min(width, Math.max(digits(from, context), digits(take, context)))
    const out = part(
      'subtractor',
      { width: each },
      {
        a: build(from, context, each),
        b: build(take, context, each),
        bin: borrow ? build(borrow, context, 1) : undefined,
      },
    )
    // Below 0 every higher bit is 1, which is what the borrow out says.
    const sign = each < width ? out('bout', 1)[0] : 0
    return [...out('diff', each), ...Array<Bit>(width - each).fill(sign)]
  }

  function product(expr: Extract<Expr, { kind: 'binary' }>, context: number, width: number): Bit[] {
    const each = Math.min(width, Math.max(digits(expr.left, context), digits(expr.right, context)))
    if (each > MAX_VERILOG_WIDTH / 2) {
      throw new VerilogError(t('A multiplier takes numbers of at most {max} bits.', { max: MAX_VERILOG_WIDTH / 2 }), expr.at)
    }
    const out = part('multiplier', { width: each }, { a: build(expr.left, context, each), b: build(expr.right, context, each) })
    return fit(out('p', 2 * each), width)
  }

  function shifted(left: 0 | 1, bits: Bits, by: Expr): Bit[] {
    const width = widthOf(by)
    const select = digits(by, width)
    if (select > 4) throw new VerilogError(t('A shift by more than 15 places is not read.'), by.at)
    return part(
      'shifter',
      { width: bits.length, select, left, rotate: 0 },
      { in: bits, amt: build(by, width, select) },
    )('out', bits.length)
  }

  /**
   * The lowest `width` bits of an expression worked out `context` bits wide.
   * Most operators need no more of their sides than is asked of them, so a
   * number written without a size, 32 bits wide by the rules, makes no part
   * wider than the signals around it.
   */
  function build(expr: Expr, context: number, width: number): Bit[] {
    here = expr.at
    const fixed = constant(expr, context)
    if (fixed !== undefined) return bitsOf(fixed, width)
    switch (expr.kind) {
      case 'num':
        return bitsOf(expr.value, width)
      case 'id': {
        const from = signal(expr.name, expr.at)
        return fit(refs(from, 0, from.width), width)
      }
      case 'bit': {
        const memory = memories.get(expr.name)
        if (memory) return fit(readWord(memory, expr.index), width)
        const from = signal(expr.name, expr.at)
        return fit(refs(from, bitOf(from, expr.index), 1), width)
      }
      case 'part': {
        const { from, start, count } = partOf(expr)
        return fit(refs(from, start, count), width)
      }
      case 'concat': {
        const bits: Bit[] = []
        for (const item of [...expr.parts].reverse()) {
          const size = widthOf(item)
          bits.push(...build(item, size, size))
        }
        return fit(bits, width)
      }
      case 'repeat': {
        const size = widthOf(expr.value)
        const once = build(expr.value, size, size)
        return fit(Array.from({ length: times(expr) }, () => once).flat(), width)
      }
      case 'unary': {
        if (expr.op === '+') return build(expr.arg, context, width)
        if (expr.op === '~') {
          // NOT of a gate is the gate that says so: `~(a & b)` is one NAND.
          const inner = expr.arg
          if (inner.kind === 'binary' && (inner.op === '&' || inner.op === '|' || inner.op === '^')) {
            const type = { '&': 'nand', '|': 'nor', '^': 'xnor' }[inner.op]
            return gate(type, flat(inner, inner.op).map((side) => build(side, context, width)), width)
          }
          return invert(build(inner, context, width))
        }
        if (expr.op === '-') {
          return part('subtractor', { width }, { a: zeros(width), b: build(expr.arg, context, width) })('diff', width)
        }
        if (expr.op === '!') return fit(invert(truth(expr.arg)), width)
        const size = widthOf(expr.arg)
        const bits = build(expr.arg, size, size)
        const one = reduce({ '&': 'and', '|': 'or', '^': 'xor' }[expr.op.replace('~', '')]!, bits)
        return fit(expr.op.startsWith('~') ? invert(one) : one, width)
      }
      case 'binary': {
        const { op } = expr
        switch (op) {
          case '&':
          case '|':
          case '^': {
            const type = { '&': 'and', '|': 'or', '^': 'xor' }[op]
            return gate(type, flat(expr, op).map((side) => build(side, context, width)), width)
          }
          case '~^':
            return gate('xnor', [build(expr.left, context, width), build(expr.right, context, width)], width)
          case '+':
            return sum(flat(expr, '+'), context, width)
          case '-':
            return difference(expr, context, width)
          case '*':
            return product(expr, context, width)
          case '/':
          case '%':
          case '**':
            throw new VerilogError(t('No part divides or raises to a power. Only numbers known beforehand can be.'), expr.at)
          case '<<':
          case '<<<': {
            const by = constant(expr.right, widthOf(expr.right))
            if (by === undefined) return shifted(1, build(expr.left, context, width), expr.right)
            const places = by > BigInt(width) ? width : Number(by)
            if (places >= width) return zeros(width)
            return [...zeros(places), ...build(expr.left, context, width - places)]
          }
          case '>>':
          case '>>>': {
            const by = constant(expr.right, widthOf(expr.right))
            if (by === undefined) {
              return fit(shifted(0, build(expr.left, context, digits(expr.left, context)), expr.right), width)
            }
            const places = by > BigInt(context) ? context : Number(by)
            if (places >= context) return zeros(width)
            return fit(build(expr.left, context, Math.min(context, width + places)).slice(places), width)
          }
          case '&&':
          case '||':
            return fit(gate(op === '&&' ? 'and' : 'or', [truth(expr.left), truth(expr.right)], 1), width)
          default:
            return fit(compare(expr), width)
        }
      }
      case 'cond': {
        const known = truthConstant(expr.test)
        if (known !== undefined) return build(known ? expr.then : expr.else, context, width)
        const chosen = choices(expr)
        if (chosen) {
          const select = widthOf(chosen.subject)
          const ways = Array.from({ length: 2 ** select }, (_, value) => chosen.arms.get(value) ?? chosen.otherwise)
          // Each value is built once, however many numbers choose it.
          const made = new Map<Expr, Bit[]>()
          const inputs = ways.map((way) => {
            let bits = made.get(way)
            if (!bits) made.set(way, (bits = build(way, context, width)))
            return bits
          })
          return part(
            'mux',
            { inputs: ways.length, select, width },
            { ...Object.fromEntries(inputs.map((bits, value) => [`in${value}`, bits])), sel: build(chosen.subject, select, select) },
          )('out', width)
        }
        return mux(truth(expr.test), build(expr.then, context, width), build(expr.else, context, width))
      }
    }
  }

  /**
   * `s == 0 ? a : s == 1 ? b : c`: a chain that asks one signal of a few bits
   * for one number after another is a single multiplexer with `s` as its select.
   */
  function choices(
    expr: Extract<Expr, { kind: 'cond' }>,
  ): { subject: Expr; arms: Map<number, Expr>; otherwise: Expr } | undefined {
    const arms = new Map<number, Expr>()
    let subject: Expr | undefined
    let rest: Expr = expr
    let asked = 0
    while (rest.kind === 'cond' && rest.test.kind === 'binary' && rest.test.op === '==') {
      const { left, right } = rest.test
      const size = widthOf(left)
      const value = constant(right, Math.max(size, widthOf(right)))
      if (value === undefined || size > MAX_SELECT || constant(left, size) !== undefined) break
      if (subject && !alike(subject, left)) break
      subject = left
      if (value < 1n << BigInt(size) && !arms.has(Number(value))) arms.set(Number(value), rest.then)
      asked++
      rest = rest.else
    }
    return subject && asked >= 2 && worthOneMux(widthOf(subject), arms.size) ? { subject, arms, otherwise: rest } : undefined
  }

  // ---- Giving a signal its value ----
  function targets(expr: Expr): Target[] {
    switch (expr.kind) {
      case 'id': {
        const to = signal(expr.name, expr.at)
        return Array.from({ length: to.width }, (_, index) => ({ signal: to, index }))
      }
      case 'bit': {
        if (memories.has(expr.name)) throw new VerilogError(t(MEMORY_WRITE), expr.at)
        const to = signal(expr.name, expr.at)
        return [{ signal: to, index: bitOf(to, expr.index) }]
      }
      case 'part': {
        const { from, start, count } = partOf(expr)
        return Array.from({ length: count }, (_, offset) => ({ signal: from, index: start + offset }))
      }
      case 'concat':
        return [...expr.parts].reverse().flatMap(targets)
      default:
        throw new VerilogError(t('A value is given to a signal, to bits of one, or to several in braces.'), expr.at)
    }
  }
  const drive = (to: readonly Target[], bits: Bits, at: number): void => {
    to.forEach((target, place) => {
      const { name, dir } = target.signal
      if (dir === 'input') throw new VerilogError(t('“{name}” is an input: nothing inside the module gives it a value.', { name }), at)
      if (target.signal.bits[target.index] !== undefined) {
        throw new VerilogError(t('“{name}” is given a value in two places.', { name }), at)
      }
      target.signal.bits[target.index] = bits[place] ?? 0
    })
  }
  /** A name used on a pin without being declared is a wire of one bit. */
  const implicit = (expr: Expr): void => {
    if (expr.kind !== 'id' || signals.has(expr.name) || params.has(expr.name)) return
    signals.set(expr.name, { name: expr.name, at: expr.at, width: 1, low: 0, reg: false, bits: [undefined] })
  }

  // ---- Memories ----
  function memoryOf(name: string, at: number, range: Range | undefined, words: Range, written: boolean): Memory {
    const { width } = bounds(range)
    if (width > MAX_WORD_WIDTH) {
      throw new VerilogError(t('A word of a memory is at most {max} bits wide.', { max: MAX_WORD_WIDTH }), at)
    }
    const ends = [whole(words.high, 'first'), whole(words.low, 'first')]
    if (Math.min(...ends) !== 0) throw new VerilogError(t('The words of a memory are numbered from 0, as in [0:15].'), words.high.at)
    const count = Math.max(...ends) + 1
    if (count > MAX_WORDS) throw new VerilogError(t('A memory holds at most {max} words.', { max: MAX_WORDS }), words.high.at)
    let address = 1
    while (2 ** address < count) address++
    return { name, at, width, words: count, address, start: Array<bigint>(count).fill(0n), written, roms: [] }
  }
  /** The parameters of the part that keeps a memory. */
  const memoryParams = (memory: Memory): Record<string, number> => {
    const params: Record<string, number> = { address: memory.address, width: memory.width }
    memory.start.forEach((word, index) => {
      params[memoryCell(index)] = packWord(Array.from({ length: memory.width }, (_, bit) => Number((word >> BigInt(bit)) & 1n)))
    })
    return params
  }
  const addressBits = (memory: Memory, index: Expr): Bit[] =>
    build(index, Math.max(widthOf(index), memory.address), memory.address)
  /** The RAM of a memory something writes; it reads and writes at one address. */
  function placeRam(memory: Memory, index: Expr): string {
    if (memory.ram) {
      if (!alike(memory.ram.address, index)) {
        throw new VerilogError(
          t('“{name}” is written, so it is read and written at one address. A RAM has one.', { name: memory.name }),
          index.at,
        )
      }
      return memory.ram.id
    }
    const id = place('ram', memoryParams(memory), memory.name)
    memory.ram = { id, address: index }
    link(addressBits(memory, index), id, 'a')
    return id
  }
  /** A word of a memory: the RAM's, or that of a ROM for this address. */
  function readWord(memory: Memory, index: Expr): Bit[] {
    if (memory.written) return pinBits(placeRam(memory, index), 'q', memory.width)
    let rom = memory.roms.find((one) => alike(one.address, index))
    if (!rom) {
      rom = { id: place('rom', memoryParams(memory), memory.name), address: index }
      memory.roms.push(rom)
      link(addressBits(memory, index), rom.id, 'a')
    }
    return pinBits(rom.id, 'q', memory.width)
  }
  /** Reads an `initial` block, which may only give memories their first words. */
  function startWords(stmt: Stmt): void {
    here = stmt.at
    if (stmt.kind === 'block') return stmt.body.forEach(startWords)
    const memory = stmt.kind === 'set' && stmt.target.kind === 'bit' ? memories.get(stmt.target.name) : undefined
    if (!memory || stmt.kind !== 'set' || stmt.target.kind !== 'bit') {
      throw new VerilogError(t('An initial block is read only for the words a memory starts with, as in “mem[0] = 3;”.'), stmt.at)
    }
    const index = constant(stmt.target.index, MAX_VERILOG_WIDTH)
    const value = constant(stmt.value, Math.max(memory.width, widthOf(stmt.value)))
    if (index === undefined || value === undefined) {
      throw new VerilogError(t('A memory starts with numbers, given at numbered words.'), stmt.at)
    }
    if (index >= BigInt(memory.words)) throw new VerilogError(t('“{name}” has no word there.', { name: memory.name }), stmt.target.index.at)
    memory.start[Number(index)] = value & mask(memory.width)
  }
  /** A clocked block, or a branch of one, that may go on to write a memory. */
  const within = (mode: Mode, test: () => Bit[]): Mode => {
    if (!mode.writes) return mode
    const before = mode.path
    return { ...mode, path: () => (before ? gate('and', [before(), test()], 1) : test()) }
  }

  // ---- always ----
  const reading = <T>(env: Env, mode: Mode, work: () => T): T => {
    const before = scope
    // On a clock edge a signal still holds its old value, unless `=` gave it one.
    scope = (from, index) => (mode.clocked && !mode.blocking.has(from) ? undefined : env.get(from)?.[index])
    try {
      return work()
    } finally {
      scope = before
    }
  }
  const copy = (env: Env): Env => new Map([...env].map(([key, bits]) => [key, [...bits]]))

  /** Brings the ways a block can go back into one: where they differ, `pick` chooses. */
  function join(env: Env, ways: readonly Env[], pick: (values: Bit[][]) => Bit[], mode: Mode, at: number): void {
    const given = new Set(ways.flatMap((way) => [...way.keys()]))
    for (const to of given) {
      const held = env.get(to) ?? Array<Bit | undefined>(to.width).fill(undefined)
      env.set(to, held)
      const differing: number[] = []
      for (let index = 0; index < to.width; index++) {
        const values = ways.map((way) => way.get(to)?.[index])
        if (values.every((value) => value === undefined)) continue
        if (values.some((value) => value === undefined) && !mode.clocked) {
          throw new VerilogError(
            t('“{name}” is not given a value on every path. It would have to remember one, and only a clock edge does that.', {
              name: to.name,
            }),
            at,
          )
        }
        // On a clock edge, a path that says nothing keeps what the signal holds.
        const full = values.map((value) => value ?? { signal: to, index })
        if (full.every((value) => sameBit(value, full[0]))) held[index] = full[0]
        else differing.push(index)
      }
      if (differing.length === 0) continue
      const chosen = pick(
        ways.map((way) => differing.map((index) => way.get(to)?.[index] ?? { signal: to, index })),
      )
      differing.forEach((index, place) => {
        held[index] = chosen[place]
      })
    }
  }

  function run(stmt: Stmt, env: Env, mode: Mode): void {
    here = stmt.at
    switch (stmt.kind) {
      case 'block':
        for (const inner of stmt.body) run(inner, env, mode)
        return
      case 'set': {
        const { target } = stmt
        const memory = target.kind === 'bit' ? memories.get(target.name) : undefined
        if (memory && target.kind === 'bit') {
          if (mode.resetting) throw new VerilogError(t('A memory is not reset. Give it its first words in an initial block.'), stmt.at)
          if (!mode.writes) throw new VerilogError(t(MEMORY_WRITE), stmt.at)
          if (memory.wrote) {
            throw new VerilogError(t('“{name}” is given a word in two places. A memory has one port to write.', { name: memory.name }), stmt.at)
          }
          memory.wrote = true
          const data = reading(env, mode, () => build(stmt.value, Math.max(memory.width, widthOf(stmt.value)), memory.width))
          const ram = reading(env, mode, () => placeRam(memory, target.index))
          mode.writes.push({ ram, data, ...(mode.path ? { when: mode.path() } : {}) })
          return
        }
        const to = targets(stmt.target)
        const bits = reading(env, mode, () => build(stmt.value, Math.max(to.length, widthOf(stmt.value)), to.length))
        to.forEach((target, place) => {
          if (!target.signal.reg) {
            throw new VerilogError(
              t('“{name}” is given a value in an always block, so it has to be declared a reg.', {
                name: target.signal.name,
              }),
              stmt.at,
            )
          }
          if (mode.clocked && stmt.blocking) mode.blocking.add(target.signal)
          let held = env.get(target.signal)
          if (!held) env.set(target.signal, (held = Array<Bit | undefined>(target.signal.width).fill(undefined)))
          held[target.index] = bits[place]
        })
        return
      }
      case 'if': {
        const known = reading(env, mode, () => truthConstant(stmt.test))
        if (known !== undefined) {
          const taken = known ? stmt.then : stmt.else
          if (taken) run(taken, env, mode)
          return
        }
        const test = reading(env, mode, () => truth(stmt.test))
        const yes = copy(env)
        const no = copy(env)
        run(stmt.then, yes, within(mode, () => test))
        if (stmt.else) run(stmt.else, no, within(mode, () => invert(test)))
        join(env, [no, yes], ([low, high]) => mux(test, high, low), mode, stmt.at)
        return
      }
      case 'case': {
        const width = reading(env, mode, () => widthOf(stmt.subject))
        const labels = stmt.arms.map((arm) =>
          arm.values.map((value) => constant(value, Math.max(width, widthOf(value)))),
        )
        const named = new Set(labels.flat().filter((value) => value !== undefined && value < 1n << BigInt(width)))
        if (labels.some((values) => values.includes(undefined)) || !worthOneMux(width, named.size)) {
          // Too many ways for one multiplexer, or too few of them named: the arms are tried one after another.
          let chain = stmt.otherwise
          for (const arm of [...stmt.arms].reverse()) {
            const test = arm.values
              .map((value): Expr => ({ kind: 'binary', at: value.at, op: '==', left: stmt.subject, right: value }))
              .reduce((left, right): Expr => ({ kind: 'binary', at: right.at, op: '||', left, right }))
            chain = chain
              ? { kind: 'if', at: stmt.at, test, then: arm.body, else: chain }
              : { kind: 'if', at: stmt.at, test, then: arm.body }
          }
          if (chain) run(chain, env, mode)
          return
        }
        const subject = reading(env, mode, () => build(stmt.subject, width, width))
        // Which arm each value of the subject takes: the first that names it, else the default.
        const armOf = Array<number>(2 ** width).fill(stmt.arms.length)
        labels.forEach((values, arm) => {
          for (const value of values) {
            if (value! < BigInt(armOf.length) && armOf[Number(value)] === stmt.arms.length) armOf[Number(value)] = arm
          }
        })
        const taken = [...new Set(armOf)]
        const ways = taken.map((arm) => {
          const way = copy(env)
          const body = arm === stmt.arms.length ? stmt.otherwise : stmt.arms[arm].body
          const inCase: Mode = {
            ...mode,
            path: () => {
              throw new VerilogError(t('A memory is given its word under an “if”, not in a “case”.'), stmt.at)
            },
          }
          if (body) run(body, way, mode.writes ? inCase : mode)
          return way
        })
        join(
          env,
          ways,
          (values) => {
            const size = values[0].length
            const inputs = Object.fromEntries(armOf.map((arm, value) => [`in${value}`, values[taken.indexOf(arm)]]))
            return part('mux', { inputs: armOf.length, select: width, width: size }, { ...inputs, sel: subject })('out', size)
          },
          mode,
          stmt.at,
        )
        return
      }
    }
  }

  /** Whether the test of an `if` asks for the level an edge leads to: `rst` for posedge, `!rst` for negedge. */
  const asks = (test: Expr, edge: Edge): boolean => {
    const named = (expr: Expr): boolean =>
      expr.kind === 'id' && edge.signal.kind === 'id' && expr.name === edge.signal.name
    if (test.kind === 'binary' && test.op === '==' && named(test.left)) {
      return test.right.kind === 'num' && test.right.value === (edge.edge === 'posedge' ? 1n : 0n)
    }
    if (edge.edge === 'posedge') return named(test)
    return test.kind === 'unary' && (test.op === '!' || test.op === '~') && named(test.arg)
  }
  /** One bit that is 1 at the level an edge leads to. */
  const level = (edge: Edge): Bit[] => {
    const width = widthOf(edge.signal)
    const bits = build(edge.signal, width, 1)
    return edge.edge === 'posedge' ? bits : invert(bits)
  }

  function clocked(item: Extract<Item, { kind: 'always' }>): void {
    const edges = [...item.edges]
    let body = only(item.body)
    // Every edge but the clock sets or resets at once: it is asked for first, before the clock is.
    const forced: { readonly active: Bit[]; readonly env: Env }[] = []
    while (edges.length > 1) {
      const first = body
      const found = first?.kind === 'if' ? edges.findIndex((edge) => asks(first.test, edge)) : -1
      if (first?.kind !== 'if' || found === -1) {
        throw new VerilogError(
          t('With more than one edge, the block has to start with an “if” on the signal that resets it, as in “if (rst) q <= 0; else …”.'),
          body?.at ?? item.at,
        )
      }
      const [edge] = edges.splice(found, 1)
      const env: Env = new Map()
      run(first.then, env, { clocked: true, blocking: new Set(), resetting: true })
      forced.push({ active: level(edge), env })
      body = only(first.else)
    }
    const clock = level(edges[0])

    // `if (en) …` with no else around everything is the enable of the registers.
    let enable: Bit[] | undefined
    if (body?.kind === 'if' && !body.else && truthConstant(body.test) === undefined) {
      enable = truth(body.test)
      body = only(body.then)
    }
    const env: Env = new Map()
    const writes: Write[] = []
    const always = enable
    if (body) run(body, env, { clocked: true, blocking: new Set(), writes, ...(always ? { path: () => always } : {}) })
    for (const write of writes) {
      link(write.data, write.ram, 'd')
      link(clock, write.ram, 'clk')
      link(write.when ?? [1], write.ram, 'we')
    }

    const kept = new Set<Signal>([...env.keys(), ...forced.flatMap((force) => [...force.env.keys()])])
    for (const to of kept) {
      here = to.at
      if (to.init !== undefined && constant(to.init, to.width) !== 0n) {
        throw new VerilogError(t('A register starts at 0, and “{name}” is said to start at something else.', { name: to.name }), to.init.at)
      }
      const next = env.get(to)
      let data: Bit[] = Array.from({ length: to.width }, (_, index) => next?.[index] ?? { signal: to, index })
      const clears: Bit[][] = []
      const sets: Bit[][] = []
      for (const force of forced) {
        const value = force.env.get(to)
        if (!value) continue
        if (value.every((bit) => bit === 0)) clears.push(force.active)
        else if (to.width === 1 && value[0] === 1) sets.push(force.active)
        else {
          throw new VerilogError(
            t('A register is reset to 0, and one of a single bit can also be set to 1. “{name}” is reset to something else.', {
              name: to.name,
            }),
            to.at,
          )
        }
      }
      const any = (signals: Bit[][]): Bit[] | undefined =>
        signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : gate('or', signals, 1)
      const flipFlop = to.width === 1 && (enable === undefined || sets.length > 0)
      let out: Bit[]
      if (flipFlop) {
        if (enable) data = mux(enable, data, refs(to, 0, 1))
        out = part('dff', {}, { d: data, clk: clock, reset: any(clears), set: any(sets) }, to.name)('q', 1)
      } else {
        out = part(
          'register',
          { width: to.width },
          { d: data, clk: clock, en: enable, reset: any(clears) },
          to.name,
        )('q', to.width)
      }
      drive(
        out.map((_, index) => ({ signal: to, index })),
        out,
        item.at,
      )
    }
  }

  function combinational(item: Extract<Item, { kind: 'always' }>): void {
    const env: Env = new Map()
    run(item.body, env, { clocked: false, blocking: new Set() })
    for (const [to, bits] of env) {
      bits.forEach((bit, index) => {
        if (bit !== undefined) drive([{ signal: to, index }], [bit], item.at)
      })
    }
  }

  // ---- The module ----
  for (const param of module.params) {
    if (params.has(param.name)) throw new VerilogError(t('“{name}” is declared twice.', { name: param.name }), param.at)
    const size = param.range
      ? bounds(param.range).width
      : param.value.kind === 'num'
        ? param.value.size
        : undefined
    const value = constant(param.value, size ?? MAX_VERILOG_WIDTH)
    if (value === undefined) throw new VerilogError(t('“{name}” has to be a number.', { name: param.name }), param.value.at)
    params.set(param.name, size === undefined ? { value } : { value, size })
  }

  // A port of the old style is declared in pieces: in the header, as an output, as a reg.
  const declared = new Map<
    string,
    { at: number; dir?: 'input' | 'output'; reg: boolean; range?: Range; init?: Expr; words?: Range }
  >()
  for (const decl of module.decls) {
    const known = declared.get(decl.name)
    if (known && ((known.dir && decl.dir) || (!decl.dir && !known.dir))) {
      throw new VerilogError(t('“{name}” is declared twice.', { name: decl.name }), decl.at)
    }
    if (params.has(decl.name)) throw new VerilogError(t('“{name}” is already the name of a number.', { name: decl.name }), decl.at)
    declared.set(decl.name, {
      at: known?.at ?? decl.at,
      dir: known?.dir ?? decl.dir,
      reg: (known?.reg ?? false) || decl.reg === true,
      range: known?.range ?? decl.range,
      init: known?.init ?? decl.init,
      words: known?.words ?? decl.words,
    })
  }
  const written = new Set(module.items.flatMap((item) => (item.kind === 'always' ? [...wordsGiven(item.body)] : [])))
  const ports: Port[] = []
  const outputs: Signal[] = []
  const names = [...new Set([...module.ports, ...declared.keys()])]
  for (const name of names) {
    const decl = declared.get(name)
    const inHeader = module.ports.includes(name)
    if (!decl?.dir && inHeader) {
      throw new VerilogError(t('“{name}” is a port, and nothing says whether it is an input or an output.', { name }), decl?.at ?? module.at)
    }
    if (!decl) continue
    here = decl.at
    if (decl.words) {
      memories.set(name, memoryOf(name, decl.at, decl.range, decl.words, written.has(name)))
      continue
    }
    const { low, width } = bounds(decl.range)
    if (decl.dir === 'input' && decl.reg) throw new VerilogError(t('An input cannot be a reg, and “{name}” is said to be both.', { name }), decl.at)
    const made: Signal = {
      name,
      at: decl.at,
      width,
      low,
      reg: decl.reg,
      bits: Array<Bit | undefined>(width).fill(undefined),
      ...(decl.dir ? { dir: decl.dir } : {}),
      ...(decl.init ? { init: decl.init } : {}),
    }
    signals.set(name, made)
    if (decl.dir === 'input') {
      const id = place('input', { width }, name)
      made.bits.splice(0, width, ...pinBits(id, 'out', width))
      ports.push({ name, dir: 'input', width, part: id })
    } else if (decl.dir === 'output') outputs.push(made)
  }

  // The words a memory starts with are known before any part of it is placed.
  for (const item of module.items) if (item.kind === 'initial') startWords(item.body)

  for (const item of module.items) {
    here = item.at
    switch (item.kind) {
      case 'initial':
        break
      case 'assign': {
        const to = targets(item.target)
        drive(to, build(item.value, Math.max(to.length, widthOf(item.value)), to.length), item.at)
        break
      }
      case 'gate': {
        item.pins.forEach(implicit)
        if (item.pins.length < 2) throw new VerilogError(t('A gate has an output and at least one input.'), item.at)
        const one = item.type === 'not' || item.type === 'buf'
        const outs = one ? item.pins.slice(0, -1) : item.pins.slice(0, 1)
        const ins = (one ? item.pins.slice(-1) : item.pins.slice(1)).map((pin) => build(pin, widthOf(pin), 1))
        const out = gate(item.type, ins, 1)
        for (const pin of outs) {
          const to = targets(pin)
          if (to.length !== 1) throw new VerilogError(t('A gate gives one bit, and this signal is wider.'), pin.at)
          drive(to, out, pin.at)
        }
        break
      }
      case 'instance': {
        const child = modules.get(item.module)
        if (!child) throw new VerilogError(t('No module is called “{name}”.', { name: item.module }), item.at)
        room()
        const added = addSubcircuit(doc, subRefOf(child.circuit), spot())
        doc = added.doc
        const given = new Map<string, Expr | undefined>()
        if (item.named) {
          for (const pin of item.named) {
            if (!child.ports.some((port) => port.name === pin.port)) {
              throw new VerilogError(t('“{module}” has no port called “{port}”.', { module: item.module, port: pin.port }), pin.at)
            }
            if (given.has(pin.port)) throw new VerilogError(t('The port “{port}” is attached twice.', { port: pin.port }), pin.at)
            given.set(pin.port, pin.value)
          }
        } else {
          const placed = item.placed ?? []
          if (placed.length > child.ports.length) {
            throw new VerilogError(
              t('“{module}” has {ports} ports, and {attached} are attached here.', {
                module: item.module,
                ports: child.ports.length,
                attached: placed.length,
              }),
              item.at,
            )
          }
          placed.forEach((value, index) => given.set(child.ports[index].name, value))
        }
        for (const port of child.ports) {
          const value = given.get(port.name)
          if (!value) continue
          implicit(value)
          if (port.dir === 'input') {
            link(build(value, Math.max(port.width, widthOf(value)), port.width), added.id, port.part)
          } else {
            const to = targets(value)
            drive(to, fit(pinBits(added.id, port.part, port.width), to.length), value.at)
          }
        }
        break
      }
      case 'always':
        if (item.edges.length > 0) clocked(item)
        else combinational(item)
        break
    }
  }

  for (const made of outputs) {
    here = made.at
    const id = place('output', { width: made.width }, made.name)
    link(refs(made, 0, made.width), id, 'in')
    ports.push({ name: made.name, dir: 'output', width: made.width, part: id })
  }
  // The ports of a part come in the order of the header.
  ports.sort((a, b) => module.ports.indexOf(a.name) - module.ports.indexOf(b.name))

  // ---- From bits to wires ----
  const followed = new Map<Signal, (Solid | undefined)[]>()
  const follow = (bit: Bit, at: number, trail: Set<string>): Solid => {
    if (typeof bit === 'number' || 'source' in bit) return bit
    const { index } = bit
    const from = bit.signal
    const known = followed.get(from)?.[index]
    if (known !== undefined) return known
    const giver = from.bits[index]
    if (giver === undefined) throw new VerilogError(t('Nothing gives “{name}” a value.', { name: from.name }), at)
    const key = `${from.name}.${index}`
    if (trail.has(key)) {
      throw new VerilogError(t('“{name}” is given its own value, with no part in between.', { name: from.name }), from.at)
    }
    trail.add(key)
    const found = follow(giver, at, trail)
    trail.delete(key)
    let memo = followed.get(from)
    if (!memo) followed.set(from, (memo = Array<Solid | undefined>(from.width).fill(undefined)))
    memo[index] = found
    return found
  }

  const fixed = new Map<string, Source>()
  const fixedPin = (value: 0 | 1, width: number): Source => {
    const key = `${value}/${width}`
    let pin = fixed.get(key)
    if (!pin) fixed.set(key, (pin = { component: place('const', { value, width }), port: 'out', width }))
    return pin
  }
  const splitters = new Map<string, string>()
  /** Branch `index` of a splitter that takes `from` apart `each` bits at a time. */
  const branch = (from: Source, each: number, index: number): Source => {
    const key = `${from.component}.${from.port}/${each}`
    let id = splitters.get(key)
    if (id === undefined) {
      id = place('split', { width: from.width, each })
      wire(from, id, 'in')
      splitters.set(key, id)
    }
    return { component: id, port: `d${index}`, width: Math.min(each, from.width - index * each) }
  }
  /** Whether one pin gives a run of bits as it stands: a constant, a whole pin, or a branch of an even splitter. */
  const standing = (run: readonly Solid[]): boolean => {
    const first = run[0]
    return typeof first === 'number' || first.index % run.length === 0
  }
  const pinOfRun = (run: readonly Solid[]): Source => {
    const first = run[0]
    if (typeof first === 'number') return fixedPin(first, run.length)
    if (first.index === 0 && run.length === first.source.width) return first.source
    return branch(first.source, run.length, first.index / run.length)
  }
  const merged = new Map<string, Source>()
  const pinOf = (bits: readonly Solid[]): Source => {
    const key = keyOf(bits)
    const known = merged.get(key)
    if (known) return known
    // Runs: bits that follow each other on one pin, or constants of one value.
    const runs: Solid[][] = []
    for (const bit of bits) {
      const run = runs[runs.length - 1]
      const last = run?.[run.length - 1]
      const follows =
        last !== undefined &&
        (typeof bit === 'number' || typeof last === 'number'
          ? last === bit
          : last.source.component === bit.source.component &&
            last.source.port === bit.source.port &&
            last.index + 1 === bit.index)
      if (follows) run.push(bit)
      else runs.push([bit])
    }
    let pin: Source
    if (runs.length === 1 && standing(runs[0])) pin = pinOfRun(runs[0])
    else {
      // A merger takes branches of one width, the last one what is left.
      const each = runs[0].length
      const even =
        runs.length > 1 &&
        runs.every((run, index) => standing(run) && (index === runs.length - 1 ? run.length <= each : run.length === each))
      const branches = even ? runs.map(pinOfRun) : bits.map((bit) => pinOfRun([bit]))
      const id = place('merge', { width: bits.length, each: even ? each : 1 })
      branches.forEach((from, index) => wire(from, id, `d${index}`))
      pin = { component: id, port: 'out', width: bits.length }
    }
    merged.set(key, pin)
    return pin
  }

  for (const { bits, component, port, at } of links) {
    here = at
    wire(pinOf(bits.map((bit) => follow(bit, at, new Set()))), component, port)
  }
  return { doc: autoLayout(doc), ports }
}

/**
 * The circuits a Verilog text describes, one for each module, or what is
 * wrong with it and where.
 */
export function verilogCircuits(text: string, options: VerilogOptions): VerilogBuilt | VerilogProblem {
  if (text.length > MAX_VERILOG_LENGTH) {
    return { problem: t('This text is longer than {max} characters, the most that is read.', {
        max: MAX_VERILOG_LENGTH.toLocaleString('en-US'),
      }) }
  }
  try {
    const modules = parseVerilog(text)
    if (modules.length === 0) return { problem: t('There is no module in this text. A circuit starts with “module”.') }
    const byName = new Map<string, Module>()
    for (const module of modules) {
      if (byName.has(module.name)) throw new VerilogError(t('Two modules are called “{name}”.', { name: module.name }), module.at)
      byName.set(module.name, module)
    }
    if (Object.keys(options.circuits).length + modules.length > MAX_CIRCUITS) {
      return { problem: t('A project holds at most {max} circuits, and these modules would go past that.', { max: MAX_CIRCUITS }) }
    }

    // A module is built after the modules it uses.
    const order: Module[] = []
    const state = new Map<Module, 'open' | 'done'>()
    const visit = (module: Module, at: number): void => {
      if (state.get(module) === 'done') return
      if (state.get(module) === 'open') throw new VerilogError(t('“{name}” would contain itself.', { name: module.name }), at)
      state.set(module, 'open')
      for (const item of module.items) {
        if (item.kind !== 'instance') continue
        const child = byName.get(item.module)
        if (!child) throw new VerilogError(t('No module is called “{name}”.', { name: item.module }), item.at)
        visit(child, item.at)
      }
      state.set(module, 'done')
      order.push(module)
    }
    for (const module of modules) visit(module, module.at)

    const taken = new Set(Object.values(options.circuits).map((circuit) => circuit.name))
    const built = new Map<string, Built>()
    const circuits: Circuit[] = []
    let next = options.nextCircuit
    for (const module of order) {
      const { doc, ports } = buildModule(module, built, options.gates)
      const base = cleanCircuitName(module.name) ?? 'Module'
      let name = base
      for (let count = 2; taken.has(name); count++) name = `${base.slice(0, MAX_CIRCUIT_NAME - 4)} ${count}`
      taken.add(name)
      const circuit: Circuit = { id: `k${next++}`, name, doc }
      built.set(module.name, { circuit, ports })
      circuits.push(circuit)
    }
    const all = { ...options.circuits, ...Object.fromEntries(circuits.map((circuit) => [circuit.id, circuit])) }
    if (largestFlat(all) > MAX_FLAT_PARTS) {
      return { problem: t('Opened up, these modules come to more than {max} parts.', {
          max: MAX_FLAT_PARTS.toLocaleString('en-US'),
        }) }
    }
    const used = new Set(modules.flatMap((module) => module.items.flatMap((item) => (item.kind === 'instance' ? [item.module] : []))))
    const top = [...modules].reverse().find((module) => !used.has(module.name)) ?? modules[modules.length - 1]
    return { circuits, top: built.get(top.name)!.circuit.id }
  } catch (error) {
    if (error instanceof VerilogError) return { problem: error.message, ...placeOf(text, error.offset) }
    if (error instanceof RangeError) return { problem: t('This text is nested too deeply to read.') }
    throw error
  }
}
