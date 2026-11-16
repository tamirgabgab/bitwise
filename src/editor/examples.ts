import { addComponent, addSubcircuit, addWire, emptyDoc } from './document.ts'
import type { AddComponentOptions, Terminal } from './document.ts'
import { DEFAULT_SETTINGS, toProjectData } from './project.ts'
import type { ProjectData, ProjectSettings } from './project.ts'
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

/** A drawing in the making. Pins are written "part.pin", e.g. "c3.in0". */
function sketch() {
  let doc = emptyDoc()
  const pin = (ref: string): Terminal => {
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
    done(id: string, name: string): Circuit {
      return { id, name, doc }
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
  }
  const adder = top.done('k3', 'Two-bit adder')

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
]
