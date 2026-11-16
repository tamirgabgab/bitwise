import { describe, expect, it } from 'vitest'
import {
  addComponent,
  addSubcircuit,
  addWire,
  deleteItems,
  emptyDoc,
  setComponentLabel,
} from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import {
  MAX_CIRCUIT_NAME,
  canPlace,
  cleanCircuitName,
  contains,
  interfaceOf,
  reconcileAll,
  reconcileDoc,
  repairDoc,
  subRefOf,
  usersOf,
} from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** Switch c1 "A" into NOT c2 into output c3 "Y". */
function inverter(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 16, y: 0 }, { label: 'Y' }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  return addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
}

/** A drawing whose only part, c1, stands for `target`. */
function using(target: Circuit): CircuitDoc {
  return addSubcircuit(emptyDoc(), subRefOf(target), { x: 0, y: 0 }).doc
}

function project(...circuits: Circuit[]): Circuits {
  return Object.fromEntries(circuits.map((circuit) => [circuit.id, circuit]))
}

describe('cleanCircuitName', () => {
  it('trims the name and keeps single spaces between words', () => {
    expect(cleanCircuitName('  Half   adder ')).toBe('Half adder')
  })

  it('cuts a name that is too long', () => {
    expect(cleanCircuitName('x'.repeat(60))).toHaveLength(MAX_CIRCUIT_NAME)
  })

  it('has no name to give for a blank one', () => {
    expect(cleanCircuitName('   ')).toBeUndefined()
  })
})

describe('interfaceOf', () => {
  it('makes an input of every switch and an output of every output part', () => {
    expect(interfaceOf(inverter())).toEqual({
      inputs: [{ port: 'c1', label: 'A' }],
      outputs: [{ port: 'c3', label: 'Y' }],
    })
  })

  it('orders the pins from top to bottom, then from left to right', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 4, y: 8 }, { label: 'low' }).doc
    doc = addComponent(doc, 'input', { x: 6, y: 0 }, { label: 'right' }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'left' }).doc
    expect(interfaceOf(doc).inputs.map((item) => item.label)).toEqual(['left', 'right', 'low'])
  })

  it('numbers the pins that have no name', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 4 }, { label: 'B' }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 8 }).doc
    doc = addComponent(doc, 'output', { x: 9, y: 0 }).doc
    const pins = interfaceOf(doc)
    expect(pins.inputs.map((item) => item.label)).toEqual(['in1', 'B', 'in3'])
    expect(pins.outputs.map((item) => item.label)).toEqual(['out1'])
  })

  it('leaves push buttons, constants and gates inside', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'button', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'const', { x: 0, y: 4 }).doc
    doc = addComponent(doc, 'and', { x: 8, y: 2 }).doc
    expect(interfaceOf(doc)).toEqual({ inputs: [], outputs: [] })
  })

  it('works the pins out once per drawing', () => {
    const doc = inverter()
    expect(interfaceOf(doc)).toBe(interfaceOf(doc))
  })
})

describe('subRefOf', () => {
  it('carries the id, the name and the pins of the circuit', () => {
    const circuit: Circuit = { id: 'k2', name: 'Inverter', doc: inverter() }
    expect(subRefOf(circuit)).toEqual({
      circuit: 'k2',
      name: 'Inverter',
      inputs: [{ port: 'c1', label: 'A' }],
      outputs: [{ port: 'c3', label: 'Y' }],
    })
    expect(subRefOf(circuit)).toBe(subRefOf(circuit))
  })
})

describe('reconcileDoc', () => {
  const inner: Circuit = { id: 'k2', name: 'Inverter', doc: inverter() }

  it('returns the same drawing when nothing changed', () => {
    const host = using(inner)
    expect(reconcileDoc(host, project(inner))).toBe(host)
  })

  it('leaves a drawing without named circuits alone', () => {
    const doc = inverter()
    expect(reconcileDoc(doc, {})).toBe(doc)
  })

  it('takes over a new name', () => {
    const host = using(inner)
    const renamed = { ...inner, name: 'NOT' }
    expect(reconcileDoc(host, project(renamed)).components.c1.sub?.name).toBe('NOT')
  })

  it('takes over a renamed pin and keeps the wire on it', () => {
    let host = using(inner)
    host = addComponent(host, 'input', { x: -10, y: 0 }).doc
    host = addWire(host, pin('c2', 'out'), pin('c1', 'c1'))!.doc
    const changed = { ...inner, doc: setComponentLabel(inner.doc, 'c1', 'In') }
    const next = reconcileDoc(host, project(changed))
    expect(next.components.c1.sub?.inputs).toEqual([{ port: 'c1', label: 'In' }])
    expect(Object.keys(next.wires)).toEqual(Object.keys(host.wires))
  })

  it('removes the wires on a pin that is gone, and only those', () => {
    let host = using(inner)
    host = addComponent(host, 'input', { x: -10, y: 0 }).doc
    host = addComponent(host, 'output', { x: 12, y: 0 }).doc
    const kept = addWire(host, pin('c2', 'out'), pin('c1', 'c1'))!
    const lost = addWire(kept.doc, pin('c1', 'c3'), pin('c3', 'in'))!
    const changed = { ...inner, doc: deleteItems(inner.doc, ['c3']) }
    const next = reconcileDoc(lost.doc, project(changed))
    expect(next.components.c1.sub?.outputs).toEqual([])
    expect(Object.keys(next.wires)).toEqual([kept.id])
  })

  it('removes a part whose circuit no longer exists, with its wires', () => {
    let host = using(inner)
    host = addComponent(host, 'input', { x: -10, y: 0 }).doc
    host = addWire(host, pin('c2', 'out'), pin('c1', 'c1'))!.doc
    const next = reconcileDoc(host, {})
    expect(Object.keys(next.components)).toEqual(['c2'])
    expect(next.wires).toEqual({})
  })
})

describe('reconcileAll', () => {
  it('returns the same project when every drawing is up to date', () => {
    const inner: Circuit = { id: 'k2', name: 'Inverter', doc: inverter() }
    const circuits = project(inner, { id: 'k1', name: 'Main', doc: using(inner) })
    expect(reconcileAll(circuits)).toBe(circuits)
  })

  it('updates the circuits that use a changed one and leaves the rest', () => {
    const inner: Circuit = { id: 'k2', name: 'Inverter', doc: inverter() }
    const main: Circuit = { id: 'k1', name: 'Main', doc: using(inner) }
    const other: Circuit = { id: 'k3', name: 'Other', doc: inverter() }
    const renamed = { ...inner, name: 'NOT' }
    const next = reconcileAll(project(main, renamed, other))
    expect(next.k1.doc.components.c1.sub?.name).toBe('NOT')
    expect(next.k2).toBe(renamed)
    expect(next.k3).toBe(other)
  })
})

describe('repairDoc', () => {
  it('drops a wire that ends on something the drawing does not have', () => {
    const doc = inverter()
    const [first, second] = Object.keys(doc.wires)
    const components = { ...doc.components }
    delete components.c3
    const repaired = repairDoc({ ...doc, components })
    expect(Object.keys(repaired.wires)).toEqual([first])
    expect(second).toBeDefined()
  })

  it('returns a sound drawing as it is', () => {
    const doc = inverter()
    expect(repairDoc(doc)).toBe(doc)
  })
})

describe('circuits inside circuits', () => {
  // k1 uses k2, and k2 uses k3.
  const leaf: Circuit = { id: 'k3', name: 'Leaf', doc: inverter() }
  const middle: Circuit = { id: 'k2', name: 'Middle', doc: using(leaf) }
  const top: Circuit = { id: 'k1', name: 'Top', doc: using(middle) }
  const circuits = project(top, middle, leaf)

  it('knows what a circuit holds, at any depth', () => {
    expect(contains(circuits, 'k1', 'k1')).toBe(true)
    expect(contains(circuits, 'k1', 'k2')).toBe(true)
    expect(contains(circuits, 'k1', 'k3')).toBe(true)
    expect(contains(circuits, 'k3', 'k1')).toBe(false)
    expect(contains(circuits, 'k2', 'k1')).toBe(false)
  })

  it('lets a circuit be used where it does not end up inside itself', () => {
    expect(canPlace(circuits, 'k1', 'k3')).toBe(true)
    expect(canPlace(circuits, 'k2', 'k3')).toBe(true)
  })

  it('refuses a circuit inside itself, directly or through others', () => {
    expect(canPlace(circuits, 'k1', 'k1')).toBe(false)
    expect(canPlace(circuits, 'k2', 'k1')).toBe(false)
    expect(canPlace(circuits, 'k3', 'k1')).toBe(false)
  })

  it('refuses a circuit that does not exist', () => {
    expect(canPlace(circuits, 'k1', 'k9')).toBe(false)
    expect(canPlace(circuits, 'k9', 'k1')).toBe(false)
  })

  it('lists the circuits that use one directly', () => {
    expect(usersOf(circuits, 'k3')).toEqual(['k2'])
    expect(usersOf(circuits, 'k2')).toEqual(['k1'])
    expect(usersOf(circuits, 'k1')).toEqual([])
  })
})
