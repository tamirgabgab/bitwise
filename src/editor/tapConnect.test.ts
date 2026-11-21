import { describe, expect, it } from 'vitest'
import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { attached, linksBetweenParts, linksFromPin, pinDirection, wireBetween } from './tapConnect.ts'

const pin = (component: string, port: string) => ({ kind: 'pin', component, port }) as const

/** Adds parts of the given types, named c1, c2, ... in order. */
function parts(...types: string[]): CircuitDoc {
  let doc = emptyDoc()
  types.forEach((type, index) => {
    doc = addComponent(doc, type, { x: index * 10, y: 0 }).doc
  })
  return doc
}

describe('pinDirection', () => {
  it('reads the direction from the symbol', () => {
    const doc = parts('and')
    expect(pinDirection(doc, pin('c1', 'in0'))).toBe('in')
    expect(pinDirection(doc, pin('c1', 'out'))).toBe('out')
    expect(pinDirection(doc, pin('c1', 'nothing'))).toBeUndefined()
  })
})

describe('linksBetweenParts', () => {
  it('joins the output of the first to the first free input of the second', () => {
    expect(linksBetweenParts(parts('input', 'and'), 'c1', 'c2')).toEqual([
      { from: pin('c1', 'out'), to: pin('c2', 'in0') },
    ])
  })

  it('skips an input that already has a wire', () => {
    let doc = parts('input', 'and', 'input')
    doc = addWire(doc, pin('c3', 'out'), pin('c2', 'in0'))!.doc
    expect(linksBetweenParts(doc, 'c1', 'c2')).toEqual([{ from: pin('c1', 'out'), to: pin('c2', 'in1') }])
  })

  it('goes the other way round for parts tapped in the wrong order', () => {
    expect(linksBetweenParts(parts('output', 'input'), 'c1', 'c2')).toEqual([
      { from: pin('c2', 'out'), to: pin('c1', 'in') },
    ])
  })

  it('offers each output of a part that has several', () => {
    const links = linksBetweenParts(parts('dff', 'output'), 'c1', 'c2')
    expect(links.map((link) => link.from)).toEqual([pin('c1', 'q'), pin('c1', 'nq')])
    expect(links.every((link) => link.to.kind === 'pin' && link.to.port === 'in')).toBe(true)
  })

  it('finds nothing between a part and itself, or when no input is free', () => {
    expect(linksBetweenParts(parts('and'), 'c1', 'c1')).toEqual([])
    let doc = parts('input', 'output', 'input')
    doc = addWire(doc, pin('c3', 'out'), pin('c2', 'in'))!.doc
    expect(linksBetweenParts(doc, 'c1', 'c2')).toEqual([])
  })

  it('does not join pins of different widths', () => {
    let doc = parts('input', 'output')
    doc = { ...doc, components: { ...doc.components, c1: { ...doc.components.c1, params: { ...doc.components.c1.params, width: 4 } } } }
    expect(linksBetweenParts(doc, 'c1', 'c2')).toEqual([])
  })
})

describe('linksFromPin', () => {
  it('takes an output to the first free input of the part', () => {
    expect(linksFromPin(parts('input', 'or'), pin('c1', 'out'), 'c2')).toEqual([
      { from: pin('c1', 'out'), to: pin('c2', 'in0') },
    ])
  })

  it('offers an input every output of the part', () => {
    const links = linksFromPin(parts('output', 'dff'), pin('c1', 'in'), 'c2')
    expect(links.map((link) => link.from)).toEqual([pin('c2', 'q'), pin('c2', 'nq')])
  })
})

describe('wireBetween and attached', () => {
  it('finds the wire that joins two pins, whichever way it was drawn', () => {
    let doc = parts('input', 'output')
    doc = addWire(doc, pin('c2', 'in'), pin('c1', 'out'))!.doc
    expect(wireBetween(doc, pin('c1', 'out'), pin('c2', 'in'))).toBe('w3')
    expect(attached(doc, pin('c1', 'out'))).toBe(true)
    expect(wireBetween(parts('input', 'output'), pin('c1', 'out'), pin('c2', 'in'))).toBeUndefined()
  })
})
