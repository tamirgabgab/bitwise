import { describe, expect, it } from 'vitest'
import { addComponent, addSubcircuit, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, DocComponent, Terminal } from './document.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'
import { MAX_TRUTH_ROWS, rowInputs, rowOf, truthTable } from './truthTable.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

function part(type: string, params: Record<string, number> = {}): DocComponent {
  const { doc, id } = addComponent(emptyDoc(), type, { x: 0, y: 0 }, { params })
  return doc.components[id]
}

/** Switches c1 "A" and c2 "B" into `gate` c3, into output c4 "Y". */
function twoInputCircuit(gate: string): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 4 }, { label: 'B' }).doc
  doc = addComponent(doc, gate, { x: 8, y: 2 }).doc
  doc = addComponent(doc, 'output', { x: 16, y: 2 }, { label: 'Y' }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in1'))!.doc
  return addWire(doc, pin('c3', 'out'), pin('c4', 'in'))!.doc
}

/** A project with circuit `inner` and a part c1 that stands for it. */
function usingCircuit(inner: CircuitDoc): { part: DocComponent; circuits: Circuits } {
  const circuit: Circuit = { id: 'inner', name: 'Inner', doc: inner }
  const host = addSubcircuit(emptyDoc(), subRefOf(circuit), { x: 0, y: 0 }).doc
  return { part: host.components.c1, circuits: { inner: circuit } }
}

describe('rowInputs and rowOf', () => {
  const columns = [
    { port: 'a', name: 'a', width: 1 },
    { port: 'b', name: 'b', width: 2 },
  ]

  it('lets the first input change slowest', () => {
    expect(rowInputs(columns, 0, 3)).toEqual([[0], [0, 0]])
    expect(rowInputs(columns, 1, 3)).toEqual([[0], [1, 0]])
    expect(rowInputs(columns, 3, 3)).toEqual([[0], [0, 1]])
    expect(rowInputs(columns, 9, 3)).toEqual([[1], [0, 0]])
  })

  it('finds the row of a set of values, and none for an unknown one', () => {
    for (let row = 0; row < 27; row++) expect(rowOf(rowInputs(columns, row, 3), 3)).toBe(row)
    expect(rowOf([[-1], [0, 0]], 3)).toBeUndefined()
    expect(rowOf([[3], [0, 0]], 3)).toBeUndefined()
  })
})

describe('truthTable of a built-in part', () => {
  it('lists every row of a gate', () => {
    const table = truthTable(part('and'), {}, 2)
    expect(table?.kind).toBe('table')
    if (table?.kind !== 'table') return
    expect(table.inputs.map((column) => column.name)).toEqual(['in0', 'in1'])
    expect(table.rows.map((row) => row.outputs[0][0])).toEqual([0, 0, 0, 1])
  })

  it('works at any radix', () => {
    const table = truthTable(part('or'), {}, 3)
    if (table?.kind !== 'table') throw new Error('No table')
    expect(table.rows).toHaveLength(9)
    // Row 5 is in0 = 1, in1 = 2, and OR is the larger.
    expect(table.rows[5].outputs[0]).toEqual([2])
  })

  it('has a reason instead for a part that keeps a value', () => {
    expect(truthTable(part('dff'), {}, 2)?.kind).toBe('none')
  })

  it('has a reason instead for a table that is too long', () => {
    const table = truthTable(part('and', { inputs: 3 }), {}, 7)
    expect(table?.kind).toBe('none')
    if (table?.kind === 'none') expect(table.reason).toContain(String(MAX_TRUTH_ROWS))
  })

  it('has nothing for a part without inputs or outputs, nor for a table gate', () => {
    expect(truthTable(part('input'), {}, 2)).toBeUndefined()
    expect(truthTable(part('output'), {}, 2)).toBeUndefined()
    expect(truthTable(part('table'), {}, 2)).toBeUndefined()
  })

  it('works out a table once for the same part', () => {
    const gate = part('xor')
    expect(truthTable(gate, {}, 2)).toBe(truthTable(gate, {}, 2))
  })
})

describe('truthTable of a named circuit', () => {
  it('runs the circuit once for every row', () => {
    const { part: chip, circuits } = usingCircuit(twoInputCircuit('nand'))
    const table = truthTable(chip, circuits, 2)
    if (table?.kind !== 'table') throw new Error('No table')
    expect(table.inputs.map((column) => column.name)).toEqual(['A', 'B'])
    expect(table.outputs.map((column) => column.name)).toEqual(['Y'])
    expect(table.rows.map((row) => row.outputs[0][0])).toEqual([1, 1, 1, 0])
  })

  it('works at radix 3', () => {
    const { part: chip, circuits } = usingCircuit(twoInputCircuit('and'))
    const table = truthTable(chip, circuits, 3)
    if (table?.kind !== 'table') throw new Error('No table')
    expect(table.rows.map((row) => row.outputs[0][0])).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 2])
  })

  it('has a reason instead when a part inside keeps a value', () => {
    let inner = emptyDoc()
    inner = addComponent(inner, 'input', { x: 0, y: 0 }, { label: 'D' }).doc
    inner = addComponent(inner, 'dff', { x: 8, y: 0 }).doc
    inner = addComponent(inner, 'output', { x: 16, y: 0 }, { label: 'Q' }).doc
    inner = addWire(inner, pin('c1', 'out'), pin('c2', 'd'))!.doc
    inner = addWire(inner, pin('c2', 'q'), pin('c3', 'in'))!.doc
    const { part: chip, circuits } = usingCircuit(inner)
    expect(truthTable(chip, circuits, 2)?.kind).toBe('none')
  })

  it('has a reason instead when the circuit never settles', () => {
    // A NAND fed by a switch and by its own output: at A = 1 it rings.
    let inner = emptyDoc()
    inner = addComponent(inner, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
    inner = addComponent(inner, 'nand', { x: 8, y: 0 }).doc
    inner = addComponent(inner, 'output', { x: 16, y: 0 }, { label: 'Y' }).doc
    inner = addWire(inner, pin('c1', 'out'), pin('c2', 'in0'))!.doc
    inner = addWire(inner, pin('c2', 'out'), pin('c2', 'in1'))!.doc
    inner = addWire(inner, pin('c2', 'out'), pin('c3', 'in'))!.doc
    const { part: chip, circuits } = usingCircuit(inner)
    const table = truthTable(chip, circuits, 2)
    expect(table?.kind).toBe('none')
    if (table?.kind === 'none') expect(table.reason).toContain('settle')
  })
})
