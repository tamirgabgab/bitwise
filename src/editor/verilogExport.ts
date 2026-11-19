import {
  ALU_OPERATIONS,
  ANY,
  branchWidths,
  builtinComponents,
  memoryCell,
  ruleFrom,
  ruleOutput,
  ruleTo,
  ruleWhen,
  stateOutput,
  unpackWord,
  wordCount,
} from '../core/index.ts'
import type { Params, PortSpec, Signal } from '../core/index.ts'
import { t } from '../i18n/index.ts'
import { terminalNets } from './connectivity.ts'
import { NET_PIN, NET_TYPE, SUB_TYPE, isAnnotation, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'
import { interfaceOf } from './subcircuit.ts'
import type { Circuits } from './subcircuit.ts'
import { minimize } from './sumOfProducts.ts'

/*
 * A circuit written out as Verilog, for a reader who goes on to other
 * tools. Only at radix 2, where a digit is a bit.
 *
 * Every circuit becomes a module: the open one, and before it each circuit
 * it uses. A switch is an `input` and an output part an `output`. A push
 * button, a clock and a cycle are inputs too, and when they sit inside a
 * circuit that is used as a part they are handed up to the module on top,
 * since a module has nowhere else to get them from.
 *
 * The code is written the way a designer would write it: gate primitives
 * for gates of one bit, `assign` with operators for buses and for the
 * larger parts, and `always` for what keeps a value. It stays inside what
 * `verilogImport.ts` reads, except for a memory (ROM, RAM) and an SR latch.
 * Delays are left out: the code says what the circuit computes, not when.
 */

/** The file a circuit is written to. */
export interface VerilogFile {
  readonly text: string
  /** The name of the module of the circuit itself, the last in the text. */
  readonly top: string
}

const KEYWORDS = [
  'always', 'and', 'assign', 'automatic', 'begin', 'buf', 'bufif0', 'bufif1', 'case', 'casex', 'casez',
  'cell', 'cmos', 'config', 'deassign', 'default', 'defparam', 'design', 'disable', 'edge', 'else', 'end',
  'endcase', 'endconfig', 'endfunction', 'endgenerate', 'endmodule', 'endprimitive', 'endspecify',
  'endtable', 'endtask', 'event', 'for', 'force', 'forever', 'fork', 'function', 'generate', 'genvar',
  'highz0', 'highz1', 'if', 'ifnone', 'incdir', 'include', 'initial', 'inout', 'input', 'instance',
  'integer', 'join', 'large', 'liblist', 'library', 'localparam', 'macromodule', 'medium', 'module',
  'nand', 'negedge', 'nmos', 'nor', 'noshowcancelled', 'not', 'notif0', 'notif1', 'or', 'output',
  'parameter', 'pmos', 'posedge', 'primitive', 'pull0', 'pull1', 'pulldown', 'pullup',
  'pulsestyle_onevent', 'pulsestyle_ondetect', 'rcmos', 'real', 'realtime', 'reg', 'release', 'repeat',
  'rnmos', 'rpmos', 'rtran', 'rtranif0', 'rtranif1', 'scalared', 'showcancelled', 'signed', 'small',
  'specify', 'specparam', 'strong0', 'strong1', 'supply0', 'supply1', 'table', 'task', 'time', 'tran',
  'tranif0', 'tranif1', 'tri', 'tri0', 'tri1', 'triand', 'trior', 'trireg', 'unsigned', 'use', 'uwire',
  'vectored', 'wait', 'wand', 'weak0', 'weak1', 'while', 'wire', 'wor', 'xnor', 'xor',
  // SystemVerilog words a reader's tool may also refuse as names.
  'logic', 'bit', 'byte', 'int', 'always_comb', 'always_ff', 'always_latch', 'unique', 'priority', 'final',
]

/** Hands out names that Verilog takes, each one once. */
class Names {
  private readonly used = new Set<string>(KEYWORDS)

  /** A name close to `wanted`; `fallback` when nothing of it can be kept. */
  take(wanted: string | undefined, fallback: string): string {
    let base = (wanted ?? '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
    if (base === '') base = fallback
    if (/^[0-9]/.test(base)) base = `${fallback}_${base}`
    let name = base
    for (let count = 2; this.used.has(name); count++) name = `${base}_${count}`
    this.used.add(name)
    return name
  }

  /** `base1`, `base2`, ...: the first that is free. */
  numbered(base: string): string {
    for (let count = 1; ; count++) {
      const name = `${base}${count}`
      if (this.used.has(name)) continue
      this.used.add(name)
      return name
    }
  }
}

interface ModulePort {
  readonly name: string
  readonly width: number
  /** The part of this circuit the port stands for. */
  readonly part?: string
  /** A port handed up from a circuit used as a part: the part, and the port of its module. */
  readonly child?: { readonly instance: string; readonly port: string }
  /** An output that stands for a number display, which is no pin when the circuit is used as a part. */
  readonly display?: true
}

interface ModuleInfo {
  readonly name: string
  /** The switches, in the order of the pins of the circuit. */
  readonly inputs: readonly ModulePort[]
  readonly outputs: readonly ModulePort[]
  /** Buttons, clocks and cycles: its own, and those handed up from inside. */
  readonly extras: readonly ModulePort[]
  /** The name of the instance of each circuit used as a part. */
  readonly instances: ReadonlyMap<string, string>
  readonly names: Names
}

class Refusal extends Error {}

const SOURCES: readonly string[] = ['button', 'clock', 'cycle']
const idNumber = (id: string): number => Number(id.slice(1)) || 0
const inOrder = (doc: CircuitDoc): DocComponent[] =>
  Object.values(doc.components).sort((a, b) => idNumber(a.id) - idNumber(b.id))

const range = (width: number): string => (width > 1 ? `[${width - 1}:0] ` : '')
const zeros = (width: number): string => `${width}'d0`
const number = (width: number, value: number): string => `${width}'d${value}`
const bits = (word: Signal): string =>
  `${word.length}'b${[...word].reverse().map((digit) => (digit === 0 || digit === 1 ? digit : 'x')).join('')}`

/** One bit of a signal `width` wide. A signal of one bit has no index. */
const bit = (signal: string, index: number, width: number): string => (width === 1 ? signal : `${signal}[${index}]`)

/** Bits `high` down to `low` of a signal `width` wide. */
function slice(signal: string, high: number, low: number, width: number): string {
  if (low === 0 && high === width - 1) return signal
  return high === low ? bit(signal, low, width) : `${signal}[${high}:${low}]`
}

/** What an input that nothing drives counts as, when it is not simply floating. */
const UNATTACHED: Readonly<Record<string, string>> = {
  cin: "1'b0",
  bin: "1'b0",
  en: "1'b1",
  load: "1'b0",
  reset: "1'b0",
  set: "1'b0",
  we: "1'b0",
}

/** `a ? x : b ? y : z`, the last value standing for every other case. */
function choose(cases: readonly { readonly when: string; readonly then: string }[], otherwise: string): string {
  return [...cases.map((item) => `${item.when} ? ${item.then}`), otherwise].join(' : ')
}

/**
 * The circuit `top` of a project as Verilog, with every circuit it uses,
 * or a message for the user when it cannot be written.
 */
export function circuitVerilog(circuits: Circuits, top: string, radix: number): VerilogFile | { problem: string } {
  if (radix !== 2) return { problem: t('Verilog is written only at radix 2, where a digit is a bit.') }
  if (!Object.hasOwn(circuits, top)) return { problem: t('There is no such circuit.') }
  const moduleNames = new Names()
  const infos = new Map<string, ModuleInfo>()
  const order: string[] = []
  const visiting = new Set<string>()

  const infoOf = (id: string): ModuleInfo => {
    const known = infos.get(id)
    if (known) return known
    if (visiting.has(id) || !Object.hasOwn(circuits, id)) {
      throw new Refusal(t('A circuit here uses itself or a circuit that is gone, so it cannot be written.'))
    }
    visiting.add(id)
    const circuit = circuits[id]
    const names = new Names()
    const widthOf = (part: string): number => circuit.doc.components[part]?.params.width ?? 1
    const pins = interfaceOf(circuit.doc)
    const inputs = pins.inputs.map((pin) => ({ name: names.take(pin.label, 'in'), width: widthOf(pin.port), part: pin.port }))
    const outputs: ModulePort[] = [
      ...pins.outputs.map((pin) => ({ name: names.take(pin.label, 'out'), width: widthOf(pin.port), part: pin.port })),
      ...inOrder(circuit.doc)
        .filter((part) => part.type === 'display')
        .map((part) => ({
          name: names.take(part.label, 'display'),
          width: part.params.digits,
          part: part.id,
          display: true as const,
        })),
    ]
    const extras: ModulePort[] = []
    const instances = new Map<string, string>()
    for (const part of inOrder(circuit.doc)) {
      if (SOURCES.includes(part.type)) {
        const fallback = part.type === 'clock' ? 'clk' : part.type
        extras.push({ name: names.take(part.label, fallback), width: widthOf(part.id), part: part.id })
      } else if (part.type === SUB_TYPE && part.sub) {
        const child = infoOf(part.sub.circuit)
        const instance = names.take(part.label ? `u_${part.label}` : undefined, `u_${child.name}`)
        instances.set(part.id, instance)
        for (const port of child.extras) {
          extras.push({
            name: names.take(`${instance}_${port.name}`, 'source'),
            width: port.width,
            child: { instance: part.id, port: port.name },
          })
        }
      }
    }
    visiting.delete(id)
    const info = { name: moduleNames.take(circuit.name, 'circuit'), inputs, outputs, extras, instances, names }
    infos.set(id, info)
    order.push(id)
    return info
  }

  try {
    const info = infoOf(top)
    const text = order.map((id) => moduleText(circuits[id].name, circuits[id].doc, infos.get(id)!, infoOf)).join('\n')
    return { text: `// Written by Bitwise. Delays are left out.\n\n${text}`, top: info.name }
  } catch (error) {
    if (error instanceof Refusal) return { problem: error.message }
    throw error
  }
}

interface Pin {
  readonly part: string
  readonly port: string
  readonly direction: PortSpec['direction']
  readonly width: number
}

function moduleText(title: string, doc: CircuitDoc, info: ModuleInfo, infoOf: (id: string) => ModuleInfo): string {
  const { names } = info
  const declarations: string[] = []
  const lines: string[] = []
  const say = (...text: string[]): void => void lines.push(...text)
  const declare = (kind: 'wire' | 'reg', name: string, width: number, rest = ''): void =>
    void declarations.push(`  ${kind} ${range(width)}${name}${rest};`)

  // ---- Pins and nets ----
  const parts = inOrder(doc).filter((part) => !isAnnotation(part.type) && part.type !== NET_TYPE)
  const pinsOf = (part: DocComponent): Pin[] => {
    if (part.type === SUB_TYPE) {
      if (!part.sub) return []
      const child = infoOf(part.sub.circuit)
      const side = (ports: readonly ModulePort[], direction: PortSpec['direction']): Pin[] =>
        ports.flatMap((port) => (port.part ? [{ part: part.id, port: port.part, direction, width: port.width }] : []))
      return [...side(child.inputs, 'in'), ...side(child.outputs.filter((port) => !port.display), 'out')]
    }
    if (!builtinComponents.has(part.type)) return []
    return builtinComponents
      .get(part.type)
      .ports(part.params)
      .map((port) => ({ part: part.id, port: port.name, direction: port.direction, width: port.width }))
  }
  const keyOf = (part: string, port: string): string => terminalKey({ kind: 'pin', component: part, port })
  const roots = terminalNets(doc)
  interface Net {
    readonly drivers: Pin[]
    /** The output parts that show this net. */
    readonly shown: string[]
    width?: number
    label?: string
    name?: string
  }
  const nets = new Map<string, Net>()
  const netOf = (part: string, port: string): Net | undefined => {
    const root = roots.get(keyOf(part, port))
    if (root === undefined) return undefined
    let net = nets.get(root)
    if (!net) {
      net = { drivers: [], shown: [] }
      nets.set(root, net)
    }
    return net
  }
  for (const part of inOrder(doc)) {
    if (part.type === NET_TYPE && part.label) {
      const net = netOf(part.id, NET_PIN)
      if (net) net.label ??= part.label
    }
  }
  const nameOfPart = (id: string): string => doc.components[id]?.label ?? doc.components[id]?.type ?? id
  for (const part of parts) {
    for (const pin of pinsOf(part)) {
      const net = netOf(pin.part, pin.port)
      if (!net) continue
      if (net.width !== undefined && net.width !== pin.width) {
        throw new Refusal(
          t('In “{circuit}” a wire at {part} joins pins of different widths. Make the widths the same first.', {
            circuit: title,
            part: nameOfPart(pin.part),
          }),
        )
      }
      net.width = pin.width
      if (pin.direction === 'out') net.drivers.push(pin)
      else if (part.type === 'output') net.shown.push(part.id)
    }
  }

  // ---- The signal of every pin ----
  const portOf = new Map<string, ModulePort>()
  for (const port of [...info.inputs, ...info.extras]) if (port.part) portOf.set(port.part, port)
  const signals = new Map<string, string>()
  const nameNet = (net: Net, wanted: string | undefined): string => {
    if (net.name === undefined) {
      net.name = wanted === undefined && net.label === undefined ? names.numbered('w') : names.take(net.label ?? wanted, 'w')
    }
    return net.name
  }
  // A net that one of the module's own inputs drives alone is that input.
  for (const part of parts) {
    const port = portOf.get(part.id)
    if (!port) continue
    const net = netOf(part.id, 'out')
    if (net && net.drivers.length === 1) net.name = port.name
    signals.set(keyOf(part.id, 'out'), port.name)
    if (net && net.drivers.length > 1) {
      if (net.name === undefined) declare('wire', nameNet(net, undefined), port.width)
      say(`  assign ${net.name} = ${port.name};`)
    }
  }

  // Which outputs are kept in a `reg`, so a reader further up declares them right.
  const regs = new Set<string>()
  const inits = new Map<string, string>()
  const keeps = (part: DocComponent, port: string, init: string): void => {
    regs.add(keyOf(part.id, port))
    inits.set(keyOf(part.id, port), init)
  }
  for (const part of parts) {
    if (['dff', 'tff', 'jkff', 'sr'].includes(part.type)) keeps(part, 'q', " = 1'b0")
    else if (part.type === 'register' || part.type === 'counter') keeps(part, 'q', ` = ${zeros(part.params.width)}`)
    else if (part.type === 'fsm' && part.params.mealy === 1) {
      for (let output = 0; output < part.params.outputs; output++) keeps(part, `out${output}`, '')
    }
  }
  /** The signal an output pin drives, declared on first use. */
  const out = (part: DocComponent, port: string, width: number, kind: 'wire' | 'reg' = 'wire', rest = ''): string => {
    const key = keyOf(part.id, port)
    const known = signals.get(key)
    if (known !== undefined) return known
    const net = netOf(part.id, port)
    const wanted = part.label === undefined ? undefined : `${part.label}_${port}`
    let name: string
    if (net && net.drivers.length === 1 && kind === 'wire' && net.shown.length > 0) {
      // The only driver of an output of the module drives the port itself.
      name = info.outputs.find((item) => item.part === net.shown[0])!.name
      net.name = name
    } else if (net && net.drivers.length === 1) {
      name = nameNet(net, wanted)
      declare(kind, name, width, rest)
    } else {
      name = wanted === undefined ? names.numbered('w') : names.take(wanted, 'w')
      declare(kind, name, width, rest)
      if (net) {
        // Several outputs on one wire: each drives it through a name of its own.
        if (net.name === undefined) declare('wire', nameNet(net, undefined), width)
        say(`  assign ${net.name} = ${name};`)
      }
    }
    signals.set(key, name)
    return name
  }
  const attached = (part: DocComponent, port: string): boolean => (netOf(part.id, port)?.drivers.length ?? 0) > 0
  /** Whether anything reads this output. */
  const wired = (part: DocComponent, port: string): boolean => netOf(part.id, port) !== undefined
  /** What an input pin reads: the signal on its wire, or what an unattached pin counts as. */
  const src = (part: DocComponent, port: string, width: number): string => {
    const net = netOf(part.id, port)
    if (net && net.drivers.length > 0) {
      if (net.name === undefined) {
        // Driven by a part further down: its name is settled now, and that part declares it.
        const driver = net.drivers[0]
        const from = doc.components[driver.part]
        const key = keyOf(driver.part, driver.port)
        if (net.drivers.length === 1) return out(from, driver.port, driver.width, regs.has(key) ? 'reg' : 'wire', inits.get(key) ?? '')
        declare('wire', nameNet(net, undefined), width)
      }
      return net.name!
    }
    return UNATTACHED[port] ?? `${width}'bz`
  }
  /** As `src`, but always a name, so that bits can be picked out of it. */
  const named = (part: DocComponent, port: string, width: number): string => {
    const signal = src(part, port, width)
    if (/^[A-Za-z_]/.test(signal)) return signal
    const name = names.numbered('floating')
    declare('wire', name, width)
    say(`  assign ${name} = ${signal};`)
    return name
  }

  const reg = (part: DocComponent, port: string, width: number): string =>
    out(part, port, width, 'reg', inits.get(keyOf(part.id, port)) ?? '')

  // ---- One part at a time ----
  let gates = 0
  const primitive = (kind: string, pins: readonly string[]): void => void say(`  ${kind} g${++gates} (${pins.join(', ')});`)

  const emit = (part: DocComponent): void => {
    const p = part.params
    const w = p.width ?? 1
    const input = (port: string, width = w): string => src(part, port, width)
    switch (part.type) {
      case 'input':
      case 'button':
      case 'clock':
      case 'cycle':
        return
      case 'output': {
        const port = info.outputs.find((item) => item.part === part.id)!.name
        const value = input('in')
        // Its driver may already drive the port itself.
        if (value !== port) say(`  assign ${port} = ${value};`)
        return
      }
      case 'display': {
        const digits = Array.from({ length: p.digits }, (_, index) => input(`in${index}`, 1)).reverse()
        const port = info.outputs.find((item) => item.part === part.id)!.name
        say(`  assign ${port} = ${digits.length === 1 ? digits[0] : `{${digits.join(', ')}}`};`)
        return
      }
      case 'const':
        say(`  assign ${out(part, 'out', w)} = ${bits(Array<number>(w).fill(p.value < 2 ? p.value : -1))};`)
        return
      case 'and':
      case 'or':
      case 'xor':
      case 'nand':
      case 'nor':
      case 'xnor':
      case 'add':
      case 'mul': {
        const kind = part.type === 'add' ? 'xor' : part.type === 'mul' ? 'and' : part.type
        const ins = Array.from({ length: p.inputs }, (_, index) => input(`in${index}`))
        if (w === 1) return primitive(kind, [out(part, 'out', 1), ...ins])
        const base = kind.replace(/^n(?=and|or)/, '').replace('xnor', 'xor')
        const joined = ins.join({ and: ' & ', or: ' | ', xor: ' ^ ' }[base]!)
        say(`  assign ${out(part, 'out', w)} = ${base === kind ? joined : `~(${joined})`};`)
        return
      }
      case 'not':
      case 'buffer':
      case 'shift':
      case 'is': {
        // At radix 2 a shift by an odd number and "is 0" are both NOT.
        const flips = part.type === 'not' || (part.type === 'shift' && p.by % 2 === 1) || (part.type === 'is' && p.match === 0)
        if (part.type === 'is' && p.match > 1) say(`  assign ${out(part, 'out', w)} = ${zeros(w)};`)
        else if (w === 1) primitive(flips ? 'not' : 'buf', [out(part, 'out', 1), input('in')])
        else say(`  assign ${out(part, 'out', w)} = ${flips ? '~' : ''}${input('in')};`)
        return
      }
      case 'table':
      case 'tobits':
      case 'frombits':
        return table(part)
      case 'split': {
        const from = named(part, 'in', w)
        let low = 0
        branchWidths(w, p.each).forEach((size, index) => {
          if (wired(part, `d${index}`)) say(`  assign ${out(part, `d${index}`, size)} = ${slice(from, low + size - 1, low, w)};`)
          low += size
        })
        return
      }
      case 'merge': {
        const branches = branchWidths(w, p.each).map((size, index) => input(`d${index}`, size))
        say(`  assign ${out(part, 'out', w)} = {${branches.reverse().join(', ')}};`)
        return
      }
      case 'mux': {
        const ways = Array.from({ length: p.inputs }, (_, index) => input(`in${index}`))
        const sel = input('sel', p.select)
        const all = 2 ** p.select
        const value =
          all === 2 && ways.length === 2
            ? `${sel} ? ${ways[1]} : ${ways[0]}`
            : choose(
                ways.slice(0, ways.length >= all ? all - 1 : ways.length).map((way, index) => ({
                  when: `${sel} == ${number(p.select, index)}`,
                  then: way,
                })),
                // A number with no input behind it chooses nothing.
                ways.length >= all ? ways[all - 1] : `${w}'bx`,
              )
        say(`  assign ${out(part, 'out', w)} = ${value};`)
        return
      }
      case 'demux':
      case 'decoder': {
        const sel = input('sel', p.select)
        for (let index = 0; index < p.outputs; index++) {
          if (!wired(part, `out${index}`)) continue
          const chosen = index < 2 ** p.select ? `${sel} == ${number(p.select, index)}` : "1'b0"
          say(
            part.type === 'decoder'
              ? `  assign ${out(part, `out${index}`, 1)} = ${chosen};`
              : `  assign ${out(part, `out${index}`, w)} = ${chosen} ? ${input('in')} : ${zeros(w)};`,
          )
        }
        return
      }
      case 'adder':
      case 'subtractor': {
        const [carryIn, result, carryOut, sign] =
          part.type === 'adder' ? ['cin', 'sum', 'cout', '+'] : ['bin', 'diff', 'bout', '-']
        const carry = attached(part, carryIn) ? ` ${sign} ${input(carryIn, 1)}` : ''
        const value = `${input('a')} ${sign} ${input('b')}${carry}`
        const target = wired(part, carryOut)
          ? `{${out(part, carryOut, 1)}, ${out(part, result, w)}}`
          : out(part, result, w)
        say(`  assign ${target} = ${value};`)
        return
      }
      case 'multiplier':
        say(`  assign ${out(part, 'p', 2 * w)} = ${input('a')} * ${input('b')};`)
        return
      case 'compare':
        for (const [port, sign] of [['lt', '<'], ['eq', '=='], ['gt', '>']] as const) {
          if (wired(part, port)) say(`  assign ${out(part, port, 1)} = ${input('a')} ${sign} ${input('b')};`)
        }
        return
      case 'alu':
        return alu(part)
      case 'shifter':
        return shifter(part)
      case 'sr': {
        const q = reg(part, 'q', 1)
        const [s, r] = [input('s', 1), input('r', 1)]
        say(`  always @(*)`, `    if (${s} & ${r}) ${q} = 1'bx;`, `    else if (${s}) ${q} = 1'b1;`, `    else if (${r}) ${q} = 1'b0;`)
        if (wired(part, 'nq')) say(`  assign ${out(part, 'nq', 1)} = ~${q};`)
        return
      }
      case 'dff':
      case 'tff':
      case 'jkff': {
        const q = reg(part, 'q', 1)
        const next =
          part.type === 'dff'
            ? input('d', 1)
            : part.type === 'tff'
              ? `${q} ^ ${input('t', 1)}`
              : `(${input('j', 1)} & ~${q}) | (~${input('k', 1)} & ${q})`
        // With no clock wired it never takes a value, and only Set and Reset move it.
        const ticking = attached(part, 'clk')
        const edges = ticking ? [`posedge ${input('clk', 1)}`] : []
        const first: string[] = []
        if (attached(part, 'reset')) {
          edges.push(`posedge ${input('reset', 1)}`)
          first.push(`if (${input('reset', 1)}) ${q} <= 1'b0;`)
        }
        if (attached(part, 'set')) {
          edges.push(`posedge ${input('set', 1)}`)
          first.push(`if (${input('set', 1)}) ${q} <= 1'b1;`)
        }
        clocked(edges, ticking ? [...first, `${q} <= ${next};`] : first)
        if (wired(part, 'nq')) say(`  assign ${out(part, 'nq', 1)} = ~${q};`)
        return
      }
      case 'register':
      case 'counter': {
        const q = reg(part, 'q', w)
        const ticking = attached(part, 'clk')
        const edges = ticking ? [`posedge ${input('clk', 1)}`] : []
        const steps: string[] = []
        if (attached(part, 'reset')) {
          edges.push(`posedge ${input('reset', 1)}`)
          steps.push(`if (${input('reset', 1)}) ${q} <= ${zeros(w)};`)
        }
        const en = attached(part, 'en') ? input('en', 1) : undefined
        if (part.type === 'register') {
          if (ticking) steps.push(`${en === undefined ? '' : `if (${en}) `}${q} <= ${input('d')};`)
        } else {
          if (ticking && attached(part, 'load')) steps.push(`if (${input('load', 1)}) ${q} <= ${input('d')};`)
          if (ticking) steps.push(`${en === undefined ? '' : `if (${en}) `}${q} <= ${q} + ${number(w, 1)};`)
          if (wired(part, 'co')) {
            const full = `${q} == ${bits(Array<number>(w).fill(1))}`
            say(`  assign ${out(part, 'co', 1)} = ${en === undefined ? full : `${en} & (${full})`};`)
          }
        }
        clocked(edges, steps)
        return
      }
      case 'rom':
      case 'ram':
        return memory(part)
      case 'fsm':
        return machine(part)
      case SUB_TYPE: {
        if (!part.sub) return
        const child = infoOf(part.sub.circuit)
        const links = [
          ...child.inputs.map((port) => `.${port.name}(${src(part, port.part!, port.width)})`),
          ...child.extras.map(
            (port) =>
              `.${port.name}(${info.extras.find((mine) => mine.child?.instance === part.id && mine.child.port === port.name)!.name})`,
          ),
          ...child.outputs.map(
            (port) =>
              `.${port.name}(${port.part && !port.display && wired(part, port.part) ? out(part, port.part, port.width) : ''})`,
          ),
        ]
        say(`  ${child.name} ${info.instances.get(part.id)} (${links.join(', ')});`)
        return
      }
      default:
        throw new Refusal(t('A part of type “{type}” cannot be written as Verilog.', { type: part.type }))
    }
  }

  /** An `always` on clock and reset edges: the steps are tried in order, each `else` of the one before. */
  function clocked(edges: readonly string[], steps: readonly string[]): void {
    if (steps.length === 0) return
    say(`  always @(${edges.join(' or ')})`)
    steps.forEach((step, index) => say(`    ${index === 0 ? '' : 'else '}${step}`))
  }

  /** A part of a few bits with no memory, written from its table as sums of products. */
  function table(part: DocComponent): void {
    const def = builtinComponents.get(part.type)
    const ports = def.ports(part.params)
    const ins = ports.filter((port) => port.direction === 'in')
    const variables = ins.map((port) => src(part, port.name, 1))
    const answer = (row: readonly number[]): Record<string, Signal> => {
      const values: Record<string, Signal> = {}
      ins.forEach((port, index) => {
        values[port.name] = [row[index]]
      })
      return def.evaluate(values, part.params as Params, undefined, { radix: 2, woke: false }).outputs as Record<string, Signal>
    }
    for (const port of ports) {
      if (port.direction !== 'out' || !wired(part, port.name)) continue
      // An answer that is unknown may be written either way.
      const cubes = minimize(ins.length, 2, (row) => {
        const digit = answer(row)[port.name][0]
        return digit === 1 ? 'on' : digit === 0 ? 'off' : 'free'
      })
      const terms = cubes.map((cube) => {
        const factors = cube.flatMap((value, index) => (value === -1 ? [] : [`${value === 0 ? '~' : ''}${variables[index]}`]))
        return factors.length === 0 ? "1'b1" : factors.join(' & ')
      })
      say(`  assign ${out(part, port.name, 1)} = ${terms.length === 0 ? "1'b0" : terms.join(' | ')};`)
    }
  }

  function alu(part: DocComponent): void {
    const { width: w, select } = part.params
    const a = named(part, 'a', w)
    const b = named(part, 'b', w)
    const op = src(part, 'op', select)
    const known = Math.min(ALU_OPERATIONS.length, 2 ** select)
    const sum = names.numbered('alu_sum')
    const difference = names.numbered('alu_diff')
    declare('wire', sum, w + 1)
    say(`  assign ${sum} = ${a} + ${b};`)
    if (known > 1) {
      declare('wire', difference, w + 1)
      say(`  assign ${difference} = ${a} - ${b};`)
    }
    const results: Readonly<Record<(typeof ALU_OPERATIONS)[number], readonly [value: string, carry: string]>> = {
      ADD: [slice(sum, w - 1, 0, w + 1), bit(sum, w, w + 1)],
      SUB: [slice(difference, w - 1, 0, w + 1), bit(difference, w, w + 1)],
      AND: [`${a} & ${b}`, "1'b0"],
      OR: [`${a} | ${b}`, "1'b0"],
      XOR: [`${a} ^ ${b}`, "1'b0"],
      NOT: [`~${a}`, "1'b0"],
      SHL: [`${a} << 1`, bit(a, w - 1, w)],
      SHR: [`${a} >> 1`, bit(a, 0, w)],
    }
    // An operation number the part does not have gives nothing known.
    const whole = known === 2 ** select
    const pick = (which: 0 | 1, unknown: string): string => {
      const cases = ALU_OPERATIONS.slice(0, known).map((name, index) => ({
        when: `${op} == ${number(select, index)}`,
        then: which === 0 ? `(${results[name][0]})` : results[name][1],
      }))
      return whole ? choose(cases.slice(0, -1), cases[cases.length - 1].then) : choose(cases, unknown)
    }
    const y = out(part, 'y', w)
    say(`  assign ${y} = ${pick(0, `${w}'bx`)};`)
    if (wired(part, 'zero')) say(`  assign ${out(part, 'zero', 1)} = ${y} == ${zeros(w)};`)
    if (wired(part, 'carry')) say(`  assign ${out(part, 'carry', 1)} = ${pick(1, "1'bx")};`)
  }

  function shifter(part: DocComponent): void {
    const { width: w, select, left, rotate } = part.params
    const amount = named(part, 'amt', select)
    if (rotate !== 1 || w === 1) {
      const value = w === 1 && rotate === 1 ? src(part, 'in', w) : `${src(part, 'in', w)} ${left === 1 ? '<<' : '>>'} ${amount}`
      say(`  assign ${out(part, 'out', w)} = ${value};`)
      return
    }
    // A barrel: one stage for each bit of the amount, turning by 1, 2, 4, ... places.
    let stage = named(part, 'in', w)
    for (let index = 0; index < select; index++) {
      const by = 2 ** index % w
      if (by === 0) continue
      const turned =
        left === 1
          ? `{${slice(stage, w - 1 - by, 0, w)}, ${slice(stage, w - 1, w - by, w)}}`
          : `{${slice(stage, by - 1, 0, w)}, ${slice(stage, w - 1, by, w)}}`
      const last = Array.from({ length: select - index - 1 }, (_, later) => 2 ** (index + 1 + later) % w).every((later) => later === 0)
      const next = last ? out(part, 'out', w) : names.numbered('turn')
      if (!last) declare('wire', next, w)
      say(`  assign ${next} = ${bit(amount, index, select)} ? ${turned} : ${stage};`)
      stage = next
      if (last) return
    }
    say(`  assign ${out(part, 'out', w)} = ${stage};`)
  }

  function memory(part: DocComponent): void {
    const { address, width: w } = part.params
    const words = wordCount(address, 2)
    const store = names.take(part.label ? `${part.label}_words` : undefined, `${part.type}_words`)
    declarations.push(`  reg ${range(w)}${store} [0:${words - 1}];`)
    say('  initial begin')
    for (let at = 0; at < words; at++) say(`    ${store}[${at}] = ${bits(unpackWord(part.params[memoryCell(at)], w, 2))};`)
    say('  end')
    if (part.type === 'ram' && attached(part, 'we') && attached(part, 'clk')) {
      say(
        `  always @(posedge ${src(part, 'clk', 1)})`,
        `    if (${src(part, 'we', 1)}) ${store}[${src(part, 'a', address)}] <= ${src(part, 'd', w)};`,
      )
    }
    say(`  assign ${out(part, 'q', w)} = ${store}[${src(part, 'a', address)}];`)
  }

  function machine(part: DocComponent): void {
    const p = part.params
    let size = 1
    while (2 ** size < p.states) size++
    const state = names.take(part.label ? `${part.label}_state` : undefined, 'state')
    declare('reg', state, size, ` = ${zeros(size)}`)
    const inputs = Array.from({ length: p.inputs }, (_, index) => src(part, `in${index}`, 1))
    const stateName = (index: number): string => part.machine?.states[index]?.name ?? `S${index}`
    /** The rules that leave a state and can ever hold, each with its condition. */
    const rulesOf = (from: number): { readonly rule: number; readonly when: string | undefined }[] => {
      const found: { rule: number; when: string | undefined }[] = []
      for (let rule = 0; rule < p.rules; rule++) {
        if (p[ruleFrom(rule)] !== from || p[ruleTo(rule)] >= p.states) continue
        const wants = inputs.map((_name, index) => p[ruleWhen(rule, index)])
        if (wants.some((want) => want > 1)) continue
        const factors = wants.flatMap((want, index) => (want === ANY ? [] : [`${want === 0 ? '~' : ''}${inputs[index]}`]))
        found.push({ rule, when: factors.length === 0 ? undefined : factors.join(' & ') })
        // After a rule that always holds no other is ever tried.
        if (factors.length === 0) break
      }
      return found
    }

    const reset = attached(part, 'reset') ? src(part, 'reset', 1) : undefined
    // With no clock wired it stays in its first state.
    const ticking = attached(part, 'clk')
    if (ticking) {
      const edges = [`posedge ${src(part, 'clk', 1)}`]
      if (reset !== undefined) edges.push(`posedge ${reset}`)
      say(`  always @(${edges.join(' or ')})`)
      if (reset !== undefined) say(`    if (${reset}) ${state} <= ${zeros(size)};`, '    else')
      say(`      case (${state})`)
    }
    for (let from = 0; ticking && from < p.states; from++) {
      const rules = rulesOf(from)
      if (rules.length === 0) continue
      say(`        ${number(size, from)}: begin // ${stateName(from)}`)
      rules.forEach(({ rule, when }, index) => {
        const lead = `${index === 0 ? '' : 'else '}${when === undefined ? '' : `if (${when}) `}`
        say(`          ${lead}${state} <= ${number(size, p[ruleTo(rule)])};`)
      })
      say('        end')
    }
    if (ticking) say(`        default: ${state} <= ${state};`, '      endcase')

    const digit = (value: number): string => (value < 2 ? `1'b${value}` : "1'bx")
    const outputs = Array.from({ length: p.outputs }, (_, index) => index)
    if (p.mealy !== 1) {
      for (const output of outputs) {
        if (!wired(part, `out${output}`)) continue
        const on = Array.from({ length: p.states }, (_, index) => index).filter((index) => p[stateOutput(index, output)] === 1)
        const value = on.length === 0 ? "1'b0" : on.map((index) => `${state} == ${number(size, index)}`).join(' | ')
        say(`  assign ${out(part, `out${output}`, 1)} = ${value};`)
      }
      return
    }
    const targets = outputs.map((output) => reg(part, `out${output}`, 1))
    if (targets.length === 0) return
    const give = (name: (output: number) => string): string =>
      `begin ${outputs.map((output) => `${targets[output]} = ${digit(p[name(output)])};`).join(' ')} end`
    say('  always @(*)', `    case (${state})`)
    for (let from = 0; from < p.states; from++) {
      say(`      ${number(size, from)}: begin // ${stateName(from)}`)
      const rules = rulesOf(from)
      let closed = false
      rules.forEach(({ rule, when }, index) => {
        const lead = `${index === 0 ? '' : 'else '}${when === undefined ? '' : `if (${when}) `}`
        say(`        ${lead}${give((output) => ruleOutput(rule, output))}`)
        closed ||= when === undefined
      })
      if (!closed) say(`        ${rules.length === 0 ? '' : 'else '}${give((output) => stateOutput(from, output))}`)
      say('      end')
    }
    say(`      default: begin ${targets.map((target) => `${target} = 1'b0;`).join(' ')} end`, '    endcase')
  }

  for (const part of parts) emit(part)

  const ports = [
    ...[...info.inputs, ...info.extras].map((port) => `  input ${range(port.width)}${port.name}`),
    ...info.outputs.map((port) => `  output ${range(port.width)}${port.name}`),
  ]
  const head = ports.length === 0 ? `module ${info.name};` : `module ${info.name} (\n${ports.join(',\n')}\n);`
  const body = [...declarations, ...(declarations.length > 0 && lines.length > 0 ? [''] : []), ...lines]
  return `// ${title.replace(/[\r\n]/g, ' ')}\n${head}\n${body.join('\n')}${body.length > 0 ? '\n' : ''}endmodule\n`
}
