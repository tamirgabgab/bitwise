import { describe, expect, it } from 'vitest'
import { formatSignal, parseSignal } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import {
  NET_PIN,
  NET_TYPE,
  addComponent,
  addNetLabel,
  addSubcircuit,
  addWire,
  emptyDoc,
  freeNetName,
  setComponentLabel,
  terminalKey,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { extractCircuit, extractable } from './extract.ts'
import { flatten } from './flatten.ts'
import { readLiveValues } from './liveValues.ts'
import { SimBridge } from './simBridge.ts'
import type { Library } from './flatten.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit } from './subcircuit.ts'

/*
 * The rule of net labels: two labels with the same name in one drawing
 * behave exactly as a wire drawn between their pins would.
 */

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const net = (component: string): Terminal => pin(component, NET_PIN)

/** Switch c1 into NOT c2, whose output reaches output c3 by a drawn wire. */
function drawn(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 30, y: 0 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  return addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
}

/**
 * The same circuit, but the NOT drives label c4 "A", and a second label c5
 * "A", far away, feeds the output. No wire runs between the two.
 */
function tagged(name = 'A'): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 30, y: 0 }).doc
  doc = addNetLabel(doc, { x: 13, y: 0 }, 'A').doc
  doc = addNetLabel(doc, { x: 18, y: 10 }, name).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  doc = addWire(doc, pin('c2', 'out'), net('c4'))!.doc
  return addWire(doc, net('c5'), pin('c3', 'in'))!.doc
}

function running(doc: CircuitDoc, library: Library = {}): SimBridge {
  const bridge = new SimBridge()
  bridge.sync(doc, library)
  bridge.sim.settle()
  return bridge
}

function setInput(bridge: SimBridge, id: string, text: string): void {
  bridge.sim.setState(bridge.simComponent(id)!, parseSignal(text))
  bridge.sim.settle()
}

/** What every wire of a drawing carries, as text, by the part pins at its ends. */
function wireValues(doc: CircuitDoc, bridge: SimBridge): string[] {
  const live = readLiveValues(doc, bridge)
  return Object.values(doc.wires).map((wire) => formatSignal(live.at(wire.from).signal))
}

describe('net labels', () => {
  it('behave exactly like the wire they stand for', () => {
    const plain = running(drawn())
    const labelled = running(tagged())
    for (const value of ['0', '1', '0']) {
      setInput(plain, 'c1', value)
      setInput(labelled, 'c1', value)
      const want = formatSignal(readLiveValues(drawn(), plain).at(pin('c3', 'in')).signal)
      const got = formatSignal(readLiveValues(tagged(), labelled).at(pin('c3', 'in')).signal)
      expect(got).toBe(want)
      expect(got).toBe(value === '0' ? '1' : '0')
      // Both wires of the label pair carry what the one drawn wire carries.
      const [, drawnOut] = wireValues(drawn(), plain)
      const [, toLabel, fromLabel] = wireValues(tagged(), labelled)
      expect([toLabel, fromLabel]).toEqual([drawnOut, drawnOut])
    }
  })

  it('make one net of the pins they carry', () => {
    const doc = tagged()
    const nets = terminalNets(doc)
    const of = (terminal: Terminal) => nets.get(terminalKey(terminal))
    expect(of(pin('c3', 'in'))).toBe(of(pin('c2', 'out')))
    expect(of(net('c4'))).toBe(of(net('c5')))
    // The simulator sees the same: one group with the NOT and the output.
    const groups = flatten(doc).groups.map((group) => group.map((p) => `${p.part}:${p.port}`).sort())
    expect(groups).toContainEqual(['c2:out', 'c3:in'])
    // The wire layout sees only what is drawn, so the two groups stay apart.
    const drawnOnly = terminalNets(doc, false)
    expect(drawnOnly.get(terminalKey(net('c4')))).not.toBe(drawnOnly.get(terminalKey(net('c5'))))
  })

  it('join nothing under another name, and come apart when renamed', () => {
    const other = running(tagged('B'))
    expect(formatSignal(readLiveValues(tagged('B'), other).at(pin('c3', 'in')).signal)).toBe('Z')
    const renamed = setComponentLabel(tagged(), 'c5', 'B')
    const nets = terminalNets(renamed)
    expect(nets.get(terminalKey(net('c4')))).not.toBe(nets.get(terminalKey(net('c5'))))
    // A label keeps a name: a blank one is ignored.
    expect(setComponentLabel(tagged(), 'c5', '  ')).toEqual(tagged())
  })

  it('reach only within their own circuit', () => {
    // Inside: switch "A" into label X, and another label X into output "Y".
    let inside = emptyDoc()
    inside = addComponent(inside, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
    inside = addComponent(inside, 'output', { x: 20, y: 0 }, { label: 'Y' }).doc
    inside = addNetLabel(inside, { x: 5, y: 0 }, 'X').doc
    inside = addNetLabel(inside, { x: 12, y: 4 }, 'X').doc
    inside = addWire(inside, pin('c1', 'out'), net('c3'))!.doc
    inside = addWire(inside, net('c4'), pin('c2', 'in'))!.doc
    const inner: Circuit = { id: 'k2', name: 'Pass', doc: inside }

    // Outside: switch c2 through the circuit c1 to output c3, and a switch
    // c4 on a label X of its own.
    let doc = addSubcircuit(emptyDoc(), subRefOf(inner), { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: -12, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 12, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: -12, y: 10 }).doc
    doc = addNetLabel(doc, { x: -6, y: 10 }, 'X').doc
    doc = addWire(doc, pin('c2', 'out'), pin('c1', 'c1'))!.doc
    doc = addWire(doc, pin('c1', 'c2'), pin('c3', 'in'))!.doc
    doc = addWire(doc, pin('c4', 'out'), net('c5'))!.doc

    const bridge = running(doc, { k2: inner })
    setInput(bridge, 'c2', '0')
    setInput(bridge, 'c4', '1')
    const live = () => readLiveValues(doc, bridge).at(pin('c3', 'in'))
    expect(formatSignal(live().signal)).toBe('0')
    expect(live().conflict).toBe(false)
    setInput(bridge, 'c2', '1')
    expect(formatSignal(live().signal)).toBe('1')
  })

  it('carry a bus, and show a join of two widths as faulty', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }, { params: { width: 4 } }).doc
    doc = addComponent(doc, 'output', { x: 30, y: 0 }, { params: { width: 4 } }).doc
    doc = addNetLabel(doc, { x: 6, y: 0 }, 'BUS').doc
    doc = addNetLabel(doc, { x: 20, y: 0 }, 'BUS').doc
    doc = addWire(doc, pin('c1', 'out'), net('c3'))!.doc
    doc = addWire(doc, net('c4'), pin('c2', 'in'))!.doc
    const bridge = running(doc)
    setInput(bridge, 'c1', '1010')
    expect(formatSignal(readLiveValues(doc, bridge).at(pin('c2', 'in')).signal)).toBe('1010')

    let mixed = addComponent(doc, 'output', { x: 30, y: 8 }).doc // c7, one digit
    mixed = addNetLabel(mixed, { x: 20, y: 8 }, 'BUS').doc // c8
    mixed = addWire(mixed, net('c8'), pin('c7', 'in'))!.doc
    expect(readLiveValues(mixed, running(mixed)).at(pin('c7', 'in')).mixed).toBe(true)
  })

  it('stay behind when a selection becomes a circuit, and the circuit still works', () => {
    const doc = tagged()
    expect(extractable(doc, ['c2', 'c4'])).toEqual(['c2'])
    const extraction = extractCircuit(doc, ['c2', 'c4'], 'k9', 'Not')!
    expect(extraction.doc.components.c4.type).toBe(NET_TYPE)
    // The pin that reaches the label takes its name.
    const names = Object.values(extraction.inner.components).map((part) => part.label)
    expect(names).toContain('A')
    const bridge = running(extraction.doc, { k9: { doc: extraction.inner } })
    for (const value of ['0', '1']) {
      setInput(bridge, 'c1', value)
      const out = readLiveValues(extraction.doc, bridge).at(pin('c3', 'in')).signal
      expect(formatSignal(out)).toBe(value === '0' ? '1' : '0')
    }
  })

  it('get a name no other label has', () => {
    expect(freeNetName(emptyDoc())).toBe('N1')
    let doc = addNetLabel(emptyDoc(), { x: 0, y: 0 }, 'N1').doc
    doc = addNetLabel(doc, { x: 0, y: 4 }, 'N3').doc
    expect(freeNetName(doc)).toBe('N2')
  })
})
