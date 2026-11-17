import { describe, expect, it } from 'vitest'
import { formatSignal, parseSignal } from '../core/index.ts'
import {
  addComponent,
  addSubcircuit,
  addWire,
  connectEnds,
  deleteItems,
  emptyDoc,
  moveItems,
  setComponentParams,
  terminalKey,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { SimBridge } from './simBridge.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit } from './subcircuit.ts'

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

  it('replaces a part whose parameters changed and rewires it', () => {
    const bridge = new SimBridge()
    let doc = andCircuit()
    bridge.sync(doc)
    set(bridge, 'c1', '1')
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    expect(read(bridge, 'c3')).toBe('1')

    doc = setComponentParams(doc, 'c3', { inputs: 3 })
    bridge.sync(doc)
    bridge.sim.settle()
    // The third input floats, so the AND can no longer tell.
    expect(read(bridge, 'c3')).toBe('X')
    expect(read(bridge, 'c1')).toBe('1')
  })
})

describe('switches and push buttons', () => {
  /** Switch c1 and push button c2, with nothing attached. */
  function sources(radix: number): SimBridge {
    const bridge = new SimBridge()
    bridge.sim.setRadix(radix)
    bridge.sync(build([['input', 0, 0], ['button', 0, 6]], []))
    bridge.sim.settle()
    return bridge
  }

  it('steps a switch forwards through the values and round again', () => {
    const bridge = sources(3)
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      expect(bridge.cycleInput('c1', 1)).toBe(true)
      bridge.sim.settle()
      seen.push(read(bridge, 'c1'))
    }
    expect(seen).toEqual(['1', '2', '0', '1'])
  })

  it('steps a switch backwards', () => {
    const bridge = sources(4)
    bridge.cycleInput('c1', -1)
    bridge.sim.settle()
    expect(read(bridge, 'c1')).toBe('3')
    bridge.cycleInput('c1', -1)
    bridge.sim.settle()
    expect(read(bridge, 'c1')).toBe('2')
  })

  it('toggles a switch at radix 2', () => {
    const bridge = sources(2)
    bridge.cycleInput('c1', 1)
    bridge.sim.settle()
    expect(read(bridge, 'c1')).toBe('1')
    bridge.cycleInput('c1', 1)
    bridge.sim.settle()
    expect(read(bridge, 'c1')).toBe('0')
  })

  it('gives the top value while a button is held and 0 after', () => {
    const bridge = sources(5)
    expect(bridge.setButton('c2', true)).toBe(true)
    bridge.sim.settle()
    expect(read(bridge, 'c2')).toBe('4')
    bridge.setButton('c2', false)
    bridge.sim.settle()
    expect(read(bridge, 'c2')).toBe('0')
  })

  it('leaves other parts alone', () => {
    const bridge = sources(3)
    expect(bridge.cycleInput('c2', 1)).toBe(false)
    expect(bridge.setButton('c1', true)).toBe(false)
    expect(bridge.cycleInput('nope', 1)).toBe(false)
    bridge.sim.settle()
    expect([read(bridge, 'c1'), read(bridge, 'c2')]).toEqual(['0', '0'])
  })
})

describe('SimBridge with named circuits', () => {
  /** Switch c1 "A" into NOT c2 into output c3 "Y". */
  function inverterCircuit(type = 'not'): Circuit {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
    doc = addComponent(doc, type, { x: 8, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 16, y: 0 }, { label: 'Y' }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
    doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
    return { id: 'k2', name: 'Inverter', doc }
  }

  /** Part c1 stands for `inner`, between switch c2 and lamp c3. */
  function host(inner: Circuit): CircuitDoc {
    let doc = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: -12, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 12, y: 0 }).doc
    doc = addWire(doc, pin('c2', 'out'), pin('c1', 'c1'))!.doc
    return addWire(doc, pin('c1', 'c3'), pin('c3', 'in'))!.doc
  }

  const lamp = (bridge: SimBridge): string =>
    formatSignal(bridge.probeTerminal(terminalKey(pin('c3', 'in')))!.value)

  it('simulates what is inside a named circuit', () => {
    const inner = inverterCircuit()
    const bridge = new SimBridge()
    bridge.sync(host(inner), { k2: inner })
    bridge.sim.settle()
    expect(lamp(bridge)).toBe('1')
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    expect(lamp(bridge)).toBe('0')
  })

  it('holds the inner parts under their path, and no part for the circuit itself', () => {
    const inner = inverterCircuit()
    const bridge = new SimBridge()
    bridge.sync(host(inner), { k2: inner })
    expect(bridge.simComponent('c1/c2')).toBeDefined()
    expect(bridge.simComponent('c1')).toBeUndefined()
    expect(bridge.simComponent('c1/c1')).toBeUndefined()
    expect(bridge.sim.componentIds()).toHaveLength(3)
  })

  it('follows a change inside the circuit and keeps the rest running', () => {
    const inner = inverterCircuit()
    const doc = host(inner)
    const bridge = new SimBridge()
    bridge.sync(doc, { k2: inner })
    set(bridge, 'c2', '1')
    bridge.sim.settle()
    const switchId = bridge.simComponent('c2')

    bridge.sync(doc, { k2: inverterCircuit('buffer') })
    bridge.sim.settle()
    expect(lamp(bridge)).toBe('1')
    expect(bridge.simComponent('c2')).toBe(switchId)
    expect(bridge.inputValues()).toEqual({ c2: 1 })
  })

  it('keeps the inner parts in place while the drawing around them is edited', () => {
    const inner = inverterCircuit()
    const library = { k2: inner }
    const doc = host(inner)
    const bridge = new SimBridge()
    bridge.sync(doc, library)
    const before = bridge.simComponent('c1/c2')
    bridge.sync(addComponent(moveItems(doc, ['c1'], 0, 6), 'and', { x: 0, y: 20 }).doc, library)
    expect(bridge.simComponent('c1/c2')).toBe(before)
  })

  it('takes the inner parts away with the part that stood for them', () => {
    const inner = inverterCircuit()
    const bridge = new SimBridge()
    bridge.sync(host(inner), { k2: inner })
    bridge.sync(deleteItems(host(inner), ['c1']), { k2: inner })
    expect(bridge.simComponent('c1/c2')).toBeUndefined()
    expect(bridge.sim.componentIds()).toHaveLength(2)
    expect(bridge.sim.netIds()).toHaveLength(0)
  })

  it('runs two uses of one circuit apart from each other', () => {
    const inner = inverterCircuit()
    let doc = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
    doc = addSubcircuit(doc, subRefOf(inner), { x: 0, y: 8 }).doc
    doc = addComponent(doc, 'input', { x: -12, y: 0 }).doc
    doc = addWire(doc, pin('c3', 'out'), pin('c1', 'c1'))!.doc
    const bridge = new SimBridge()
    bridge.sync(doc, { k2: inner })
    set(bridge, 'c3', '1')
    bridge.sim.settle()
    expect(read(bridge, 'c1/c2')).toBe('0')
    // Nothing drives the second one, and NOT of nothing is unknown.
    expect(read(bridge, 'c2/c2')).toBe('X')
  })

  it('puts a switch on a value and reports the values of the switches', () => {
    const inner = inverterCircuit()
    const bridge = new SimBridge()
    bridge.sim.setRadix(3)
    bridge.sync(host(inner), { k2: inner })
    expect(bridge.setInput('c2', 2)).toBe(true)
    // Only the switches of the drawing itself: the one inside is a pin.
    expect(bridge.inputValues()).toEqual({ c2: 2 })
    expect(bridge.setInput('c2', 3)).toBe(false)
    expect(bridge.setInput('c2', -1)).toBe(false)
    expect(bridge.setInput('c3', 1)).toBe(false)
    expect(bridge.setInput('nope', 1)).toBe(false)
    expect(bridge.inputValues()).toEqual({ c2: 2 })
  })

  it('has nothing to read at a terminal it does not know', () => {
    const bridge = new SimBridge()
    expect(bridge.probeTerminal('nope')).toBeUndefined()
    bridge.sync(andCircuit())
    expect(bridge.probeTerminal('nope')).toBeUndefined()
    expect(bridge.probeTerminal(terminalKey(pin('c3', 'in0')))).toBeDefined()
  })
})

describe('SimBridge.clockPins', () => {
  it('finds every clock of the drawing', () => {
    let doc = addComponent(emptyDoc(), 'clock', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
    const bridge = new SimBridge()
    bridge.sync(doc)
    expect(bridge.clockPins()).toEqual([{ component: bridge.simComponent('c1'), port: 'out' }])
    bridge.sync(deleteItems(doc, ['c1']))
    expect(bridge.clockPins()).toEqual([])
  })
})
