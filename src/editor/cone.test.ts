import { describe, expect, it } from 'vitest'
import { influenceCone } from './cone.ts'
import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

/**
 * Switch c1 into NOT c2 into NOT c3 into output c4, and beside it switch
 * c5 into output c6, which has nothing to do with the chain.
 */
function chain(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 8, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 16, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 24, y: 0 }).doc
  doc = addComponent(doc, 'input', { x: 0, y: 10 }).doc
  doc = addComponent(doc, 'output', { x: 24, y: 10 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc // w7
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc // w8
  doc = addWire(doc, pin('c3', 'out'), pin('c4', 'in'))!.doc // w9
  return addWire(doc, pin('c5', 'out'), pin('c6', 'in'))!.doc // w10
}

describe('influenceCone', () => {
  it('has nothing for an empty selection', () => {
    expect(influenceCone(chain(), new Set())).toBeUndefined()
  })

  it('reaches forward and backward from a part', () => {
    const doc = chain()
    const cone = influenceCone(doc, new Set(['c2']))!
    expect([...cone.parts].sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
    // What c2 drives is ahead; what drives it is not.
    expect(cone.ahead.has('c3')).toBe(true)
    expect(cone.ahead.has('c4')).toBe(true)
    expect(cone.ahead.has('c1')).toBe(false)
    const wireOf = (from: string): string =>
      Object.values(doc.wires).find((wire) => wire.from.kind === 'pin' && wire.from.component === from)!.id
    expect(cone.ahead.has(wireOf('c2'))).toBe(true)
    expect(cone.ahead.has(wireOf('c1'))).toBe(false)
    expect(cone.wires.has(wireOf('c1'))).toBe(true)
  })

  it('leaves out what has nothing to do with the selection', () => {
    const doc = chain()
    const cone = influenceCone(doc, new Set(['c2']))!
    expect(cone.parts.has('c5')).toBe(false)
    expect(cone.parts.has('c6')).toBe(false)
    expect(cone.wires.size).toBe(3)
  })

  it('runs both ways from a selected wire', () => {
    const doc = chain()
    const middle = Object.values(doc.wires).find(
      (wire) => wire.from.kind === 'pin' && wire.from.component === 'c2',
    )!
    const cone = influenceCone(doc, new Set([middle.id]))!
    expect([...cone.parts].sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(cone.ahead.has('c3')).toBe(true)
    expect(cone.ahead.has('c2')).toBe(false)
  })

  it('stops in a loop', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'nand', { x: 0, y: 0 }).doc
    doc = addWire(doc, pin('c1', 'out'), pin('c1', 'in0'))!.doc
    const cone = influenceCone(doc, new Set(['c1']))!
    expect([...cone.parts]).toEqual(['c1'])
  })
})
