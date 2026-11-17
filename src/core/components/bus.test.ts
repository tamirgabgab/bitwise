import { describe, expect, it } from 'vitest'
import { Simulator } from '../simulator.ts'
import { X, Z, formatSignal, parseSignal } from '../signal.ts'
import { branchWidths } from './bus.ts'

describe('branchWidths', () => {
  it('gives every branch the same width and the last one what is left', () => {
    expect(branchWidths(4, 1)).toEqual([1, 1, 1, 1])
    expect(branchWidths(8, 4)).toEqual([4, 4])
    expect(branchWidths(7, 3)).toEqual([3, 3, 1])
    expect(branchWidths(4, 9)).toEqual([4])
  })
})

describe('splitter', () => {
  it('takes a bus apart, lowest digit on d0', () => {
    const sim = new Simulator()
    const source = sim.addComponent('input', { params: { width: 4 } })
    const split = sim.addComponent('split', { params: { width: 4 } })
    sim.connect({ component: source, port: 'out' }, { component: split, port: 'in' })
    sim.setState(source, parseSignal('1010'))
    sim.settle()
    const read = (port: string): number => sim.readPin({ component: split, port })[0]
    expect([read('d0'), read('d1'), read('d2'), read('d3')]).toEqual([0, 1, 0, 1])
  })

  it('cuts a bus into wider branches', () => {
    const sim = new Simulator(undefined, 16)
    const source = sim.addComponent('input', { params: { width: 5 } })
    const split = sim.addComponent('split', { params: { width: 5, each: 2 } })
    sim.connect({ component: source, port: 'out' }, { component: split, port: 'in' })
    sim.setState(source, parseSignal('ABCDE', 16))
    sim.settle()
    const read = (port: string): string => formatSignal(sim.readPin({ component: split, port }))
    expect([read('d0'), read('d1'), read('d2')]).toEqual(['DE', 'BC', 'A'])
  })

  it('passes a floating bus on as floating', () => {
    const sim = new Simulator()
    const split = sim.addComponent('split', { params: { width: 2 } })
    sim.settle()
    expect(sim.readPin({ component: split, port: 'd1' })).toEqual([Z])
  })
})

describe('merger', () => {
  it('puts wires together into a bus', () => {
    const sim = new Simulator(undefined, 3)
    const merge = sim.addComponent('merge', { params: { width: 3 } })
    const values = [2, 0, 1]
    values.forEach((value, index) => {
      const source = sim.addComponent('const', { params: { value } })
      sim.connect({ component: source, port: 'out' }, { component: merge, port: `d${index}` })
    })
    sim.settle()
    expect(formatSignal(sim.readPin({ component: merge, port: 'out' }))).toBe('102')
  })

  it('keeps what a branch does not know to that branch', () => {
    const sim = new Simulator()
    const merge = sim.addComponent('merge', { params: { width: 4, each: 2 } })
    const low = sim.addComponent('input', { params: { width: 2 } })
    const not = sim.addComponent('not', { params: { width: 2 } })
    sim.connect({ component: low, port: 'out' }, { component: merge, port: 'd0' })
    sim.connect({ component: not, port: 'out' }, { component: merge, port: 'd1' })
    sim.setState(low, parseSignal('01'))
    sim.settle()
    expect(sim.readPin({ component: merge, port: 'out' })).toEqual([1, 0, X, X])
  })
})
