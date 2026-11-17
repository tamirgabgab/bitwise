import {
  addComponent,
  addJunction,
  addSubcircuit,
  addText,
  addWire,
  emptyDoc,
} from './document.ts'
import type { AddComponentOptions, Terminal } from './document.ts'
import { DEFAULT_SETTINGS, toProjectData } from './project.ts'
import type { ProjectData, ProjectSettings } from './project.ts'
import type { Step } from './steps.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit } from './subcircuit.ts'

/*
 * Ready-made projects to open and take apart. They are built with the same
 * functions the editor uses, so they cannot drift from the file format.
 */

export interface Example {
  readonly id: string
  readonly name: string
  /** One line for the menu: what it shows. */
  readonly summary: string
  build(): ProjectData
}

/**
 * A drawing in the making. Pins are written "part.pin", e.g. "c3.in0", and
 * a bend in a wire is written as `bend` gave it.
 */
function sketch() {
  let doc = emptyDoc()
  const pin = (ref: string): Terminal => {
    if (ref.startsWith('@')) return { kind: 'junction', junction: ref.slice(1) }
    const [component, name] = ref.split('.')
    const sub = doc.components[component]?.sub
    // On a named circuit the pin is known by the label drawn on it.
    const port = sub
      ? ([...sub.inputs, ...sub.outputs].find((item) => item.label === name)?.port ?? name)
      : name
    return { kind: 'pin', component, port }
  }
  return {
    part(type: string, x: number, y: number, options: AddComponentOptions = {}): string {
      const added = addComponent(doc, type, { x, y }, options)
      doc = added.doc
      return added.id
    },
    chip(circuit: Circuit, x: number, y: number): string {
      const added = addSubcircuit(doc, subRefOf(circuit), { x, y })
      doc = added.doc
      return added.id
    },
    wire(from: string, to: string): void {
      const added = addWire(doc, pin(from), pin(to))
      if (!added) throw new Error(`Cannot wire ${from} to ${to}`)
      doc = added.doc
    },
    /** Writing on the canvas, next to the circuit. */
    note(text: string, x: number, y: number): void {
      doc = addText(doc, { x, y }, text).doc
    },
    /** A point for wires to turn or branch at. */
    bend(x: number, y: number): string {
      const added = addJunction(doc, { x, y })
      doc = added.doc
      return `@${added.id}`
    },
    /** One wire after another, from each stop to the next. */
    run(...stops: readonly string[]): void {
      for (let i = 0; i + 1 < stops.length; i++) this.wire(stops[i], stops[i + 1])
    },
    done(id: string, name: string, steps?: readonly Step[]): Circuit {
      return steps ? { id, name, doc, steps } : { id, name, doc }
    },
  }
}

function project(
  circuits: readonly Circuit[],
  active: Circuit,
  settings: Partial<ProjectSettings>,
): ProjectData {
  return toProjectData({
    circuits: Object.fromEntries(circuits.map((circuit) => [circuit.id, circuit])),
    order: circuits.map((circuit) => circuit.id),
    active: active.id,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  })
}

/** Half adder, full adder made of two of them, and a two-bit adder on top. */
function binaryAdder(): ProjectData {
  const half = sketch()
  {
    const a = half.part('input', 0, 0, { label: 'A' })
    const b = half.part('input', 0, 6, { label: 'B' })
    const xor = half.part('xor', 10, 1)
    const and = half.part('and', 10, 7)
    const sum = half.part('output', 18, 1, { label: 'S' })
    const carry = half.part('output', 18, 7, { label: 'C' })
    half.wire(`${a}.out`, `${xor}.in0`)
    half.wire(`${b}.out`, `${xor}.in1`)
    half.wire(`${a}.out`, `${and}.in0`)
    half.wire(`${b}.out`, `${and}.in1`)
    half.wire(`${xor}.out`, `${sum}.in`)
    half.wire(`${and}.out`, `${carry}.in`)
    half.note('S is the sum, C the carry', 9, -4)
  }
  const halfAdder = half.done('k1', 'Half adder')

  const full = sketch()
  {
    // The carry comes in on top, so that no wire has to cross another.
    const carryIn = full.part('input', 0, 0, { label: 'Cin' })
    const a = full.part('input', 0, 8, { label: 'A' })
    const b = full.part('input', 0, 12, { label: 'B' })
    const first = full.chip(halfAdder, 12, 9)
    const second = full.chip(halfAdder, 28, 1)
    const or = full.part('or', 40, 9)
    const sum = full.part('output', 48, 0, { label: 'S' })
    const carryOut = full.part('output', 48, 9, { label: 'Cout' })
    full.wire(`${a}.out`, `${first}.A`)
    full.wire(`${b}.out`, `${first}.B`)
    full.wire(`${carryIn}.out`, `${second}.A`)
    full.wire(`${first}.S`, `${second}.B`)
    full.wire(`${second}.S`, `${sum}.in`)
    full.wire(`${second}.C`, `${or}.in0`)
    full.wire(`${first}.C`, `${or}.in1`)
    full.wire(`${or}.out`, `${carryOut}.in`)
  }
  const fullAdder = full.done('k2', 'Full adder')

  const top = sketch()
  const walk: Step[] = []
  {
    const a0 = top.part('input', 0, 0, { label: 'A0' })
    const b0 = top.part('input', 0, 4, { label: 'B0' })
    const a1 = top.part('input', 0, 12, { label: 'A1' })
    const b1 = top.part('input', 0, 16, { label: 'B1' })
    const low = top.chip(halfAdder, 14, 2)
    const high = top.chip(fullAdder, 28, 14)
    const s0 = top.part('output', 40, 1, { label: 'S0' })
    const s1 = top.part('output', 40, 13, { label: 'S1' })
    const carry = top.part('output', 40, 17, { label: 'C' })
    top.wire(`${a0}.out`, `${low}.A`)
    top.wire(`${b0}.out`, `${low}.B`)
    top.wire(`${low}.S`, `${s0}.in`)
    top.wire(`${a1}.out`, `${high}.A`)
    top.wire(`${b1}.out`, `${high}.B`)
    top.wire(`${low}.C`, `${high}.Cin`)
    top.wire(`${high}.S`, `${s1}.in`)
    top.wire(`${high}.Cout`, `${carry}.in`)
    const show = (note: string, a: number, b: number): void => {
      walk.push({
        note,
        inputs: { [a0]: a & 1, [a1]: a >> 1, [b0]: b & 1, [b1]: b >> 1 },
      })
    }
    show('0 + 0 = 0. Every output is off.', 0, 0)
    show('1 + 1 = 2. The low half adder carries into the full adder.', 1, 1)
    show('2 + 1 = 3. No carry anywhere.', 2, 1)
    show('3 + 3 = 6. The sum no longer fits in two bits, so C comes on.', 3, 3)
  }
  const adder = top.done('k3', 'Two-bit adder', walk)

  return project([adder, fullAdder, halfAdder], adder, {})
}

/**
 * Gates that the Kleene + Shift kit does not have, built from the ones it
 * has, following the recipes in section 4 of the specification.
 */
function ternaryGates(): ProjectData {
  // OR is the largest input: mirror both, take the smallest, mirror back.
  const max = sketch()
  {
    const a = max.part('input', 0, 0, { label: 'A' })
    const b = max.part('input', 0, 6, { label: 'B' })
    const notA = max.part('not', 8, 0)
    const notB = max.part('not', 8, 6)
    const and = max.part('and', 17, 3)
    const not = max.part('not', 25, 3)
    const out = max.part('output', 33, 3, { label: 'Max' })
    max.wire(`${a}.out`, `${notA}.in`)
    max.wire(`${b}.out`, `${notB}.in`)
    max.wire(`${notA}.out`, `${and}.in0`)
    max.wire(`${notB}.out`, `${and}.in1`)
    max.wire(`${and}.out`, `${not}.in`)
    max.wire(`${not}.out`, `${out}.in`)
  }
  const maxGate = max.done('k1', 'Max')

  // The top value when the input is 0, otherwise 0.
  const is = sketch()
  {
    const x = is.part('input', 0, 3, { label: 'X' })
    const one = is.part('shift', 9, 0, { params: { by: 1 } })
    const two = is.part('shift', 9, 6, { params: { by: 2 } })
    const and = is.part('and', 18, 3)
    const back = is.part('shift', 26, 3, { params: { by: 2 } })
    const not = is.part('not', 34, 3)
    const out = is.part('output', 42, 3, { label: 'Is0' })
    is.wire(`${x}.out`, `${one}.in`)
    is.wire(`${x}.out`, `${two}.in`)
    is.wire(`${one}.out`, `${and}.in0`)
    is.wire(`${two}.out`, `${and}.in1`)
    is.wire(`${and}.out`, `${back}.in`)
    is.wire(`${back}.out`, `${not}.in`)
    is.wire(`${not}.out`, `${out}.in`)
  }
  const isZero = is.done('k2', 'Is zero')

  // The top value when both inputs are equal: for each value, shift it down
  // to 0 on both sides, test both for 0, and take the largest of the three.
  const eq = sketch()
  const a = eq.part('input', 0, 0, { label: 'A' })
  const b = eq.part('input', 0, 8, { label: 'B' })
  const rows: string[] = []
  for (let value = 0; value < 3; value++) {
    const y = value * 18
    let fromA = `${a}.out`
    let fromB = `${b}.out`
    if (value > 0) {
      const by = 3 - value
      const shiftA = eq.part('shift', 10, y, { params: { by } })
      const shiftB = eq.part('shift', 10, y + 8, { params: { by } })
      eq.wire(fromA, `${shiftA}.in`)
      eq.wire(fromB, `${shiftB}.in`)
      fromA = `${shiftA}.out`
      fromB = `${shiftB}.out`
    }
    const testA = eq.chip(isZero, 22, y)
    const testB = eq.chip(isZero, 22, y + 8)
    const and = eq.part('and', 36, y + 4)
    eq.wire(fromA, `${testA}.X`)
    eq.wire(fromB, `${testB}.X`)
    eq.wire(`${testA}.Is0`, `${and}.in0`)
    eq.wire(`${testB}.Is0`, `${and}.in1`)
    rows.push(`${and}.out`)
  }
  const first = eq.chip(maxGate, 50, 13)
  const second = eq.chip(maxGate, 64, 30)
  const out = eq.part('output', 76, 30, { label: 'Equal' })
  eq.wire(rows[0], `${first}.A`)
  eq.wire(rows[1], `${first}.B`)
  eq.wire(`${first}.Max`, `${second}.A`)
  eq.wire(rows[2], `${second}.B`)
  eq.wire(`${second}.Max`, `${out}.in`)
  const equal = eq.done('k3', 'Equal')

  return project([equal, isZero, maxGate], equal, {
    radix: 3,
    preset: 'kleene',
    showDigits: true,
  })
}

/**
 * A ripple counter: a row of flip-flops, each clocked by the mirrored output
 * of the one before, so it steps when that one wraps around to 0. `stage`
 * places one flip-flop and wires what makes it count.
 */
function rippleCounter(options: {
  readonly type: 'jkff' | 'tff'
  readonly stages: number
  readonly radix: number
}): Circuit {
  const { type, stages } = options
  const jk = type === 'jkff'
  const counter = sketch()
  const pitch = 18
  // The row of the clock pins, and the rows of Q and its mirror.
  const row = 14
  const qRow = row - 2
  const centre = jk ? row : row - 1
  const resetRow = centre + (jk ? 4 : 3)

  const clock = counter.part('clock', 2, row)
  const reset = counter.part('button', 2, resetRow + 4, { label: 'Reset', key: 'Digit0' })
  const display = counter.part('display', 34 + pitch * stages, row, { params: { digits: stages } })
  const displayX = 30 + pitch * stages
  const firstDigit = row - Math.floor((stages - 1) / 2)

  let previous = `${clock}.out`
  let rail = `${reset}.out`
  for (let i = 0; i < stages; i++) {
    const x = 16 + pitch * i
    const flip = counter.part(type, x, centre)
    // Constants keep every stage counting.
    if (jk) {
      const j = counter.part('const', x - 7, row - 2, { params: { value: options.radix - 1 } })
      const k = counter.part('const', x - 7, row + 2, { params: { value: options.radix - 1 } })
      counter.wire(`${j}.out`, `${flip}.j`)
      counter.wire(`${k}.out`, `${flip}.k`)
    } else {
      const t = counter.part('const', x - 7, row - 2, { params: { value: 1 } })
      counter.wire(`${t}.out`, `${flip}.t`)
    }
    counter.wire(previous, `${flip}.clk`)

    // Q goes up to a lamp, then over the top to its digit of the display.
    const lamp = counter.part('output', x + 9, qRow - 4, { label: `Q${i}` })
    const up = x + 5
    const track = 1 + i
    const column = displayX - 2 - 2 * i
    const tap = counter.bend(up, qRow - 4)
    counter.run(`${flip}.q`, counter.bend(up, qRow), tap, `${lamp}.in`)
    counter.run(
      tap,
      counter.bend(up, track),
      counter.bend(column, track),
      counter.bend(column, firstDigit + i),
      `${display}.in${i}`,
    )

    // The mirrored output clocks the next stage.
    if (i === stages - 1) {
      previous = ''
    } else if (jk) {
      const down = counter.bend(x + 8, row + 2)
      const across = counter.bend(x + 8, row)
      counter.run(`${flip}.nq`, down, across)
      previous = across
    } else {
      previous = `${flip}.nq`
    }

    const below = counter.bend(x, resetRow + 4)
    counter.wire(rail, below)
    counter.wire(below, `${flip}.reset`)
    rail = below
  }
  return counter.done('k1', 'Counter')
}

function binaryCounter(): ProjectData {
  const counter = rippleCounter({ type: 'jkff', stages: 4, radix: 2 })
  return project([counter], counter, {})
}

function ternaryCounter(): ProjectData {
  const counter = rippleCounter({ type: 'tff', stages: 2, radix: 3 })
  return project([counter], counter, { radix: 3, preset: 'kleene', showDigits: true })
}

/** Two numbers on buses into an adder and a comparator. */
function busAdder(): ProjectData {
  const sheet = sketch()
  const a = sheet.part('input', 0, 0, { label: 'A', params: { width: 4 } })
  const b = sheet.part('input', 0, 6, { label: 'B', params: { width: 4 } })
  const adder = sheet.part('adder', 16, 2)
  const compare = sheet.part('compare', 16, 13)
  const sum = sheet.part('output', 28, 2, { label: 'Sum', params: { width: 4 } })
  const carry = sheet.part('output', 27, 6, { label: 'Carry' })
  const less = sheet.part('output', 27, 12, { label: 'A<B' })
  const equal = sheet.part('output', 27, 15, { label: 'A=B' })
  const more = sheet.part('output', 27, 18, { label: 'A>B' })
  const fromA = sheet.bend(8, 0)
  const fromB = sheet.bend(6, 6)
  sheet.run(`${a}.out`, fromA, sheet.bend(8, 1), `${adder}.a`)
  sheet.run(`${b}.out`, fromB, sheet.bend(6, 2), `${adder}.b`)
  sheet.run(fromA, sheet.bend(8, 13), `${compare}.a`)
  sheet.run(fromB, sheet.bend(6, 14), `${compare}.b`)
  sheet.wire(`${adder}.sum`, `${sum}.in`)
  sheet.run(`${adder}.cout`, sheet.bend(23, 3), sheet.bend(23, 6), `${carry}.in`)
  sheet.wire(`${compare}.lt`, `${less}.in`)
  sheet.run(`${compare}.eq`, sheet.bend(22, 14), sheet.bend(22, 15), `${equal}.in`)
  sheet.run(`${compare}.gt`, sheet.bend(21, 15), sheet.bend(21, 18), `${more}.in`)
  sheet.note('A heavy line is a bus: four wires in one', 13, -5)
  const steps: Step[] = [
    { note: 'A and B are four bits wide. 3 + 2 = 5', inputs: { [a]: '0011', [b]: '0010' } },
    { note: '9 + 9 = 18 does not fit four bits: the carry comes on', inputs: { [a]: '1001', [b]: '1001' } },
    { note: 'Equal numbers: A=B lights up', inputs: { [a]: '0110', [b]: '0110' } },
  ]
  const circuit = sheet.done('k1', 'Bus adder', steps)
  return project([circuit], circuit, {})
}

/** A counter and a register on a bus, at radix 3. */
function busCounter(): ProjectData {
  const sheet = sketch()
  const clock = sheet.part('clock', 0, 0, { params: { half: 4 } })
  const reset = sheet.part('button', 0, 12, { label: 'Reset' })
  const keep = sheet.part('button', 0, 18, { label: 'Keep' })
  const counter = sheet.part('counter', 14, 1, { params: { width: 2 } })
  const register = sheet.part('register', 30, 13, { params: { width: 2 } })
  const count = sheet.part('output', 30, 1, { label: 'Count', params: { width: 2 } })
  const full = sheet.part('output', 29, 5, { label: 'Full' })
  const kept = sheet.part('output', 42, 13, { label: 'Kept', params: { width: 2 } })
  sheet.wire(`${clock}.out`, `${counter}.clk`)
  sheet.run(`${reset}.out`, sheet.bend(14, 12), `${counter}.reset`)
  const tap = sheet.bend(22, 1)
  sheet.run(`${counter}.q`, tap, `${count}.in`)
  sheet.run(`${counter}.co`, sheet.bend(24, 2), sheet.bend(24, 5), `${full}.in`)
  sheet.run(tap, sheet.bend(22, 12), `${register}.d`)
  sheet.run(`${keep}.out`, sheet.bend(20, 18), sheet.bend(20, 13), `${register}.clk`)
  sheet.wire(`${register}.q`, `${kept}.in`)
  sheet.note('Press Keep to copy the count into the register', 26, 20)
  const circuit = sheet.done('k1', 'Bus counter')
  return project([circuit], circuit, { radix: 3, preset: 'kleene', showDigits: true })
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'binary-adder',
    name: 'Two-bit adder',
    summary: 'Radix 2. A half adder, used in a full adder, used in an adder',
    build: binaryAdder,
  },
  {
    id: 'ternary-gates',
    name: 'Ternary gates',
    summary: 'Radix 3. Max, Is zero and Equal, built from NOT, AND and Shift',
    build: ternaryGates,
  },
  {
    id: 'binary-counter',
    name: 'Four-bit counter',
    summary: 'Radix 2. Four JK flip-flops and a clock count from 0 to 15',
    build: binaryCounter,
  },
  {
    id: 'ternary-counter',
    name: 'Ternary counter',
    summary: 'Radix 3. Two T flip-flops count from 0 to 8, one ternary digit each',
    build: ternaryCounter,
  },
  {
    id: 'bus-adder',
    name: 'Adder on a bus',
    summary: 'Radix 2. Two four-bit numbers, an adder and a comparator',
    build: busAdder,
  },
  {
    id: 'bus-counter',
    name: 'Ternary bus counter',
    summary: 'Radix 3. A counter counts from 00 to 22, and a register keeps a copy',
    build: busCounter,
  },
]
