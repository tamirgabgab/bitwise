import { describe, expect, it } from 'vitest'
import {
  addComponent,
  addWire,
  bendWire,
  connectEnds,
  deleteItems,
  emptyDoc,
  frameAround,
  moveItems,
  resizeFrame,
  rotateComponents,
  setComponentLabel,
  setComponentMachine,
  setComponentParams,
  setComponentText,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { describeEdit } from './editNames.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const nameOf = (part: { type: string }): string => part.type.toUpperCase()
const name = (before: CircuitDoc, after: CircuitDoc): string => describeEdit(before, after, nameOf)

/** A switch c1 wired to an AND c2, and an output c3 on its own. */
function start(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'and', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 16, y: 0 }).doc
  return addWire(doc, pin('c1', 'out'), pin('c2', 'in0'))!.doc
}

describe('describeEdit', () => {
  it('names an added part', () => {
    const doc = start()
    expect(name(doc, addComponent(doc, 'or', { x: 0, y: 10 }).doc)).toBe('Add OR')
  })

  it('names a new wire, also one that starts on another wire', () => {
    const doc = start()
    expect(name(doc, addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc)).toBe('Connect wire')
    const branch = connectEnds(
      doc,
      { kind: 'wire', wire: 'w4', pos: { x: 4, y: -1 } },
      { kind: 'terminal', terminal: pin('c2', 'in1') },
    )!
    expect(name(doc, branch)).toBe('Connect wire')
  })

  it('names a deleted part, with its wires', () => {
    const doc = start()
    expect(name(doc, deleteItems(doc, ['c2']))).toBe('Delete AND')
    expect(name(doc, deleteItems(doc, ['w4']))).toBe('Delete wire')
  })

  it('names a move and a turn', () => {
    const doc = start()
    expect(name(doc, moveItems(doc, new Set(['c2']), 1, 0))).toBe('Move AND')
    expect(name(doc, moveItems(doc, new Set(['c2', 'c3']), 1, 0))).toBe('Move 2 items')
    expect(name(doc, rotateComponents(doc, ['c3']))).toBe('Rotate OUTPUT')
  })

  it('names a dragged stretch of wire', () => {
    const doc = start()
    const bent = bendWire(doc, 'w4', [{ x: 3, y: 0 }, { x: 5, y: 0 }], 0, 2)
    if (bent) expect(name(doc, bent.doc)).toBe('Move wire')
  })

  it('names a change to one part', () => {
    const doc = start()
    expect(name(doc, setComponentLabel(doc, 'c1', 'A'))).toBe('Rename INPUT')
    // Fewer inputs drop the wire on the input that went away: still a change of the part.
    expect(name(doc, setComponentParams(doc, 'c2', { inputs: 3 }))).toBe('Change AND')
  })

  it('names a part put into a wire', () => {
    let doc = start()
    doc = addComponent(doc, 'not', { x: 4, y: 6 }).doc // c5
    const wire = doc.wires.w4
    const wires = { ...doc.wires }
    delete wires.w4
    let spliced: CircuitDoc = { ...doc, wires }
    spliced = moveItems(spliced, new Set(['c5']), 0, -6)
    spliced = addWire(spliced, wire.from, pin('c5', 'in'))!.doc
    spliced = addWire(spliced, pin('c5', 'out'), wire.to)!.doc
    expect(name(doc, spliced)).toBe('Insert NOT into a wire')
  })
})

describe('describeEdit on frames', () => {
  it('names a frame that is moved, with what it holds, or resized', () => {
    let doc = start()
    const framed = frameAround(doc, ['c2'])!
    doc = framed.doc
    expect(name(start(), doc)).toBe('Add FRAME')
    expect(name(doc, moveItems(doc, new Set([framed.id]), 2, 0))).toBe('Move FRAME')
    expect(name(doc, resizeFrame(doc, framed.id, { x: 30, y: 30 }))).toBe('Resize FRAME')
    expect(name(doc, setComponentText(doc, framed.id, 'ALU'))).toBe('Rename FRAME')
  })
})

describe('describeEdit on a state machine', () => {
  it('names a change to its machine', () => {
    const doc = addComponent(emptyDoc(), 'fsm', { x: 0, y: 0 }).doc
    const machine = doc.components.c1.machine!
    const edited = setComponentMachine(doc, 'c1', { ...machine, outputs: ['lamp'] })
    expect(name(doc, edited)).toBe('Edit the machine of FSM')
  })
})
