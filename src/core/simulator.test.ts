import { describe, expect, it } from 'vitest'
import { formatSignal, parseSignal } from './signal.ts'
import { Simulator } from './simulator.ts'
import type { ComponentId, PinRef } from './simulator.ts'

const pin = (component: ComponentId, port: string): PinRef => ({ component, port })

/** The value at a pin as text. Defaults to the port named out. */
function read(sim: Simulator, component: ComponentId, port = 'out'): string {
  return formatSignal(sim.readPin(pin(component, port)))
}

/** Sets an input source, with the value given as text. */
function set(sim: Simulator, input: ComponentId, text: string): void {
  sim.setState(input, parseSignal(text))
}

describe('propagation and delay', () => {
  it('shows an output as unknown until its first evaluation takes effect', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    expect(read(sim, input)).toBe('X')
    sim.step()
    expect(read(sim, input)).toBe('0')
  })

  it('moves a change one gate further every tick', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const first = sim.addComponent('not')
    const second = sim.addComponent('not')
    sim.connect(pin(input, 'out'), pin(first, 'in'))
    sim.connect(pin(first, 'out'), pin(second, 'in'))
    expect(sim.settle()).toBe(true)
    expect([read(sim, first), read(sim, second)]).toEqual(['1', '0'])

    set(sim, input, '1')
    sim.step()
    expect([read(sim, input), read(sim, first), read(sim, second)]).toEqual(['1', '1', '0'])
    sim.step()
    expect([read(sim, first), read(sim, second)]).toEqual(['0', '0'])
    sim.step()
    expect([read(sim, first), read(sim, second)]).toEqual(['0', '1'])
    expect(sim.pendingEvents).toBe(0)
  })

  it('honours a per-component delay', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const slow = sim.addComponent('not', { delay: 5 })
    sim.connect(pin(input, 'out'), pin(slow, 'in'))
    sim.settle()
    expect(read(sim, slow)).toBe('1')

    const start = sim.time
    set(sim, input, '1')
    sim.run(5) // 1 tick for the input, then 4 of the gate's 5
    expect(read(sim, slow)).toBe('1')
    sim.step()
    expect(read(sim, slow)).toBe('0')
    expect(sim.time).toBe(start + 6)
  })

  it('advances time even when nothing is scheduled', () => {
    const sim = new Simulator()
    sim.run(10)
    expect(sim.time).toBe(10)
  })

  it('rejects a delay below 1', () => {
    const sim = new Simulator()
    expect(() => sim.addComponent('not', { delay: 0 })).toThrow()
    const gate = sim.addComponent('not')
    expect(() => sim.setDelay(gate, 1.5)).toThrow()
  })

  it('ignores a slow change that a newer, faster one has overtaken', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const buffer = sim.addComponent('buffer', { delay: 5 })
    sim.connect(pin(input, 'out'), pin(buffer, 'in'))
    sim.settle()

    set(sim, input, '1') // the buffer will output 1, five ticks after it sees it
    sim.run(2)
    sim.setDelay(buffer, 1)
    set(sim, input, '0') // this 0 reaches the output before that 1 does
    expect(sim.settle()).toBe(true)
    expect(read(sim, buffer)).toBe('0')
  })
})

describe('floating inputs', () => {
  it('reads an unattached input as floating and gives an unknown output', () => {
    const sim = new Simulator()
    const gate = sim.addComponent('not')
    sim.settle()
    expect(read(sim, gate, 'in')).toBe('Z')
    expect(read(sim, gate)).toBe('X')
  })

  it('still decides the output when the connected inputs are enough', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const and = sim.addComponent('and')
    const or = sim.addComponent('or')
    sim.connect(pin(input, 'out'), pin(and, 'in0'))
    sim.connect(pin(input, 'out'), pin(or, 'in0'))
    sim.settle()
    expect(read(sim, and)).toBe('0') // 0 AND floating is 0
    expect(read(sim, or)).toBe('X') // 0 OR floating is unknown

    set(sim, input, '1')
    sim.settle()
    expect(read(sim, and)).toBe('X')
    expect(read(sim, or)).toBe('1')
  })
})

describe('SR latch built from two NOR gates', () => {
  function buildLatch() {
    const sim = new Simulator()
    const s = sim.addComponent('input')
    const r = sim.addComponent('input')
    const q = sim.addComponent('nor') // Q = NOR(R, Q')
    const qBar = sim.addComponent('nor') // Q' = NOR(S, Q)
    sim.connect(pin(r, 'out'), pin(q, 'in0'))
    sim.connect(pin(qBar, 'out'), pin(q, 'in1'))
    sim.connect(pin(s, 'out'), pin(qBar, 'in0'))
    sim.connect(pin(q, 'out'), pin(qBar, 'in1'))
    const outputs = () => [read(sim, q), read(sim, qBar)]
    return { sim, s, r, outputs }
  }

  it('is unknown until it is first set or reset', () => {
    const { sim, outputs } = buildLatch()
    expect(sim.settle()).toBe(true)
    expect(outputs()).toEqual(['X', 'X'])
  })

  it('sets, holds, resets and holds again', () => {
    const { sim, s, r, outputs } = buildLatch()
    sim.settle()

    set(sim, s, '1')
    expect(sim.settle()).toBe(true)
    expect(outputs()).toEqual(['1', '0'])

    set(sim, s, '0')
    expect(sim.settle()).toBe(true)
    expect(outputs()).toEqual(['1', '0'])

    set(sim, r, '1')
    expect(sim.settle()).toBe(true)
    expect(outputs()).toEqual(['0', '1'])

    set(sim, r, '0')
    expect(sim.settle()).toBe(true)
    expect(outputs()).toEqual(['0', '1'])
  })

  it('oscillates when S and R are released in the same tick', () => {
    const { sim, s, r, outputs } = buildLatch()
    set(sim, s, '1')
    set(sim, r, '1')
    sim.settle()
    expect(outputs()).toEqual(['0', '0'])

    // With equal gate delays neither side can win the race.
    set(sim, s, '0')
    set(sim, r, '0')
    expect(sim.settle(200)).toBe(false)
  })
})

describe('oscillation', () => {
  it('leaves a bare ring of inverters unknown and stable', () => {
    const sim = new Simulator()
    const a = sim.addComponent('not')
    const b = sim.addComponent('not')
    const c = sim.addComponent('not')
    sim.connect(pin(a, 'out'), pin(b, 'in'))
    sim.connect(pin(b, 'out'), pin(c, 'in'))
    sim.connect(pin(c, 'out'), pin(a, 'in'))
    // Nothing ever forces a known value into the loop.
    expect(sim.settle()).toBe(true)
    expect(read(sim, a)).toBe('X')
  })

  function buildRingOscillator() {
    const sim = new Simulator()
    const enable = sim.addComponent('input')
    const nand = sim.addComponent('nand')
    const a = sim.addComponent('not')
    const b = sim.addComponent('not')
    sim.connect(pin(enable, 'out'), pin(nand, 'in0'))
    sim.connect(pin(nand, 'out'), pin(a, 'in'))
    sim.connect(pin(a, 'out'), pin(b, 'in'))
    sim.connect(pin(b, 'out'), pin(nand, 'in1'))
    return { sim, enable, output: b }
  }

  it('holds a ring oscillator still while it is disabled', () => {
    const { sim, output } = buildRingOscillator()
    expect(sim.settle()).toBe(true)
    expect(read(sim, output)).toBe('1')
  })

  it('stops a running ring oscillator at the tick limit instead of hanging', () => {
    const { sim, enable } = buildRingOscillator()
    sim.settle()
    const start = sim.time
    set(sim, enable, '1')
    expect(sim.settle(1000)).toBe(false)
    expect(sim.time).toBe(start + 1000)
    expect(sim.pendingEvents).toBeGreaterThan(0)
  })

  it('oscillates with a period of twice the loop delay', () => {
    const { sim, enable, output } = buildRingOscillator()
    sim.settle()
    set(sim, enable, '1')
    sim.run(20)

    const samples: string[] = []
    for (let i = 0; i < 12; i++) {
      samples.push(read(sim, output))
      sim.step()
    }
    // Three gates of delay 1: half a period is 3 ticks, a full period 6.
    for (let i = 0; i < 6; i++) {
      expect(samples[i]).not.toBe('X')
      expect(samples[i + 3]).not.toBe(samples[i])
      expect(samples[i + 6]).toBe(samples[i])
    }
  })
})

describe('several drivers on one net', () => {
  function twoDrivers() {
    const sim = new Simulator()
    const a = sim.addComponent('input')
    const b = sim.addComponent('input')
    const net = sim.connect(pin(a, 'out'), pin(b, 'out'))
    sim.settle()
    return { sim, a, b, net }
  }

  it('accepts drivers that agree', () => {
    const { sim, net } = twoDrivers()
    expect(formatSignal(sim.getNet(net).value)).toBe('0')
    expect(sim.getNet(net).conflict).toBe(false)
  })

  it('flags a conflict and reads X when they disagree', () => {
    const { sim, a, net } = twoDrivers()
    set(sim, a, '1')
    sim.settle()
    expect(formatSignal(sim.getNet(net).value)).toBe('X')
    expect(sim.getNet(net).conflict).toBe(true)
  })

  it('clears the conflict once they agree again', () => {
    const { sim, a, b, net } = twoDrivers()
    set(sim, a, '1')
    sim.settle()
    set(sim, b, '1')
    sim.settle()
    expect(formatSignal(sim.getNet(net).value)).toBe('1')
    expect(sim.getNet(net).conflict).toBe(false)
  })
})

describe('buses', () => {
  it('carries a multi-bit value through a gate', () => {
    const sim = new Simulator()
    const a = sim.addComponent('input', { params: { width: 4 } })
    const b = sim.addComponent('input', { params: { width: 4 } })
    const and = sim.addComponent('and', { params: { width: 4 } })
    const netA = sim.connect(pin(a, 'out'), pin(and, 'in0'))
    sim.connect(pin(b, 'out'), pin(and, 'in1'))
    set(sim, a, '1100')
    set(sim, b, '1010')
    sim.settle()
    expect(sim.getNet(netA).width).toBe(4)
    expect(read(sim, and)).toBe('1000')
  })

  it('refuses to connect pins of different widths', () => {
    const sim = new Simulator()
    const wide = sim.addComponent('input', { params: { width: 4 } })
    const gate = sim.addComponent('not')
    expect(() => sim.connect(pin(wide, 'out'), pin(gate, 'in'))).toThrow()
    expect(sim.netIds()).toEqual([])
  })

  it('refuses to attach a pin to a net of another width', () => {
    const sim = new Simulator()
    const gate = sim.addComponent('not')
    const net = sim.addNet(8)
    expect(() => sim.attach(pin(gate, 'in'), net)).toThrow()
  })

  it('refuses an input value of the wrong width and keeps the old one', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    set(sim, input, '1')
    sim.settle()
    expect(() => set(sim, input, '10')).toThrow()
    expect(sim.settle()).toBe(true)
    expect(read(sim, input)).toBe('1')
  })
})

describe('editing a circuit while it runs', () => {
  function inverter() {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const gate = sim.addComponent('not')
    const net = sim.connect(pin(input, 'out'), pin(gate, 'in'))
    sim.settle()
    return { sim, input, gate, net }
  }

  it('reports which net a pin is on', () => {
    const { sim, input, gate, net } = inverter()
    expect(sim.netOf(pin(gate, 'in'))).toBe(net)
    expect(sim.netOf(pin(gate, 'out'))).toBeUndefined()
    expect(sim.getNet(net).pins).toEqual([pin(input, 'out'), pin(gate, 'in')])
  })

  it('makes an input float again when it is detached', () => {
    const { sim, gate } = inverter()
    expect(read(sim, gate)).toBe('1')
    sim.detach(pin(gate, 'in'))
    sim.settle()
    expect(read(sim, gate)).toBe('X')
  })

  it('lets a net float when its only driver is removed', () => {
    const { sim, input, gate, net } = inverter()
    sim.removeComponent(input)
    sim.settle()
    expect(formatSignal(sim.getNet(net).value)).toBe('Z')
    expect(read(sim, gate)).toBe('X')
    expect(sim.componentIds()).toEqual([gate])
  })

  it('drops changes still queued for a removed component', () => {
    const { sim, input, gate } = inverter()
    set(sim, input, '1')
    sim.removeComponent(input)
    expect(sim.settle()).toBe(true)
    expect(read(sim, gate)).toBe('X')
  })

  it('leaves every pin unattached when a net is removed', () => {
    const { sim, input, gate, net } = inverter()
    sim.removeNet(net)
    sim.settle()
    expect(sim.netOf(pin(input, 'out'))).toBeUndefined()
    expect(sim.netOf(pin(gate, 'in'))).toBeUndefined()
    expect(read(sim, gate)).toBe('X')
  })

  it('refuses to attach a pin that is already on a net', () => {
    const { sim, gate } = inverter()
    expect(() => sim.attach(pin(gate, 'in'), sim.addNet())).toThrow()
  })

  it('merges two nets when pins from both are connected', () => {
    const sim = new Simulator()
    const source = sim.addComponent('input')
    const a = sim.addComponent('not')
    const b = sim.addComponent('not')
    const c = sim.addComponent('not')
    const driven = sim.connect(pin(source, 'out'), pin(a, 'in'))
    sim.connect(pin(b, 'in'), pin(c, 'in')) // a second net with no driver
    sim.settle()
    expect([read(sim, a), read(sim, b), read(sim, c)]).toEqual(['1', 'X', 'X'])

    const merged = sim.connect(pin(a, 'in'), pin(b, 'in'))
    sim.settle()
    expect(merged).toBe(driven)
    expect(sim.netIds()).toEqual([driven])
    expect(sim.getNet(driven).pins).toHaveLength(4)
    expect([read(sim, a), read(sim, b), read(sim, c)]).toEqual(['1', '1', '1'])
  })

  it('does nothing when two pins already share a net', () => {
    const { sim, input, gate, net } = inverter()
    expect(sim.connect(pin(input, 'out'), pin(gate, 'in'))).toBe(net)
    expect(sim.netIds()).toEqual([net])
  })
})

describe('batched edits', () => {
  it('moves a pin between nets without it ever reading as floating', () => {
    const sim = new Simulator()
    const a = sim.addComponent('input')
    const b = sim.addComponent('input')
    const gate = sim.addComponent('buffer')
    sim.connect(pin(a, 'out'), pin(gate, 'in'))
    const other = sim.addNet()
    sim.attach(pin(b, 'out'), other)
    sim.settle()
    expect(read(sim, gate)).toBe('0')

    // Both nets carry 0, so the buffer's output must not change at all.
    sim.batch(() => {
      sim.detach(pin(gate, 'in'))
      sim.attach(pin(gate, 'in'), other)
    })
    expect(sim.pendingEvents).toBe(0)
    expect(read(sim, gate)).toBe('0')
  })

  it('evaluates against the final circuit when the edits change a value', () => {
    const sim = new Simulator()
    const a = sim.addComponent('input')
    const b = sim.addComponent('input')
    const gate = sim.addComponent('buffer')
    sim.connect(pin(a, 'out'), pin(gate, 'in'))
    const other = sim.addNet()
    sim.attach(pin(b, 'out'), other)
    set(sim, b, '1')
    sim.settle()

    sim.batch(() => {
      sim.detach(pin(gate, 'in'))
      sim.attach(pin(gate, 'in'), other)
    })
    sim.step()
    expect(read(sim, gate)).toBe('1')
    expect(sim.pendingEvents).toBe(0)
  })

  it('copes with a component that is added and removed in one batch', () => {
    const sim = new Simulator()
    sim.batch(() => {
      const gate = sim.addComponent('not')
      sim.removeComponent(gate)
    })
    expect(sim.componentIds()).toEqual([])
    expect(sim.settle()).toBe(true)
  })

  it('still applies the edits when the callback throws', () => {
    const sim = new Simulator()
    const input = sim.addComponent('input')
    const gate = sim.addComponent('not')
    sim.settle()
    expect(() =>
      sim.batch(() => {
        sim.connect(pin(input, 'out'), pin(gate, 'in'))
        throw new Error('stop')
      }),
    ).toThrow('stop')
    sim.settle()
    expect(read(sim, gate)).toBe('1')
  })
})

describe('errors and lookups', () => {
  it('rejects unknown types, components, nets and ports', () => {
    const sim = new Simulator()
    const gate = sim.addComponent('not')
    expect(() => sim.addComponent('flux-capacitor')).toThrow()
    expect(() => sim.readPin(pin(999, 'out'))).toThrow()
    expect(() => sim.readPin(pin(gate, 'nope'))).toThrow()
    expect(() => sim.getNet(999)).toThrow()
  })

  it('rejects invalid parameters', () => {
    const sim = new Simulator()
    expect(() => sim.addComponent('and', { params: { inputs: 9 } })).toThrow()
    expect(sim.componentIds()).toEqual([])
  })

  it('describes a component', () => {
    const sim = new Simulator()
    const gate = sim.addComponent('nand', { params: { inputs: 3 }, delay: 2 })
    const info = sim.getComponent(gate)
    expect(info.type).toBe('nand')
    expect(info.params).toEqual({ inputs: 3, width: 1 })
    expect(info.delay).toBe(2)
    expect(info.ports.map((port) => port.name)).toEqual(['in0', 'in1', 'in2', 'out'])
  })
})
