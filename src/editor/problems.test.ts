import { describe, expect, it } from 'vitest'
import { addComponent, addNetLabel, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, DocComponent, Terminal } from './document.ts'
import { readLiveValues } from './liveValues.ts'
import { circuitProblems, drawingProblems } from './problems.ts'
import type { Problem } from './problems.ts'
import { SimBridge } from './simBridge.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const nameOf = (part: DocComponent): string => part.label ?? part.type.toUpperCase()
const kinds = (list: readonly Problem[]): string[] => list.map((problem) => problem.kind)

/** Switch c1 into input in0 of AND c2, whose output reaches output c3. */
function andGate(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'and', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 16, y: 0 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in0'))!.doc
  return addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
}

function running(doc: CircuitDoc): SimBridge {
  const bridge = new SimBridge()
  bridge.sync(doc)
  bridge.sim.settle()
  return bridge
}

describe('problems of a drawing', () => {
  it('finds an input left unattached, and nothing in a whole circuit', () => {
    const problems = drawingProblems(andGate(), nameOf)
    expect(kinds(problems)).toEqual(['floating'])
    expect(problems[0].text).toBe('Input in1 of AND is not connected')
    expect(problems[0].ids).toEqual(['c2'])

    let whole = andGate()
    whole = addWire(whole, pin('c1', 'out'), pin('c2', 'in1'))!.doc
    expect(drawingProblems(whole, nameOf)).toEqual([])
  })

  it('leaves alone the inputs that have a value of their own', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'dff', { x: 0, y: 0 }).doc
    const problems = drawingProblems(doc, nameOf).filter((problem) => problem.kind === 'floating')
    expect(problems.map((problem) => problem.text)).toEqual([
      'Input d of DFF is not connected',
      'Input clk of DFF is not connected',
    ])
  })

  it('finds a part that drives nothing', () => {
    let doc = andGate()
    doc = addComponent(doc, 'input', { x: 0, y: 10 }, { label: 'B' }).doc
    expect(drawingProblems(doc, nameOf).map((problem) => problem.text)).toContain('B drives nothing')
  })

  it('finds a wire nothing drives, also through net labels', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc // c1
    doc = addComponent(doc, 'output', { x: 20, y: 0 }).doc // c2
    doc = addNetLabel(doc, { x: 4, y: 0 }, 'X').doc // c3
    doc = addWire(doc, pin('c3', 'net'), pin('c1', 'in'))!.doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    expect(kinds(drawingProblems(doc, nameOf))).toEqual(['undriven'])
    // A switch on a label of the same name drives it.
    doc = addComponent(doc, 'input', { x: -10, y: 8 }).doc // c6
    doc = addNetLabel(doc, { x: -4, y: 8 }, 'X').doc // c7
    doc = addWire(doc, pin('c6', 'out'), pin('c7', 'net'))!.doc
    expect(drawingProblems(doc, nameOf)).toEqual([])
  })

  it('finds a loop with no memory, but not one through a flip-flop', () => {
    let ring = emptyDoc()
    ring = addComponent(ring, 'not', { x: 0, y: 0 }).doc
    ring = addComponent(ring, 'not', { x: 8, y: 0 }).doc
    ring = addWire(ring, pin('c1', 'out'), pin('c2', 'in'))!.doc
    ring = addWire(ring, pin('c2', 'out'), pin('c1', 'in'))!.doc
    const loops = drawingProblems(ring, nameOf).filter((problem) => problem.kind === 'loop')
    expect(loops).toHaveLength(1)
    expect([...loops[0].ids].sort()).toEqual(['c1', 'c2'])

    let toggle = emptyDoc()
    toggle = addComponent(toggle, 'dff', { x: 0, y: 0 }).doc
    toggle = addWire(toggle, pin('c1', 'nq'), pin('c1', 'd'))!.doc
    expect(kinds(drawingProblems(toggle, nameOf))).not.toContain('loop')
  })

  it('adds conflicts and mixed widths from the running circuit', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 6 }).doc
    doc = addComponent(doc, 'output', { x: 12, y: 3 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
    const bridge = running(doc)
    bridge.sim.setState(bridge.simComponent('c2')!, [1])
    bridge.sim.settle()
    const problems = circuitProblems(doc, readLiveValues(doc, bridge), nameOf)
    expect(kinds(problems)).toEqual(['conflict'])
    expect([...problems[0].ids].sort()).toEqual(['w4', 'w5'])

    let mixed = emptyDoc()
    mixed = addComponent(mixed, 'input', { x: 0, y: 0 }, { params: { width: 4 } }).doc
    mixed = addComponent(mixed, 'output', { x: 12, y: 0 }).doc
    mixed = addWire(mixed, pin('c1', 'out'), pin('c2', 'in'))!.doc
    const live = readLiveValues(mixed, running(mixed))
    expect(kinds(circuitProblems(mixed, live, nameOf))).toContain('mixed')
  })
})
