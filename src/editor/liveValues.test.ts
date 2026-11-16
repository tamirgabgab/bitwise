import { describe, expect, it } from 'vitest'
import { X, Z } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import { addComponent, addWire, connectEnds, emptyDoc, terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { isPokeable, readLiveValues } from './liveValues.ts'
import { SimBridge } from './simBridge.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

function build(parts: [string, number, number][], wires: [Terminal, Terminal][]): CircuitDoc {
  let doc = emptyDoc()
  for (const [type, x, y] of parts) doc = addComponent(doc, type, { x, y }).doc
  for (const [from, to] of wires) doc = addWire(doc, from, to)!.doc
  return doc
}

/** A bridge at the given radix, in step with `doc` and settled. */
function running(doc: CircuitDoc, radix = 2): SimBridge {
  const bridge = new SimBridge()
  bridge.sim.setRadix(radix)
  bridge.sync(doc)
  bridge.sim.settle()
  return bridge
}

/** Switch c1 into NOT c2 into lamp c3. */
function inverter(): CircuitDoc {
  return build(
    [
      ['input', 0, 0],
      ['not', 8, 0],
      ['output', 16, 0],
    ],
    [
      [pin('c1', 'out'), pin('c2', 'in')],
      [pin('c2', 'out'), pin('c3', 'in')],
    ],
  )
}

describe('readLiveValues', () => {
  it('reads the value on each wire', () => {
    const doc = inverter()
    const live = readLiveValues(doc, running(doc))
    expect(live.at(pin('c1', 'out'))).toEqual({ digit: 0, conflict: false })
    expect(live.at(pin('c2', 'out'))).toEqual({ digit: 1, conflict: false })
    // Both ends of a wire read the same.
    expect(live.at(pin('c3', 'in'))).toEqual(live.at(pin('c2', 'out')))
  })

  it('reads a net by its name, and a junction on it', () => {
    let doc = inverter()
    doc = addComponent(doc, 'output', { x: 16, y: 6 }).doc
    doc = connectEnds(
      doc,
      { kind: 'wire', wire: 'w5', pos: { x: 13, y: 0 } },
      { kind: 'terminal', terminal: pin('c6', 'in') },
    )!
    const junction = Object.keys(doc.junctions)[0]
    const live = readLiveValues(doc, running(doc))
    const net = terminalNets(doc).get(terminalKey(pin('c2', 'out')))
    expect(live.net(net)).toEqual({ digit: 1, conflict: false })
    expect(live.at({ kind: 'junction', junction })).toEqual({ digit: 1, conflict: false })
    expect(live.face('c6')).toBe(1)
  })

  it('floats where nothing drives', () => {
    const doc = build([['not', 0, 0]], [])
    const live = readLiveValues(doc, running(doc))
    expect(live.at(pin('c1', 'in')).digit).toBe(Z)
    expect(live.net(undefined).digit).toBe(Z)
    expect(live.net('no-such-net').digit).toBe(Z)
    // The gate cannot tell what it is given, so it puts out X.
    expect(live.at(pin('c1', 'out')).digit).toBe(X)
    expect(live.output('c1', 'out')).toBe(X)
  })

  it('reports two outputs fighting over a wire', () => {
    const doc = build(
      [
        ['input', 0, 0],
        ['input', 0, 6],
        ['output', 10, 3],
      ],
      [
        [pin('c1', 'out'), pin('c3', 'in')],
        [pin('c2', 'out'), pin('c3', 'in')],
      ],
    )
    const bridge = running(doc)
    bridge.cycleInput('c1', 1)
    bridge.sim.settle()
    const live = readLiveValues(doc, bridge)
    expect(live.at(pin('c3', 'in'))).toEqual({ digit: X, conflict: true })
    // Each switch still shows its own value.
    expect(live.face('c1')).toBe(1)
    expect(live.face('c2')).toBe(0)
    expect(live.face('c3')).toBe(X)
  })

  it('shows a switch value at once, before the simulator has moved', () => {
    const doc = inverter()
    const bridge = running(doc, 3)
    bridge.cycleInput('c1', 1)
    const live = readLiveValues(doc, bridge)
    expect(live.face('c1')).toBe(1)
    expect(live.at(pin('c1', 'out')).digit).toBe(0)
  })

  it('shows the faces of constants and lamps at any radix', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'const', { x: 0, y: 0 }, { params: { value: 3 } }).doc
    doc = addComponent(doc, 'output', { x: 8, y: 0 }).doc
    doc = addComponent(doc, 'and', { x: 8, y: 8 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc

    const five = readLiveValues(doc, running(doc, 5))
    expect(five.face('c1')).toBe(3)
    expect(five.face('c2')).toBe(3)
    // A gate has no face, and neither has a part that is not there.
    expect(five.face('c3')).toBeUndefined()
    expect(five.face('nope')).toBeUndefined()

    // Radix 3 has no digit 3.
    const three = readLiveValues(doc, running(doc, 3))
    expect(three.face('c1')).toBe(X)
    expect(three.face('c2')).toBe(X)
  })

  it('reads what each gate puts out', () => {
    const doc = inverter()
    const bridge = running(doc, 4)
    bridge.cycleInput('c1', 1)
    bridge.sim.settle()
    expect(readLiveValues(doc, bridge).output('c2', 'out')).toBe(2)
    expect(readLiveValues(doc, bridge).output('nope', 'out')).toBe(X)
  })

  it('works on a drawing the simulator has not seen yet', () => {
    const doc = inverter()
    const live = readLiveValues(doc, new SimBridge())
    expect(live.at(pin('c1', 'out')).digit).toBe(Z)
    expect(live.face('c1')).toBeUndefined()
  })
})

describe('isPokeable', () => {
  it('is true for switches and push buttons only', () => {
    expect(['input', 'button', 'const', 'output', 'and'].map(isPokeable)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})
