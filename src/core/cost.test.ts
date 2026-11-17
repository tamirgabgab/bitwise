import { describe, expect, it } from 'vitest'
import { circuitCost } from './cost.ts'
import { Simulator } from './simulator.ts'

describe('circuitCost', () => {
  it('finds nothing in an empty circuit', () => {
    expect(circuitCost(new Simulator())).toEqual({ gates: 0, depth: 0 })
  })

  it('counts gates, and not switches, constants, clocks or lamps', () => {
    const sim = new Simulator()
    const a = sim.addComponent('input')
    const b = sim.addComponent('const')
    sim.addComponent('clock')
    const and = sim.addComponent('and')
    const lamp = sim.addComponent('output')
    sim.connect({ component: a, port: 'out' }, { component: and, port: 'in0' })
    sim.connect({ component: b, port: 'out' }, { component: and, port: 'in1' })
    sim.connect({ component: and, port: 'out' }, { component: lamp, port: 'in' })
    expect(circuitCost(sim)).toEqual({ gates: 1, depth: 1 })
  })

  it('measures the longest way through, not the shortest', () => {
    // a -> not -> not -> and, and a -> and directly.
    const sim = new Simulator()
    const a = sim.addComponent('input')
    const first = sim.addComponent('not')
    const second = sim.addComponent('not')
    const and = sim.addComponent('and')
    sim.connect({ component: a, port: 'out' }, { component: first, port: 'in' })
    sim.connect({ component: first, port: 'out' }, { component: second, port: 'in' })
    sim.connect({ component: second, port: 'out' }, { component: and, port: 'in0' })
    sim.connect({ component: a, port: 'out' }, { component: and, port: 'in1' })
    expect(circuitCost(sim)).toEqual({ gates: 3, depth: 3 })
  })

  it('adds up the delays along the way', () => {
    const sim = new Simulator()
    const slow = sim.addComponent('not', { delay: 5 })
    const fast = sim.addComponent('not', { delay: 2 })
    sim.connect({ component: slow, port: 'out' }, { component: fast, port: 'in' })
    expect(circuitCost(sim).depth).toBe(7)
    sim.setDelay(fast, 10)
    expect(circuitCost(sim).depth).toBe(15)
  })

  it('counts two wires between the same gates as one step', () => {
    const sim = new Simulator()
    const not = sim.addComponent('not')
    const and = sim.addComponent('and')
    sim.connect({ component: not, port: 'out' }, { component: and, port: 'in0' })
    sim.connect({ component: not, port: 'out' }, { component: and, port: 'in1' })
    expect(circuitCost(sim)).toEqual({ gates: 2, depth: 2 })
  })

  it('has no depth for a circuit with a loop', () => {
    const sim = new Simulator()
    const nand = sim.addComponent('nand')
    const not = sim.addComponent('not')
    sim.connect({ component: nand, port: 'out' }, { component: nand, port: 'in1' })
    sim.connect({ component: nand, port: 'out' }, { component: not, port: 'in' })
    expect(circuitCost(sim)).toEqual({ gates: 2, depth: undefined })
  })

  it('takes a chain of flip-flops as a chain of gates', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock')
    const first = sim.addComponent('tff')
    const second = sim.addComponent('tff')
    sim.connect({ component: clock, port: 'out' }, { component: first, port: 'clk' })
    sim.connect({ component: first, port: 'nq' }, { component: second, port: 'clk' })
    expect(circuitCost(sim)).toEqual({ gates: 2, depth: 2 })
  })
})
