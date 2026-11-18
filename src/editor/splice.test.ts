import { describe, expect, it } from 'vitest'
import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, DocComponent, Terminal } from './document.ts'
import { applySplice, moveAndSplice, spliceTarget } from './splice.ts'
import { terminalKey } from './document.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** A switch c1 wired straight across to an output c2 by wire w3. */
function line(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 0 }).doc
  return addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
}

/** The ends of every wire, as text, to compare drawings by their connections. */
function connections(doc: CircuitDoc): string[] {
  return Object.values(doc.wires)
    .map((wire) => [terminalKey(wire.from), terminalKey(wire.to)].sort().join(' - '))
    .sort()
}

function part(type: string, x: number, y: number, rotation: 0 | 1 | 2 | 3 = 0): DocComponent {
  const doc = addComponent(emptyDoc(), type, { x, y }).doc
  return { ...doc.components.c1, id: 'c9', rotation }
}

describe('spliceTarget', () => {
  it('finds the wire under a part and feeds it from the driving side', () => {
    const splice = spliceTarget(line(), part('not', 10, 0))
    expect(splice).toEqual({ wire: 'w3', input: 'in', output: 'out', feed: 'from' })
  })

  it('feeds from the driver even when the wire was drawn the other way', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 20, y: 0 }).doc
    doc = addWire(doc, pin('c2', 'in'), pin('c1', 'out'))!.doc
    expect(spliceTarget(doc, part('not', 10, 0))?.feed).toBe('to')
  })

  it('finds nothing away from every wire', () => {
    expect(spliceTarget(line(), part('not', 10, 6))).toBeUndefined()
  })

  it('leaves out a part with only inputs or only outputs', () => {
    expect(spliceTarget(line(), part('output', 10, 0))).toBeUndefined()
    expect(spliceTarget(line(), part('input', 10, 0))).toBeUndefined()
  })

  it('leaves out a part that has wires already', () => {
    let doc = line()
    doc = addComponent(doc, 'not', { x: 10, y: 8 }).doc // c4
    doc = addComponent(doc, 'output', { x: 20, y: 8 }).doc // c5
    doc = addWire(doc, pin('c4', 'out'), pin('c5', 'in'))!.doc
    const moved = { ...doc.components.c4, pos: { x: 10, y: 0 } }
    expect(spliceTarget(doc, moved)).toBeUndefined()
  })

  it('leaves out a wire of another width', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }, { params: { width: 4 } }).doc
    doc = addComponent(doc, 'output', { x: 20, y: 0 }, { params: { width: 4 } }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    expect(spliceTarget(doc, part('not', 10, 0))).toBeUndefined()
  })
})

describe('applySplice and moveAndSplice', () => {
  it('cuts the wire and puts the part in between', () => {
    let doc = line()
    doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc // c4
    const spliced = applySplice(doc, 'c4', { wire: 'w3', input: 'in', output: 'out', feed: 'from' })!
    expect(connections(spliced)).toEqual(['p:c1:out - p:c4:in', 'p:c2:in - p:c4:out'])
  })

  it('puts a dragged part into the wire it lands on', () => {
    let doc = line()
    doc = addComponent(doc, 'not', { x: 10, y: 8 }).doc // c4
    const dropped = moveAndSplice(doc, new Set(['c4']), 0, -8)
    expect(dropped.components.c4.pos).toEqual({ x: 10, y: 0 })
    expect(connections(dropped)).toEqual(['p:c1:out - p:c4:in', 'p:c2:in - p:c4:out'])
  })

  it('only moves when more than one thing is dragged', () => {
    let doc = line()
    doc = addComponent(doc, 'not', { x: 10, y: 8 }).doc
    doc = addComponent(doc, 'not', { x: 14, y: 8 }).doc
    const moved = moveAndSplice(doc, new Set(['c4', 'c5']), 0, -8)
    expect(connections(moved)).toEqual(['p:c1:out - p:c2:in'])
  })

  it('turns a gate the wrong way round to take the wire from the side that drives it', () => {
    let doc = line()
    doc = addComponent(doc, 'not', { x: 10, y: 8 }).doc
    doc = { ...doc, components: { ...doc.components, c4: { ...doc.components.c4, rotation: 2 } } }
    const dropped = moveAndSplice(doc, new Set(['c4']), 0, -8)
    // Turned around, the gate still reads the switch and drives the output.
    expect(connections(dropped)).toEqual(['p:c1:out - p:c4:in', 'p:c2:in - p:c4:out'])
  })
})
