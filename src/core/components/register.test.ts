import { describe, expect, it } from 'vitest'
import { Simulator } from '../simulator.ts'
import type { ComponentId } from '../simulator.ts'
import { formatSignal, parseSignal } from '../signal.ts'

/** A part of the given type with a switch on every input, by port name. */
function bench(type: string, width: number, radix = 2) {
  const sim = new Simulator(undefined, radix)
  const part = sim.addComponent(type, { params: { width } })
  const sources = new Map<string, ComponentId>()
  const drive = (port: string, text: string): void => {
    let source = sources.get(port)
    if (source === undefined) {
      source = sim.addComponent('input', { params: { width: text.length } })
      sim.connect({ component: source, port: 'out' }, { component: part, port })
      sources.set(port, source)
    }
    sim.setState(source, parseSignal(text, radix))
    sim.settle()
  }
  const read = (port: string): string => formatSignal(sim.readPin({ component: part, port }))
  const top = (radix - 1).toString(16).toUpperCase()
  const tick = (): void => {
    drive('clk', '0')
    drive('clk', top)
  }
  drive('clk', '0')
  return { sim, part, drive, read, tick, top }
}

describe('register', () => {
  it('starts at 0 and takes its input on the rising edge', () => {
    const { drive, read, tick } = bench('register', 4)
    expect(read('q')).toBe('0000')
    drive('d', '1011')
    expect(read('q')).toBe('0000')
    tick()
    expect(read('q')).toBe('1011')
    drive('d', '0110')
    expect(read('q')).toBe('1011')
    drive('clk', '0')
    expect(read('q')).toBe('1011')
  })

  it('keeps its value while En is off', () => {
    const { drive, read, tick } = bench('register', 4)
    drive('d', '1111')
    drive('en', '0')
    tick()
    expect(read('q')).toBe('0000')
    drive('en', '1')
    tick()
    expect(read('q')).toBe('1111')
  })

  it('clears at once on Reset, clock or no clock', () => {
    const { drive, read, tick } = bench('register', 4)
    drive('d', '1010')
    tick()
    drive('reset', '1')
    expect(read('q')).toBe('0000')
    tick()
    expect(read('q')).toBe('0000')
    drive('reset', '0')
    tick()
    expect(read('q')).toBe('1010')
  })

  it('holds digits of any radix, and its controls are on only at the top value', () => {
    const { drive, read, tick } = bench('register', 3, 5)
    drive('d', '403')
    drive('en', '2')
    tick()
    expect(read('q')).toBe('000')
    drive('en', '4')
    tick()
    expect(read('q')).toBe('403')
    // The clock is high from the middle of the range up.
    drive('d', '111')
    drive('clk', '0')
    drive('clk', '2')
    expect(read('q')).toBe('403')
    drive('clk', '3')
    expect(read('q')).toBe('111')
  })

  it('stores X for a digit it cannot read', () => {
    const { drive, read, tick } = bench('register', 3)
    drive('d', '1X0')
    tick()
    expect(read('q')).toBe('1X0')
  })

  it('shows what is unsure with En unknown, and loses nothing', () => {
    const { drive, read, tick } = bench('register', 4)
    drive('d', '1100')
    tick()
    drive('d', '1010')
    drive('en', 'X')
    tick()
    expect(read('q')).toBe('1XX0')
    drive('clk', '0')
    expect(read('q')).toBe('1100')
  })

  it('shows what is unsure with Reset unknown, and loses nothing', () => {
    const { drive, read, tick } = bench('register', 4)
    drive('d', '0101')
    tick()
    drive('reset', 'X')
    expect(read('q')).toBe('0X0X')
    drive('reset', '0')
    expect(read('q')).toBe('0101')
  })

  it('does not take a value when the clock comes out of the unknown', () => {
    const { drive, read } = bench('register', 2)
    drive('d', '11')
    drive('clk', 'X')
    drive('clk', '1')
    expect(read('q')).toBe('00')
  })
})

describe('counter', () => {
  it('counts up on every rising edge and wraps around', () => {
    const { read, tick } = bench('counter', 2)
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      tick()
      seen.push(read('q'))
    }
    expect(seen).toEqual(['01', '10', '11', '00', '01'])
  })

  it('counts in the radix: after 2 comes 10 at radix 3', () => {
    const { read, tick } = bench('counter', 2, 3)
    const seen: string[] = []
    for (let i = 0; i < 9; i++) {
      tick()
      seen.push(read('q'))
    }
    expect(seen).toEqual(['01', '02', '10', '11', '12', '20', '21', '22', '00'])
  })

  it('stands still while En is off', () => {
    const { drive, read, tick } = bench('counter', 2)
    tick()
    drive('en', '0')
    tick()
    tick()
    expect(read('q')).toBe('01')
    drive('en', '1')
    tick()
    expect(read('q')).toBe('10')
  })

  it('takes its input when Load is on, whatever En says', () => {
    const { drive, read, tick } = bench('counter', 4)
    drive('d', '1100')
    drive('load', '1')
    drive('en', '0')
    tick()
    expect(read('q')).toBe('1100')
    drive('load', '0')
    drive('en', '1')
    tick()
    expect(read('q')).toBe('1101')
  })

  it('clears at once on Reset', () => {
    const { drive, read, tick } = bench('counter', 2)
    tick()
    tick()
    drive('reset', '1')
    expect(read('q')).toBe('00')
    tick()
    expect(read('q')).toBe('00')
  })

  it('raises its carry at the largest number while En is on', () => {
    const { drive, read, tick } = bench('counter', 2, 3)
    for (let i = 0; i < 8; i++) {
      expect(read('co')).toBe('0')
      tick()
    }
    expect(read('q')).toBe('22')
    expect(read('co')).toBe('2')
    drive('en', '0')
    expect(read('co')).toBe('0')
  })

  it('counts on from one counter to the next through the carry', () => {
    const sim = new Simulator()
    const clock = sim.addComponent('input')
    const low = sim.addComponent('counter', { params: { width: 2 } })
    const high = sim.addComponent('counter', { params: { width: 2 } })
    sim.connect({ component: clock, port: 'out' }, { component: low, port: 'clk' })
    sim.connect({ component: clock, port: 'out' }, { component: high, port: 'clk' })
    sim.connect({ component: low, port: 'co' }, { component: high, port: 'en' })
    const number = (): number =>
      Number.parseInt(
        formatSignal(sim.readPin({ component: high, port: 'q' })) +
          formatSignal(sim.readPin({ component: low, port: 'q' })),
        2,
      )
    sim.setState(clock, [0])
    sim.settle()
    for (let i = 1; i <= 17; i++) {
      sim.setState(clock, [1])
      sim.settle()
      sim.setState(clock, [0])
      sim.settle()
      expect(number()).toBe(i % 16)
    }
  })

  it('is unknown after an edge with Load unknown, and keeps its number', () => {
    const { drive, read, tick } = bench('counter', 2)
    tick()
    drive('load', 'X')
    tick()
    expect(read('q')).toBe('XX')
    expect(read('co')).toBe('X')
    drive('load', '0')
    expect(read('q')).toBe('01')
  })
})
