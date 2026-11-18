import { describe, expect, it } from 'vitest'
import { X, Z, digitChar } from '../signal.ts'
import { Simulator } from '../simulator.ts'
import type { ComponentId } from '../simulator.ts'
import { numberValue } from './output.ts'
import { clockLevel } from './sequential.ts'

/** A part with a switch on each of the named inputs. */
function bench(type: string, wired: readonly string[], radix = 2) {
  const sim = new Simulator(undefined, radix)
  const part = sim.addComponent(type)
  const switches: Record<string, ComponentId> = {}
  for (const port of wired) {
    switches[port] = sim.addComponent('input')
    sim.connect({ component: switches[port], port: 'out' }, { component: part, port })
  }
  sim.settle()
  const set = (values: Readonly<Record<string, number>>): void => {
    for (const [port, digit] of Object.entries(values)) sim.setState(switches[port], [digit])
    sim.settle()
  }
  const read = (port: string): string => digitChar(sim.readPin({ component: part, port })[0])
  return {
    sim,
    switches,
    set,
    /** One full clock pulse: low, high, low. */
    pulse(): void {
      set({ clk: radix - 1 })
      set({ clk: 0 })
    },
    q: () => read('q'),
    nq: () => read('nq'),
  }
}

describe('clock', () => {
  /** What the clock puts out at each of the next `ticks` ticks. */
  function trace(sim: Simulator, clock: ComponentId, ticks: number): string {
    let text = ''
    for (let i = 0; i < ticks; i++) {
      sim.step()
      text += digitChar(sim.readPin({ component: clock, port: 'out' })[0])
    }
    return text
  }

  it('alternates between 0 and 1, each for half a period', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock', { params: { half: 3 } })
    expect(trace(sim, clock, 14)).toBe('00011100011100')
  })

  it('alternates between 0 and the top value at a larger radix', () => {
    const sim = new Simulator(undefined, 3)
    const clock = sim.addComponent('clock', { params: { half: 2 } })
    expect(trace(sim, clock, 8)).toBe('00220022')
  })

  it('keeps the circuit going, so it never settles', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock')
    expect(sim.pendingWakes).toBe(1)
    expect(sim.settle(200)).toBe(false)
    expect(sim.time).toBe(200)
    sim.removeComponent(clock)
    expect(sim.pendingWakes).toBe(0)
    expect(sim.settle(200)).toBe(true)
  })

  it('keeps its rhythm when the circuit around it is edited', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock', { params: { half: 3 } })
    sim.run(4)
    const gate = sim.addComponent('not')
    sim.connect({ component: clock, port: 'out' }, { component: gate, port: 'in' })
    sim.setDelay(clock, 1)
    expect(sim.pendingWakes).toBe(1)
    expect(trace(sim, clock, 10)).toBe('1100011100')
  })

  it('starts over with the circuit', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock', { params: { half: 3 } })
    sim.run(5)
    sim.restart()
    expect(sim.pendingWakes).toBe(1)
    expect(trace(sim, clock, 8)).toBe('00011100')
  })

  it('gives 0 and lets the circuit settle while it is off', () => {
    const sim = new Simulator(undefined, 3)
    const clock = sim.addComponent('clock', { params: { half: 2, on: 0 } })
    expect(sim.settle(200)).toBe(true)
    expect(sim.pendingWakes).toBe(0)
    expect(trace(sim, clock, 8)).toBe('00000000')
  })
})

describe('clockLevel', () => {
  it('is high in the upper half of the digits', () => {
    expect([0, 1].map((d) => clockLevel(d, 2))).toEqual(['low', 'high'])
    expect([0, 1, 2].map((d) => clockLevel(d, 3))).toEqual(['low', 'low', 'high'])
    expect([0, 1, 2, 3].map((d) => clockLevel(d, 4))).toEqual(['low', 'low', 'high', 'high'])
  })

  it('is unknown for X, Z and a digit the radix has no room for', () => {
    expect([X, Z, 5].map((d) => clockLevel(d, 3))).toEqual(['unknown', 'unknown', 'unknown'])
  })
})

describe('SR latch', () => {
  it('starts at 0 and remembers what it was last told', () => {
    const latch = bench('sr', ['s', 'r'])
    expect([latch.q(), latch.nq()]).toEqual(['0', '1'])
    latch.set({ s: 1 })
    expect([latch.q(), latch.nq()]).toEqual(['1', '0'])
    latch.set({ s: 0 })
    expect(latch.q()).toBe('1')
    latch.set({ r: 1 })
    latch.set({ r: 0 })
    expect(latch.q()).toBe('0')
  })

  it('is unknown when set and reset at once', () => {
    const latch = bench('sr', ['s', 'r'])
    latch.set({ s: 1, r: 1 })
    expect([latch.q(), latch.nq()]).toEqual(['X', 'X'])
    latch.set({ s: 0 })
    expect(latch.q()).toBe('0')
  })

  it('acts only on the top value at a larger radix', () => {
    const latch = bench('sr', ['s', 'r'], 3)
    latch.set({ s: 1 })
    expect(latch.q()).toBe('0')
    latch.set({ s: 2 })
    expect([latch.q(), latch.nq()]).toEqual(['2', '0'])
  })

  it('is unknown while an unattached input could change it', () => {
    const latch = bench('sr', ['s'])
    // R floats: at 0 either way, but setting it could also be the forbidden pair.
    expect(latch.q()).toBe('0')
    latch.set({ s: 1 })
    expect(latch.q()).toBe('X')
  })
})

describe('D flip-flop', () => {
  it('takes D on the rising edge only', () => {
    const ff = bench('dff', ['d', 'clk'])
    expect([ff.q(), ff.nq()]).toEqual(['0', '1'])
    ff.set({ d: 1 })
    expect(ff.q()).toBe('0')
    ff.set({ clk: 1 })
    expect([ff.q(), ff.nq()]).toEqual(['1', '0'])
    ff.set({ d: 0 })
    expect(ff.q()).toBe('1')
    ff.set({ clk: 0 })
    expect(ff.q()).toBe('1')
    ff.set({ clk: 1 })
    expect(ff.q()).toBe('0')
  })

  it('stores any digit of the radix', () => {
    const ff = bench('dff', ['d', 'clk'], 3)
    ff.set({ d: 1 })
    ff.pulse()
    expect([ff.q(), ff.nq()]).toEqual(['1', '1'])
    ff.set({ d: 2 })
    ff.pulse()
    expect([ff.q(), ff.nq()]).toEqual(['2', '0'])
  })

  it('sees an edge only when the clock crosses the middle', () => {
    const ff = bench('dff', ['d', 'clk'], 4)
    ff.set({ d: 3 })
    ff.set({ clk: 1 })
    expect(ff.q()).toBe('0')
    ff.set({ clk: 2 })
    expect(ff.q()).toBe('3')
    ff.set({ d: 1 })
    ff.set({ clk: 3 })
    expect(ff.q()).toBe('3')
  })

  it('becomes unknown when it clocks in a floating D', () => {
    const ff = bench('dff', ['clk'])
    ff.pulse()
    expect(ff.q()).toBe('X')
  })

  it('sets and resets at once, without a clock', () => {
    const ff = bench('dff', ['d', 'clk', 'set', 'reset'], 3)
    ff.set({ set: 2 })
    expect(ff.q()).toBe('2')
    ff.set({ set: 0 })
    expect(ff.q()).toBe('2')
    ff.set({ reset: 1 })
    expect(ff.q()).toBe('2')
    ff.set({ reset: 2 })
    expect(ff.q()).toBe('0')
    ff.set({ set: 2 })
    expect(ff.q()).toBe('X')
  })

  it('keeps what it stores while Set is unknown for a moment', () => {
    const ff = bench('dff', ['d', 'clk', 'set'])
    ff.sim.setState(ff.switches.set, [5])
    ff.sim.settle()
    expect(ff.q()).toBe('X')
    ff.set({ set: 0 })
    expect(ff.q()).toBe('0')
  })

  it('holds reset against the clock', () => {
    const ff = bench('dff', ['d', 'clk', 'reset'])
    ff.set({ d: 1, reset: 1 })
    ff.pulse()
    expect(ff.q()).toBe('0')
  })

  it('goes back to 0 when the circuit restarts', () => {
    const ff = bench('dff', ['d', 'clk'])
    ff.set({ d: 1 })
    ff.pulse()
    expect(ff.q()).toBe('1')
    ff.sim.restart()
    ff.sim.settle()
    expect(ff.q()).toBe('0')
  })
})

describe('T flip-flop', () => {
  it('toggles at radix 2 while T is 1', () => {
    const ff = bench('tff', ['t', 'clk'])
    ff.pulse()
    expect(ff.q()).toBe('0')
    ff.set({ t: 1 })
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      ff.pulse()
      seen.push(ff.q())
    }
    expect(seen).toEqual(['1', '0', '1', '0'])
  })

  it('adds T modulo the radix', () => {
    const ff = bench('tff', ['t', 'clk'], 5)
    ff.set({ t: 2 })
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      ff.pulse()
      seen.push(ff.q())
    }
    expect(seen).toEqual(['2', '4', '1', '3', '0'])
  })
})

describe('JK flip-flop', () => {
  it('holds, sets, clears and toggles at radix 2', () => {
    const ff = bench('jkff', ['j', 'k', 'clk'])
    ff.pulse()
    expect(ff.q()).toBe('0')
    ff.set({ j: 1 })
    ff.pulse()
    expect(ff.q()).toBe('1')
    ff.set({ j: 0, k: 1 })
    ff.pulse()
    expect(ff.q()).toBe('0')
    ff.set({ j: 1 })
    ff.pulse()
    expect(ff.q()).toBe('1')
    ff.pulse()
    expect(ff.q()).toBe('0')
  })

  it('counts up with J and K at the top value, at any radix', () => {
    const ff = bench('jkff', ['j', 'k', 'clk'], 3)
    ff.set({ j: 2, k: 2 })
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      ff.pulse()
      seen.push(ff.q())
    }
    expect(seen).toEqual(['1', '2', '0', '1'])
    ff.set({ j: 1, k: 1 })
    ff.pulse()
    expect(ff.q()).toBe('1')
    ff.set({ j: 2, k: 0 })
    ff.pulse()
    expect(ff.q()).toBe('2')
  })

  it('is unknown when a floating input could change the result', () => {
    const ff = bench('jkff', ['k', 'clk'])
    // J floats. With K off, Q either stays 0 or becomes 1.
    ff.pulse()
    expect(ff.q()).toBe('X')
  })
})

describe('a ripple counter from JK flip-flops', () => {
  it('counts the edges of a clock', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('clock', { params: { half: 5 } })
    const one = sim.addComponent('const')
    const stages = [0, 1, 2].map(() => sim.addComponent('jkff'))
    stages.forEach((stage, index) => {
      sim.connect({ component: one, port: 'out' }, { component: stage, port: 'j' })
      sim.connect({ component: one, port: 'out' }, { component: stage, port: 'k' })
      const source =
        index === 0
          ? { component: clock, port: 'out' }
          : { component: stages[index - 1], port: 'nq' }
      sim.connect(source, { component: stage, port: 'clk' })
    })
    const count = (): number | undefined =>
      numberValue(
        stages.map((stage) => sim.readPin({ component: stage, port: 'q' })[0]),
        2,
      )
    sim.run(5)
    expect(count()).toBe(0)
    const seen: (number | undefined)[] = []
    for (let i = 0; i < 9; i++) {
      sim.run(10)
      seen.push(count())
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1])
  })
})

describe('number display', () => {
  it('reads its digits as one number in the radix', () => {
    expect(numberValue([1, 1, 0, 1], 2)).toBe(11)
    expect(numberValue([1, 0, 2], 3)).toBe(19)
    expect(numberValue([], 2)).toBe(0)
  })

  it('has no number when a digit is unknown or does not fit', () => {
    expect(numberValue([1, X], 2)).toBeUndefined()
    expect(numberValue([Z], 2)).toBeUndefined()
    expect(numberValue([2], 2)).toBeUndefined()
  })

  it('has one input per digit and drives nothing', () => {
    const sim = new Simulator()
    const display = sim.addComponent('display', { params: { digits: 3 } })
    expect(sim.getComponent(display).ports.map((port) => port.name)).toEqual(['in0', 'in1', 'in2'])
  })
})

describe('cycle', () => {
  function watch(radix: number, ticks: number, steps: number): number[] {
    const sim = new Simulator(undefined, radix)
    const cycle = sim.addComponent('cycle', { params: { ticks } })
    const seen: number[] = []
    for (let i = 0; i < steps; i++) {
      sim.run(ticks)
      seen.push(sim.readPin({ component: cycle, port: 'out' })[0])
    }
    return seen
  }

  it('walks through every value and starts again', () => {
    expect(watch(3, 4, 7)).toEqual([0, 1, 2, 0, 1, 2, 0])
    expect(watch(5, 1, 6)).toEqual([0, 1, 2, 3, 4, 0])
  })

  it('is a slow clock at radix 2', () => {
    expect(watch(2, 10, 5)).toEqual([0, 1, 0, 1, 0])
  })

  it('stays on each value for as many ticks as it is told', () => {
    const sim = new Simulator(undefined, 3)
    const cycle = sim.addComponent('cycle', { params: { ticks: 3 } })
    const seen: number[] = []
    for (let i = 0; i < 10; i++) {
      sim.run(1)
      seen.push(sim.readPin({ component: cycle, port: 'out' })[0])
    }
    // The first value takes effect after the delay of one tick.
    expect(seen).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 0])
  })

  it('walks two switches through every combination when one is radix times slower', () => {
    const sim = new Simulator(undefined, 3)
    const fast = sim.addComponent('cycle', { params: { ticks: 2 } })
    const slow = sim.addComponent('cycle', { params: { ticks: 6 } })
    const seen = new Set<string>()
    for (let i = 0; i < 9; i++) {
      sim.run(2)
      const low = sim.readPin({ component: fast, port: 'out' })[0]
      const high = sim.readPin({ component: slow, port: 'out' })[0]
      seen.add(`${high}${low}`)
    }
    expect([...seen]).toEqual(['00', '01', '02', '10', '11', '12', '20', '21', '22'])
  })

  it('starts over at 0 when the circuit restarts', () => {
    const sim = new Simulator(undefined, 4)
    const cycle = sim.addComponent('cycle', { params: { ticks: 2 } })
    sim.run(5)
    expect(sim.readPin({ component: cycle, port: 'out' })[0]).toBe(2)
    sim.restart()
    sim.run(1)
    expect(sim.readPin({ component: cycle, port: 'out' })[0]).toBe(0)
  })
})

describe('the value a part keeps', () => {
  it('is Q for latches, flip-flops, registers and counters, and nothing for other parts', () => {
    const sim = new Simulator()
    for (const type of ['sr', 'dff', 'tff', 'jkff']) {
      expect(sim.getStored(sim.addComponent(type))).toEqual([0])
    }
    expect(sim.getStored(sim.addComponent('register', { params: { width: 3 } }))).toEqual([0, 0, 0])
    expect(sim.getStored(sim.addComponent('counter', { params: { width: 2 } }))).toEqual([0, 0])
    expect(sim.getStored(sim.addComponent('and'))).toBeUndefined()
  })
})
