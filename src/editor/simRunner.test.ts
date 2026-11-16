import { describe, expect, it } from 'vitest'
import { Simulator, formatSignal } from '../core/index.ts'
import { SimRunner } from './simRunner.ts'

/** An input into a chain of `length` inverters, each one tick slow. */
function chain(length: number) {
  const sim = new Simulator()
  const input = sim.addComponent('input')
  let previous = { component: input, port: 'out' }
  const gates: number[] = []
  for (let i = 0; i < length; i++) {
    const gate = sim.addComponent('not')
    sim.connect(previous, { component: gate, port: 'in' })
    previous = { component: gate, port: 'out' }
    gates.push(gate)
  }
  const read = (gate: number) => formatSignal(sim.readPin({ component: gate, port: 'out' }))
  return { sim, input, gates, read }
}

describe('SimRunner', () => {
  it('turns seconds into ticks at the chosen speed', () => {
    const { sim } = chain(50)
    const runner = new SimRunner(sim)
    expect(runner.advance(0.1, 100)).toBe(true)
    expect(sim.time).toBe(10)
  })

  it('carries a fraction of a tick over to the next frame', () => {
    const { sim } = chain(50)
    const runner = new SimRunner(sim)
    // 0.016 s at 100 ticks/s is 1.6 ticks a frame.
    expect(runner.advance(0.016, 100)).toBe(true)
    expect(sim.time).toBe(1)
    expect(runner.advance(0.016, 100)).toBe(true)
    expect(sim.time).toBe(3)
  })

  it('waits when less than one tick has gone by', () => {
    const { sim } = chain(5)
    const runner = new SimRunner(sim)
    expect(runner.advance(0.4, 1)).toBe(false)
    expect(sim.time).toBe(0)
    expect(runner.advance(0.7, 1)).toBe(true)
    expect(sim.time).toBe(1)
  })

  it('does not move time while the circuit is at rest', () => {
    const { sim } = chain(3)
    const runner = new SimRunner(sim)
    sim.settle()
    const time = sim.time
    expect(runner.advance(5, 100)).toBe(false)
    expect(sim.time).toBe(time)
  })

  it('does not save up time spent at rest', () => {
    const { sim, input } = chain(20)
    const runner = new SimRunner(sim)
    sim.settle()
    runner.advance(0.009, 100)
    const time = sim.time
    sim.setState(input, [1])
    // Without the reset, the 0.9 ticks left over would make this 1 tick.
    expect(runner.advance(0.005, 100)).toBe(false)
    expect(sim.time).toBe(time)
  })

  it('settles the whole circuit in one go at full speed', () => {
    const { sim, gates, read } = chain(30)
    const runner = new SimRunner(sim)
    expect(runner.advance(0.016, 'max')).toBe(true)
    expect(sim.pendingEvents).toBe(0)
    expect(read(gates[29])).toBe('0')
    // Time stops at the last change instead of running on.
    expect(sim.time).toBe(31)
  })

  it('cannot be stalled by a circuit that never settles', () => {
    // A NAND fed its own output: steady while the switch is 0, and an
    // oscillator once it is 1.
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const nand = sim.addComponent('nand')
    sim.connect({ component: input, port: 'out' }, { component: nand, port: 'in0' })
    sim.connect({ component: nand, port: 'out' }, { component: nand, port: 'in1' })
    sim.settle()
    sim.setState(input, [1])
    const start = sim.time
    const runner = new SimRunner(sim)
    expect(runner.advance(0.016, 'max')).toBe(true)
    expect(sim.time).toBe(start + 2000)
    expect(runner.advance(1000, 100)).toBe(true)
    expect(sim.time).toBe(start + 4000)
    expect(sim.pendingEvents).toBeGreaterThan(0)
  })

  it('steps one tick at a time', () => {
    const { sim, gates, read } = chain(3)
    const runner = new SimRunner(sim)
    runner.step()
    expect(sim.time).toBe(1)
    expect(read(gates[0])).toBe('X')
    runner.step()
    expect(read(gates[0])).toBe('1')
    expect(read(gates[1])).toBe('X')
  })
})
