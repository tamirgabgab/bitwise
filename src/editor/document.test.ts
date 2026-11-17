import { describe, expect, it } from 'vitest'
import {
  MAX_DELAY,
  isSwitchKey,
  keyName,
  setComponentDelay,
  setComponentKey,
  MAX_LABEL,
  MAX_TEXT,
  SUB_TYPE,
  TEXT_TYPE,
  addComponent,
  addSubcircuit,
  addText,
  addWire,
  duplicateItems,
  setComponentText,
  connectEnds,
  copyItems,
  deleteItems,
  emptyDoc,
  junctionDegrees,
  moveItems,
  pasteFragment,
  rotateComponents,
  setComponentLabel,
  setComponentParams,
  terminalEnd,
} from './document.ts'
import type { CircuitDoc, SubRef, Terminal, WireEnd } from './document.ts'
import { symbolOf } from './symbols.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const at = (terminal: Terminal): WireEnd => ({ kind: 'terminal', terminal })

/** Two inputs (c1, c2) wired to an AND gate (c3) by wires w4 and w5. */
function andCircuit(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 6 }).doc
  doc = addComponent(doc, 'and', { x: 12, y: 3 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in1'))!.doc
  return doc
}

describe('adding parts', () => {
  it('hands out ids in order and fills in default parameters', () => {
    const first = addComponent(emptyDoc(), 'and', { x: 1, y: 2 })
    const second = addComponent(first.doc, 'not', { x: 5, y: 5 })
    expect([first.id, second.id]).toEqual(['c1', 'c2'])
    expect(second.doc.components.c1).toEqual({
      id: 'c1',
      type: 'and',
      params: { inputs: 2, width: 1 },
      delay: 1,
      pos: { x: 1, y: 2 },
      rotation: 0,
    })
  })

  it('refuses an unknown type or a bad parameter', () => {
    expect(() => addComponent(emptyDoc(), 'flux-capacitor', { x: 0, y: 0 })).toThrow()
    expect(() =>
      addComponent(emptyDoc(), 'and', { x: 0, y: 0 }, { params: { inputs: 99 } }),
    ).toThrow()
  })

  it('does not change the document it was given', () => {
    const before = emptyDoc()
    addComponent(before, 'and', { x: 0, y: 0 })
    expect(before).toEqual(emptyDoc())
  })
})

describe('terminalEnd', () => {
  it('follows the position and rotation of the part', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 10, y: 10 }).doc
    expect(terminalEnd(doc, pin('c1', 'out'))).toEqual({ pos: { x: 13, y: 10 }, dir: { x: 1, y: 0 } })
    doc = rotateComponents(doc, ['c1'])
    expect(terminalEnd(doc, pin('c1', 'out'))).toEqual({ pos: { x: 10, y: 13 }, dir: { x: 0, y: 1 } })
  })

  it('is undefined for a part or port that does not exist', () => {
    const doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    expect(terminalEnd(doc, pin('c9', 'out'))).toBeUndefined()
    expect(terminalEnd(doc, pin('c1', 'nope'))).toBeUndefined()
    expect(terminalEnd(doc, { kind: 'junction', junction: 'j9' })).toBeUndefined()
  })
})

describe('wires', () => {
  it('refuses a wire to itself, to nowhere, or a second one between the same ends', () => {
    const doc = andCircuit()
    expect(addWire(doc, pin('c1', 'out'), pin('c1', 'out'))).toBeUndefined()
    expect(addWire(doc, pin('c1', 'out'), pin('c9', 'in0'))).toBeUndefined()
    expect(addWire(doc, pin('c1', 'out'), pin('c3', 'in0'))).toBeUndefined()
    expect(addWire(doc, pin('c3', 'in0'), pin('c1', 'out'))).toBeUndefined()
  })

  it('splits a wire with a junction when a new wire ends on it', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    const next = connectEnds(doc, at(pin('c6', 'in')), {
      kind: 'wire',
      wire: 'w4',
      pos: { x: 6, y: 0 },
    })!
    expect(next.wires.w4).toBeUndefined()
    const junctions = Object.values(next.junctions)
    expect(junctions).toHaveLength(1)
    expect(junctions[0].pos).toEqual({ x: 6, y: 0 })
    expect(Object.keys(next.wires)).toHaveLength(4)
    expect(junctionDegrees(next).get(junctions[0].id)).toBe(3)
  })

  it('reuses a junction that is already at that spot', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    doc = addComponent(doc, 'buffer', { x: 12, y: -10 }).doc
    doc = connectEnds(doc, at(pin('c6', 'in')), { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } })!
    const junction = Object.values(doc.junctions)[0]
    const half = Object.values(doc.wires).find(
      (wire) => wire.to.kind === 'junction' && wire.from.kind === 'pin',
    )!
    const next = connectEnds(doc, at(pin('c7', 'in')), {
      kind: 'wire',
      wire: half.id,
      pos: junction.pos,
    })!
    expect(Object.keys(next.junctions)).toEqual([junction.id])
    expect(junctionDegrees(next).get(junction.id)).toBe(4)
  })

  it('refuses a wire from a wire to itself', () => {
    const doc = andCircuit()
    expect(
      connectEnds(
        doc,
        { kind: 'wire', wire: 'w4', pos: { x: 4, y: 0 } },
        { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } },
      ),
    ).toBeUndefined()
  })
})

describe('moving and rotating', () => {
  it('moves parts and leaves everything else as it was', () => {
    const doc = andCircuit()
    const moved = moveItems(doc, ['c3'], 2, -1)
    expect(moved.components.c3.pos).toEqual({ x: 14, y: 2 })
    expect(moved.components.c1).toBe(doc.components.c1)
    expect(moved.wires).toBe(doc.wires)
    expect(terminalEnd(moved, pin('c3', 'in0'))?.pos).toEqual({ x: 11, y: 1 })
  })

  it('returns the same document when nothing moves', () => {
    const doc = andCircuit()
    expect(moveItems(doc, ['c3'], 0, 0)).toBe(doc)
    expect(moveItems(doc, ['w4', 'missing'], 3, 3)).toBe(doc)
    expect(rotateComponents(doc, ['w4'])).toBe(doc)
  })

  it('turns a part a quarter turn at a time', () => {
    let doc = andCircuit()
    for (const expected of [1, 2, 3, 0]) {
      doc = rotateComponents(doc, ['c3'])
      expect(doc.components.c3.rotation).toBe(expected)
    }
  })
})

describe('deleting', () => {
  it('takes the wires of a deleted part with it', () => {
    const next = deleteItems(andCircuit(), ['c3'])
    expect(Object.keys(next.components)).toEqual(['c1', 'c2'])
    expect(next.wires).toEqual({})
  })

  it('deletes a single wire and nothing else', () => {
    const next = deleteItems(andCircuit(), ['w4'])
    expect(Object.keys(next.components)).toHaveLength(3)
    expect(Object.keys(next.wires)).toEqual(['w5'])
  })

  it('drops a junction once no wire uses it', () => {
    let doc = andCircuit()
    doc = addComponent(doc, 'not', { x: 12, y: -6 }).doc
    doc = connectEnds(doc, at(pin('c6', 'in')), { kind: 'wire', wire: 'w4', pos: { x: 6, y: 0 } })!
    const junction = Object.keys(doc.junctions)[0]

    const withoutJunction = deleteItems(doc, [junction])
    expect(withoutJunction.junctions).toEqual({})
    expect(Object.keys(withoutJunction.wires)).toEqual(['w5'])

    const touching = Object.values(doc.wires)
      .filter((wire) => wire.from.kind === 'junction' || wire.to.kind === 'junction')
      .map((wire) => wire.id)
    expect(deleteItems(doc, touching).junctions).toEqual({})
  })

  it('returns the same document when there is nothing to delete', () => {
    const doc = andCircuit()
    expect(deleteItems(doc, [])).toBe(doc)
    expect(deleteItems(doc, ['missing'])).toBe(doc)
  })
})

describe('copy and paste', () => {
  it('copies the wires that run between copied parts, and only those', () => {
    const fragment = copyItems(andCircuit(), ['c1', 'c3'])
    expect(fragment.components.map((component) => component.id)).toEqual(['c1', 'c3'])
    expect(fragment.wires.map((wire) => wire.id)).toEqual(['w4'])
  })

  it('pastes under fresh ids, shifted, and wired to the copies', () => {
    const doc = andCircuit()
    const pasted = pasteFragment(doc, copyItems(doc, ['c1', 'c3']), { x: 2, y: 2 })
    expect(pasted.ids).toEqual(['c6', 'c7'])
    expect(pasted.doc.components.c6.pos).toEqual({ x: 2, y: 2 })
    expect(pasted.doc.components.c7.pos).toEqual({ x: 14, y: 5 })
    expect(pasted.doc.wires.w8).toEqual({
      id: 'w8',
      from: pin('c6', 'out'),
      to: pin('c7', 'in0'),
    })
    expect(pasted.doc.nextId).toBe(9)
    // The original is untouched.
    expect(pasted.doc.components.c1).toBe(doc.components.c1)
    expect(Object.keys(pasted.doc.wires)).toHaveLength(3)
  })
})

describe('setComponentParams', () => {
  it('changes a parameter and keeps the rest', () => {
    const doc = andCircuit()
    const next = setComponentParams(doc, 'c3', { inputs: 4 })
    expect(next.components.c3.params).toEqual({ inputs: 4, width: 1 })
    expect(next.components.c3.pos).toEqual(doc.components.c3.pos)
    expect(next.components.c1).toBe(doc.components.c1)
    // The document it started from is untouched.
    expect(doc.components.c3.params.inputs).toBe(2)
  })

  it('keeps the wires of pins that are still there', () => {
    const next = setComponentParams(andCircuit(), 'c3', { inputs: 5 })
    expect(Object.keys(next.wires)).toEqual(['w4', 'w5'])
  })

  it('removes the wires of pins that are gone', () => {
    let doc = setComponentParams(andCircuit(), 'c3', { inputs: 3 })
    doc = addComponent(doc, 'input', { x: 0, y: 12 }).doc
    doc = addWire(doc, pin('c6', 'out'), pin('c3', 'in2'))!.doc
    expect(Object.keys(doc.wires)).toHaveLength(3)

    const fewer = setComponentParams(doc, 'c3', { inputs: 2 })
    expect(Object.keys(fewer.wires)).toEqual(['w4', 'w5'])
    expect(terminalEnd(fewer, pin('c3', 'in2'))).toBeUndefined()
  })

  it('returns the same document when nothing changes', () => {
    const doc = andCircuit()
    expect(setComponentParams(doc, 'c3', { inputs: 2 })).toBe(doc)
    expect(setComponentParams(doc, 'nope', { inputs: 3 })).toBe(doc)
  })

  it('rejects a value the part does not allow', () => {
    expect(() => setComponentParams(andCircuit(), 'c3', { inputs: 9 })).toThrow()
    expect(() => setComponentParams(andCircuit(), 'c3', { speed: 1 })).toThrow()
  })
})

describe('labels', () => {
  it('names a part when it is added', () => {
    const added = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }, { label: '  Carry in  ' })
    expect(added.doc.components[added.id].label).toBe('Carry in')
  })

  it('adds a part without a label when the label is blank', () => {
    const added = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }, { label: '   ' })
    expect('label' in added.doc.components[added.id]).toBe(false)
  })

  it('names a part later, trimmed and cut to length', () => {
    const doc = setComponentLabel(andCircuit(), 'c1', `  ${'x'.repeat(40)}  `)
    expect(doc.components.c1.label).toBe('x'.repeat(MAX_LABEL))
  })

  it('takes the name away for a blank label', () => {
    const named = setComponentLabel(andCircuit(), 'c1', 'A')
    const bare = setComponentLabel(named, 'c1', ' ')
    expect('label' in bare.components.c1).toBe(false)
  })

  it('returns the same drawing when the name does not change', () => {
    const named = setComponentLabel(andCircuit(), 'c1', 'A')
    expect(setComponentLabel(named, 'c1', ' A ')).toBe(named)
    expect(setComponentLabel(named, 'nope', 'B')).toBe(named)
  })

  it('keeps the name through a move, a rotation and a copy', () => {
    let doc = setComponentLabel(andCircuit(), 'c1', 'A')
    doc = rotateComponents(moveItems(doc, ['c1'], 2, 2), ['c1'])
    expect(doc.components.c1.label).toBe('A')
    const pasted = pasteFragment(doc, copyItems(doc, ['c1']), { x: 4, y: 4 })
    const copy = pasted.ids.find((id) => id in pasted.doc.components)!
    expect(pasted.doc.components[copy].label).toBe('A')
  })
})

describe('parts that stand for a named circuit', () => {
  const sub: SubRef = {
    circuit: 'k2',
    name: 'Half adder',
    inputs: [
      { port: 'c1', label: 'A' },
      { port: 'c2', label: 'B' },
    ],
    outputs: [{ port: 'c5', label: 'S' }],
  }

  it('adds one with the pins of its circuit', () => {
    const added = addSubcircuit(emptyDoc(), sub, { x: 3, y: 4 })
    const part = added.doc.components[added.id]
    expect(part).toMatchObject({ type: SUB_TYPE, params: {}, pos: { x: 3, y: 4 }, rotation: 0 })
    expect(part.sub).toBe(sub)
    expect(added.doc.nextId).toBe(2)
  })

  it('finds its pins by the id of the part behind each one', () => {
    const { doc, id } = addSubcircuit(emptyDoc(), sub, { x: 10, y: 10 })
    expect(terminalEnd(doc, pin(id, 'c1'))?.pos).toEqual({ x: 5, y: 9 })
    expect(terminalEnd(doc, pin(id, 'c2'))?.pos).toEqual({ x: 5, y: 11 })
    expect(terminalEnd(doc, pin(id, 'c5'))?.pos).toEqual({ x: 15, y: 10 })
    expect(terminalEnd(doc, pin(id, 'A'))).toBeUndefined()
  })

  it('wires to its pins like to any other', () => {
    let { doc } = addSubcircuit(emptyDoc(), sub, { x: 10, y: 10 })
    doc = addComponent(doc, 'input', { x: 0, y: 9 }).doc
    expect(addWire(doc, pin('c2', 'out'), pin('c1', 'c1'))).toBeDefined()
    expect(addWire(doc, pin('c2', 'out'), pin('c1', 'c9'))).toBeUndefined()
  })

  it('has no parameters to set', () => {
    const { doc, id } = addSubcircuit(emptyDoc(), sub, { x: 0, y: 0 })
    expect(setComponentParams(doc, id, { inputs: 3 })).toBe(doc)
  })

  it('keeps what it stands for through a copy', () => {
    const { doc, id } = addSubcircuit(emptyDoc(), sub, { x: 0, y: 0 })
    const pasted = pasteFragment(doc, copyItems(doc, [id]), { x: 12, y: 0 })
    const copy = pasted.ids.find((other) => other in pasted.doc.components)!
    expect(pasted.doc.components[copy].sub).toBe(sub)
  })
})

describe('the keyboard key of a switch', () => {
  it('takes letters and digits, but not R', () => {
    expect(isSwitchKey('KeyA')).toBe(true)
    expect(isSwitchKey('Digit7')).toBe(true)
    expect(isSwitchKey('KeyR')).toBe(false)
    expect(isSwitchKey('Space')).toBe(false)
    expect(isSwitchKey('a')).toBe(false)
    expect(isSwitchKey(undefined)).toBe(false)
    expect(keyName('KeyA')).toBe('A')
    expect(keyName('Digit7')).toBe('7')
  })

  it('is set, changed and taken away', () => {
    const start = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }).doc
    const keyed = setComponentKey(start, 'c1', 'KeyA')
    expect(keyed.components.c1.key).toBe('KeyA')
    expect(setComponentKey(keyed, 'c1', 'KeyA')).toBe(keyed)
    expect(setComponentKey(keyed, 'c1', 'Digit2').components.c1.key).toBe('Digit2')
    const cleared = setComponentKey(keyed, 'c1', null)
    expect('key' in cleared.components.c1).toBe(false)
    expect(setComponentKey(start, 'c1', null)).toBe(start)
  })

  it('goes only on a switch or a push button, and only if it is a key a switch can have', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'button', { x: 0, y: 6 }).doc
    expect(setComponentKey(doc, 'c1', 'KeyA')).toBe(doc)
    expect(setComponentKey(doc, 'c2', 'KeyR')).toBe(doc)
    expect(setComponentKey(doc, 'c2', 'Enter')).toBe(doc)
    expect(setComponentKey(doc, 'c9', 'KeyA')).toBe(doc)
    expect(setComponentKey(doc, 'c2', 'KeyB').components.c2.key).toBe('KeyB')
  })

  it('can come with a new part', () => {
    const doc = addComponent(emptyDoc(), 'button', { x: 0, y: 0 }, { key: 'Digit0' }).doc
    expect(doc.components.c1.key).toBe('Digit0')
    expect('key' in addComponent(doc, 'and', { x: 9, y: 0 }, { key: 'KeyA' }).doc.components.c2).toBe(false)
  })

  it('travels with a copy', () => {
    const doc = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }, { key: 'KeyQ' }).doc
    const pasted = pasteFragment(doc, copyItems(doc, ['c1']), { x: 4, y: 4 })
    expect(pasted.doc.components[pasted.ids[0]].key).toBe('KeyQ')
  })
})

describe('setComponentDelay', () => {
  it('sets a delay from 1 up to the limit', () => {
    const doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    expect(setComponentDelay(doc, 'c1', 5).components.c1.delay).toBe(5)
    expect(setComponentDelay(doc, 'c1', MAX_DELAY).components.c1.delay).toBe(MAX_DELAY)
    expect(setComponentDelay(doc, 'c1', 1)).toBe(doc)
  })

  it('never lets a delay of 0 through, nor a fraction, nor one too long', () => {
    const doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    expect(setComponentDelay(doc, 'c1', 0)).toBe(doc)
    expect(setComponentDelay(doc, 'c1', -3)).toBe(doc)
    expect(setComponentDelay(doc, 'c1', 1.5)).toBe(doc)
    expect(setComponentDelay(doc, 'c1', MAX_DELAY + 1)).toBe(doc)
    expect(setComponentDelay(doc, 'c7', 2)).toBe(doc)
  })
})

describe('a text label', () => {
  it('is a part with writing and no pins', () => {
    const added = addText(emptyDoc(), { x: 3, y: 4 }, '  Half   adder ')
    const label = added.doc.components[added.id]
    expect(label).toMatchObject({ type: TEXT_TYPE, text: 'Half adder', pos: { x: 3, y: 4 } })
    expect(symbolOf(label).pins).toEqual([])
  })

  it('grows its box with the writing', () => {
    const short = symbolOf({ type: TEXT_TYPE, params: {}, text: 'A' }).bounds
    const long = symbolOf({ type: TEXT_TYPE, params: {}, text: 'A much longer line' }).bounds
    expect(long.x1 - long.x0).toBeGreaterThan(short.x1 - short.x0)
  })

  it('takes new writing, cut to length, and ignores blank writing', () => {
    const added = addText(emptyDoc(), { x: 0, y: 0 })
    const renamed = setComponentText(added.doc, added.id, 'x'.repeat(MAX_TEXT + 5))
    expect(renamed.components[added.id].text).toHaveLength(MAX_TEXT)
    expect(setComponentText(renamed, added.id, '   ')).toBe(renamed)
    expect(setComponentText(andCircuit(), 'c3', 'no')).toEqual(andCircuit())
  })

  it('cannot be turned, named, delayed or given parameters', () => {
    const added = addText(emptyDoc(), { x: 0, y: 0 })
    const doc = added.doc
    expect(rotateComponents(doc, [added.id])).toBe(doc)
    expect(setComponentLabel(doc, added.id, 'A')).toBe(doc)
    expect(setComponentDelay(doc, added.id, 3)).toBe(doc)
    expect(setComponentParams(doc, added.id, { inputs: 3 })).toBe(doc)
  })

  it('moves, copies and is deleted like any other part', () => {
    const added = addText(andCircuit(), { x: 0, y: -4 }, 'Note')
    const moved = moveItems(added.doc, [added.id], 2, 1)
    expect(moved.components[added.id].pos).toEqual({ x: 2, y: -3 })
    const pasted = pasteFragment(moved, copyItems(moved, [added.id]), { x: 5, y: 5 })
    expect(pasted.doc.components[pasted.ids[0]]).toMatchObject({ type: TEXT_TYPE, text: 'Note' })
    expect(deleteItems(moved, [added.id]).components[added.id]).toBeUndefined()
  })
})

describe('duplicateItems', () => {
  it('copies the parts and the wires between them, and leaves the first copy alone', () => {
    const doc = andCircuit()
    const copied = duplicateItems(doc, ['c1', 'c3'], { x: 0, y: 20 })
    expect(copied.ids).toHaveLength(2)
    expect(Object.keys(copied.doc.components)).toHaveLength(5)
    // Only the wire from c1 to c3 runs between two copied parts.
    expect(Object.keys(copied.doc.wires)).toHaveLength(3)
    const [input, gate] = copied.ids
    expect(copied.doc.components[input].pos).toEqual({ x: 0, y: 20 })
    expect(copied.doc.components[gate].pos).toEqual({ x: 12, y: 23 })
    expect(copied.doc.components.c1).toBe(doc.components.c1)
  })
})
