import { describe, expect, it } from 'vitest'
import { addComponent, addJunction, emptyDoc } from './document.ts'
import type { Terminal } from './document.ts'
import { pinWidth, widthOf } from './widths.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

describe('pinWidth', () => {
  it('reads the width of a pin from the settings of its part', () => {
    let doc = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }, { params: { width: 4 } }).doc
    doc = addComponent(doc, 'split', { x: 10, y: 0 }, { params: { width: 4, each: 3 } }).doc
    expect(pinWidth(doc, pin('c1', 'out'))).toBe(4)
    expect(pinWidth(doc, pin('c2', 'in'))).toBe(4)
    expect(pinWidth(doc, pin('c2', 'd0'))).toBe(3)
    expect(pinWidth(doc, pin('c2', 'd1'))).toBe(1)
  })

  it('does not know a junction, a missing part or a missing pin', () => {
    let doc = addComponent(emptyDoc(), 'and', { x: 0, y: 0 }).doc
    const added = addJunction(doc, { x: 5, y: 5 })
    doc = added.doc
    expect(pinWidth(doc, { kind: 'junction', junction: added.id })).toBeUndefined()
    expect(pinWidth(doc, pin('c9', 'out'))).toBeUndefined()
    expect(pinWidth(doc, pin('c1', 'nope'))).toBeUndefined()
  })
})

describe('widthOf', () => {
  it('takes the first width it can find, and 1 when there is none', () => {
    let doc = addComponent(emptyDoc(), 'output', { x: 0, y: 0 }, { params: { width: 8 } }).doc
    const added = addJunction(doc, { x: 5, y: 5 })
    doc = added.doc
    const junction: Terminal = { kind: 'junction', junction: added.id }
    expect(widthOf(doc, [junction, pin('c1', 'in')])).toBe(8)
    expect(widthOf(doc, [junction])).toBe(1)
  })
})
