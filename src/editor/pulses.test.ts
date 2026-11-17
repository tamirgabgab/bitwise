import { describe, expect, it } from 'vitest'
import { addComponent, addJunction, addWire, emptyDoc } from './document.ts'
import type { Terminal } from './document.ts'
import { PULSE_TIME, QUIET_TIME, WirePulses, flowDirections } from './pulses.ts'

const values = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries))

describe('WirePulses', () => {
  it('starts no wave for a wire it sees for the first time', () => {
    const pulses = new WirePulses()
    pulses.observe(values({ w1: '0' }), 0)
    expect(pulses.progress('w1', 0)).toBeUndefined()
    expect(pulses.active(0)).toBe(false)
  })

  it('runs a wave from 0 to 1 after a change, and then stops', () => {
    const pulses = new WirePulses()
    pulses.observe(values({ w1: '0' }), 0)
    pulses.observe(values({ w1: '1' }), 1000)
    expect(pulses.progress('w1', 1000)).toBe(0)
    expect(pulses.progress('w1', 1000 + PULSE_TIME / 2)).toBeCloseTo(0.5)
    expect(pulses.active(1000 + PULSE_TIME / 2)).toBe(true)
    expect(pulses.progress('w1', 1000 + PULSE_TIME)).toBeUndefined()
    expect(pulses.active(1000 + PULSE_TIME)).toBe(false)
  })

  it('leaves a wire that did not change alone', () => {
    const pulses = new WirePulses()
    pulses.observe(values({ w1: '0', w2: '1' }), 0)
    pulses.observe(values({ w1: '1', w2: '1' }), 1000)
    expect(pulses.progress('w2', 1000)).toBeUndefined()
  })

  it('gives no wave to a wire that changes again and again, like a clock line', () => {
    const pulses = new WirePulses()
    pulses.observe(values({ w1: '0' }), 0)
    pulses.observe(values({ w1: '1' }), 1000)
    pulses.observe(values({ w1: '0' }), 1050)
    expect(pulses.progress('w1', 1050)).toBeUndefined()
    pulses.observe(values({ w1: '1' }), 1100)
    expect(pulses.progress('w1', 1100)).toBeUndefined()
    // After it has been quiet for a while, a change shows again.
    pulses.observe(values({ w1: '0' }), 1100 + QUIET_TIME)
    expect(pulses.progress('w1', 1100 + QUIET_TIME)).toBe(0)
  })

  it('forgets a wire that is gone, and everything on reset', () => {
    const pulses = new WirePulses()
    pulses.observe(values({ w1: '0' }), 0)
    pulses.observe(values({ w1: '1' }), 1000)
    pulses.observe(values({}), 1010)
    expect(pulses.active(1010)).toBe(false)
    pulses.observe(values({ w1: '0' }), 1020)
    expect(pulses.progress('w1', 1020)).toBeUndefined()

    pulses.observe(values({ w1: '1' }), 3000)
    expect(pulses.active(3000)).toBe(true)
    pulses.reset()
    expect(pulses.active(3000)).toBe(false)
  })
})

describe('flowDirections', () => {
  const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

  it('points a wire from the output that drives it to the input it feeds', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc
    const forward = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!
    expect(flowDirections(forward.doc).get(forward.id)).toBe(1)
    const backward = addWire(doc, pin('c2', 'in'), pin('c1', 'out'))!
    expect(flowDirections(backward.doc).get(backward.id)).toBe(-1)
  })

  it('follows the value through a junction to every branch', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 20, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 20, y: 8 }).doc
    const junction = addJunction(doc, { x: 10, y: 0 })
    doc = junction.doc
    const at: Terminal = { kind: 'junction', junction: junction.id }
    const trunk = addWire(doc, at, pin('c1', 'out'))!
    const first = addWire(trunk.doc, at, pin('c2', 'in'))!
    const second = addWire(first.doc, pin('c3', 'in'), at)!
    const flow = flowDirections(second.doc)
    expect(flow.get(trunk.id)).toBe(-1)
    expect(flow.get(first.id)).toBe(1)
    expect(flow.get(second.id)).toBe(-1)
  })

  it('cannot tell for a wire that no output drives', () => {
    let doc = emptyDoc()
    doc = addComponent(doc, 'not', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'not', { x: 0, y: 8 }).doc
    const wire = addWire(doc, pin('c1', 'in'), pin('c2', 'in'))!
    expect(flowDirections(wire.doc).get(wire.id)).toBe(0)
  })
})
