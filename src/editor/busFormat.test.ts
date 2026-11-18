import { describe, expect, it } from 'vitest'
import { X, Z, parseSignal } from '../core/index.ts'
import { busFormatsFor, busText, busTextOf, formatAt, setBusFormat } from './busFormat.ts'
import { addComponent, addWire, bendWire, copyItems, emptyDoc, pasteFragment } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { describeEdit } from './editNames.ts'
import { fromProjectData, toProjectData } from './project.ts'
import { DEFAULT_SETTINGS } from './store.ts'
import { signalText } from './valueStyle.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/** A 4-digit switch c1 wired to a 4-digit output c2 by wire w3. */
function bus(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { params: { width: 4 } }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 0 }, { params: { width: 4 } }).doc
  return addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
}

describe('writing a bus', () => {
  it('writes the number in decimal, hex, or balanced with a sign', () => {
    const value = parseSignal('1011') // 11
    expect(busText(value, 2, 'digits')).toBeUndefined()
    expect(busText(value, 2, 'decimal')).toBe('11')
    expect(busText(value, 2, 'hex')).toBe('0xB')
    // Radix 3: "0212" is 2*9 + 1*3 + 2 = 23. Balanced, each digit counts one
    // less, so the four weights 27 + 9 + 3 + 1 come off: 23 - 40 = -17.
    const ternary = parseSignal('0212', 3)
    expect(busText(ternary, 3, 'decimal')).toBe('23')
    expect(busText(ternary, 3, 'balanced')).toBe('−17')
    expect(busText(parseSignal('2222', 3), 3, 'balanced')).toBe('+40')
    expect(busText(parseSignal('0000', 3), 3, 'balanced')).toBe('−40')
    expect(busText(parseSignal('1111', 3), 3, 'balanced')).toBe('0')
  })

  it('keeps the digits when there is no number to write', () => {
    expect(busText([1, X, 0, 1], 2, 'decimal')).toBeUndefined()
    expect(busText([Z, Z], 2, 'hex')).toBeUndefined()
    expect(busText([1], 2, 'decimal')).toBeUndefined()
    expect(signalText([1, X, 0, 1], { radix: 2, balanced: false } as never, 'decimal')).toBe('10X1')
  })

  it('handles buses wider than a safe integer', () => {
    const wide = Array.from({ length: 32 }, () => 15)
    expect(busText(wide, 16, 'hex')).toBe(`0x${'F'.repeat(32)}`)
  })

  it('offers a balanced form only at an odd radix', () => {
    expect(busFormatsFor(2)).toEqual(['digits', 'decimal', 'hex'])
    expect(busFormatsFor(3)).toEqual(['digits', 'decimal', 'balanced', 'hex'])
  })

  it('rewrites the digits the timing diagram keeps', () => {
    expect(busTextOf('1011', 2, 'decimal')).toBe('11')
    expect(busTextOf('10X1', 2, 'decimal')).toBe('10X1')
    expect(busTextOf('1011', 2, undefined)).toBe('1011')
  })
})

describe('the format of a bus in the drawing', () => {
  it('belongs to the whole net and goes away with digits', () => {
    let doc = bus()
    doc = addComponent(doc, 'output', { x: 20, y: 8 }, { params: { width: 4 } }).doc // c4
    doc = addWire(doc, pin('c1', 'out'), pin('c4', 'in'))!.doc // w5
    const hex = setBusFormat(doc, pin('c2', 'in'), 'hex')
    expect(hex.wires.w3.format).toBe('hex')
    expect(hex.wires.w5.format).toBe('hex')
    expect(formatAt(hex, pin('c4', 'in'))).toBe('hex')
    expect(setBusFormat(hex, pin('c1', 'out'), 'hex')).toBe(hex)
    const back = setBusFormat(hex, pin('c1', 'out'), 'digits')
    expect(back.wires.w3).toEqual(doc.wires.w3)
    expect(formatAt(back, pin('c4', 'in'))).toBe('digits')
  })

  it('stays when a wire is bent, copied or saved', () => {
    const doc = setBusFormat(bus(), pin('c1', 'out'), 'decimal')
    const bent = bendWire(doc, 'w3', [{ x: 8, y: 0 }, { x: 12, y: 0 }], 0, 2)!.doc
    expect(Object.values(bent.wires).every((wire) => wire.format === 'decimal')).toBe(true)
    const pasted = pasteFragment(doc, copyItems(doc, ['c1', 'c2']), { x: 0, y: 10 }).doc
    expect(Object.values(pasted.wires).every((wire) => wire.format === 'decimal')).toBe(true)

    const project = {
      settings: DEFAULT_SETTINGS,
      circuits: { main: { id: 'main', name: 'Main', doc } },
      order: ['main'],
      active: 'main',
      views: {},
      inputs: {},
      nextCircuit: 1,
    } as unknown as Parameters<typeof toProjectData>[0]
    const loaded = fromProjectData(JSON.parse(JSON.stringify(toProjectData(project))))
    expect(loaded.circuits.main.doc.wires.w3.format).toBe('decimal')
  })

  it('is named in the edit history', () => {
    const doc = bus()
    const named = describeEdit(doc, setBusFormat(doc, pin('c1', 'out'), 'hex'), (part) => part.type)
    expect(named).toBe('Change how a bus is written')
  })
})
