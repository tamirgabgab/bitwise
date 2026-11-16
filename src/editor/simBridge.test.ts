import { describe, expect, it } from 'vitest'
import { formatSignal, parseSignal } from '../core/index.ts'
import {
  addComponent,
  addWire,
  connectEnds,
  deleteItems,
  emptyDoc,
  moveItems,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { SimBridge } from './simBridge.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

function read(bridge: SimBridge, docId: string, port = 'out'): string {
  const component = bridge.simComponent(docId)
  if (component === undefined) throw new Error(`${docId} is not in the simulator`)
  return formatSignal(bridge.sim.readPin({ component, port }))
}

function set(bridge: SimBridge, docId: string, text: string): void {
  bridge.sim.setState(bridge.simComponent(docId)!, parseSignal(text))
}

function build(parts: [string, number, number][], wires: [Terminal, Terminal][]): CircuitDoc {
  let doc = emptyDoc()
  for (const [type, x, y] of parts) doc = addComponent(doc, type, { x, y }).doc
  for (const [from, to] of wires) doc = addWire(doc, from, to)!.doc
  return doc
}

/** Inputs c1 and c2 into AND gate c3. */
function andCircuit(): CircuitDoc {
  return build(
    [
      ['input', 0, 0],
      ['input', 0, 6],
      ['and', 12, 3],
    ],
    [
      [pin('c1', 'out'), pin('c3', 'in0')],
      [pin('c2', 'out'), pin('c3', 'in1')],
    ],
  )
}

/**
 * A latch from two NOR gates. c1 is reset, c2 is set, c3 gives Q and c4 its
 * inverse.
 */
function latch(): CircuitDoc {
  return build(
    [
      ['input', 0, 0],
      ['input', 0, 10],
      ['nor', 12, 1],
      ['nor', 12, 9],
    ],
    [
      [pin('c1', 'out'), pin('c3', 'in0')],
      [pin('c4', 'out'), pin('c3', 'in1')],
      [pin('c2', 'out'), pin('c4', 'in1')],
      [pin('c3', 'out'), pin('c4', 'in0')],
    ],
  )
}

describe('SimBridge', () => {
  it('builds a simulator that behaves like the drawing', () => {
    const bridge = new SimBridge()
    bridge.sync(andCircuit())
    expect(bridge.sim.componentIds()).toHaveLength(3)
    expect(bridge.sim.netIds()).toHaveLength(2)

    set(bridge, 'c1', '1')
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    expect(read(bridge, 'c3')).toBe('1')
    set(bridge, 'c2', '0')
    bridge.sim.settle()
    expect(read(bridge, 'c3')).toBe('0')
  })

  it('does nothing when the same document is synced again', () => {
    const bridge = new SimBridge()
    const doc = andCircuit()
    bridge.sync(doc)
    bridge.sim.settle()
    const nets = bridge.sim.netIds()
    bridge.sync(doc)
    expect(bridge.sim.netIds()).toEqual(nets)
    expect(bridge.sim.pendingEvents).toBe(0)
  })

  it('leaves the simulator alone when a part only moves', () => {
    const bridge = new SimBridge()
    const doc = andCircuit()
    bridge.sync(doc)
    bridge.sim.settle()
    const before = bridge.simComponent('c3')
    bridge.sync(moveItems(doc, ['c3'], 4, 4))
    expect(bridge.simComponent('c3')).toBe(before)
    expect(bridge.sim.pendingEvents).toBe(0)
  })

  it('floats an input whose wire is deleted', () => {
    const bridge = new SimBridge()
    const doc = andCircuit()
    bridge.sync(doc)
    set(bridge, 'c1', '1')
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    expect(read(bridge, 'c3')).toBe('1')

    bridge.sync(deleteItems(doc, [Object.keys(doc.wires)[1]]))
    bridge.sim.settle()
    expect(read(bridge, 'c3', 'in1')).toBe('Z')
    expect(read(bridge, 'c3')).toBe('X')
    expect(bridge.sim.netIds()).toHaveLength(1)
  })

  it('removes a deleted part and brings it back on undo', () => {
    const bridge = new SimBridge()
    const doc = andCircuit()
    bridge.sync(doc)
    bridge.sync(deleteItems(doc, ['c3']))
    expect(bridge.simComponent('c3')).toBeUndefined()
    expect(bridge.sim.componentIds()).toHaveLength(2)
    expect(bridge.sim.netIds()).toHaveLength(0)

    bridge.sync(doc)
    set(bridge, 'c1', '1')
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    expect(read(bridge, 'c3')).toBe('1')
  })

  it('connects pins that meet through a junction', () => {
    const bridge = new SimBridge()
    let doc = build(
      [
        ['input', 0, 0],
        ['not', 12, 0],
        ['buffer', 12, 6],
      ],
      [[pin('c1', 'out'), pin('c2', 'in')]],
    )
    doc = connectEnds(
      doc,
      { kind: 'terminal', terminal: pin('c3', 'in') },
      { kind: 'wire', wire: Object.keys(doc.wires)[0], pos: { x: 6, y: 0 } },
    )!
    bridge.sync(doc)
    expect(bridge.sim.netIds()).toHaveLength(1)
    set(bridge, 'c1', '1')
    bridge.sim.settle()
    expect([read(bridge, 'c2'), read(bridge, 'c3')]).toEqual(['0', '1'])
  })

  it('keeps a latch holding its value while the drawing changes elsewhere', () => {
    const bridge = new SimBridge()
    let doc = latch()
    bridge.sync(doc)
    bridge.sim.settle()
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    set(bridge, 'c2', '0')
    bridge.sim.settle()
    expect([read(bridge, 'c3'), read(bridge, 'c4')]).toEqual(['1', '0'])

    // An unrelated part, then a wire to it, then a move of the latch itself.
    doc = addComponent(doc, 'input', { x: 30, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 40, y: 0 }).doc
    bridge.sync(doc)
    doc = addWire(doc, pin('c9', 'out'), pin('c10', 'in'))!.doc
    bridge.sync(doc)
    doc = moveItems(doc, ['c3', 'c4'], 2, 2)
    bridge.sync(doc)
    bridge.sim.settle()
    expect([read(bridge, 'c3'), read(bridge, 'c4')]).toEqual(['1', '0'])
    expect(read(bridge, 'c10')).toBe('1')
  })

  it('keeps the rest of a net in place when one more pin joins it', () => {
    const bridge = new SimBridge()
    let doc = andCircuit()
    bridge.sync(doc)
    const c1 = bridge.simComponent('c1')!
    const net = bridge.sim.netOf({ component: c1, port: 'out' })

    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c6', 'in'))!.doc
    bridge.sync(doc)
    expect(bridge.sim.netOf({ component: c1, port: 'out' })).toBe(net)
    expect(bridge.sim.getNet(net!).pins).toHaveLength(3)
  })
})
