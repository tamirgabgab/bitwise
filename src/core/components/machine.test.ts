import { describe, expect, it } from 'vitest'
import { Simulator } from '../simulator.ts'
import type { ComponentId } from '../simulator.ts'
import { X, formatSignal, parseSignal } from '../signal.ts'
import { ANY, nextState, ruleFrom, ruleTo, ruleWhen, stateOutput } from './machine.ts'

/** The parameters of a machine: rules as [from, to, ...conditions], and each state's outputs. */
function machine(inputs: number, rules: readonly (readonly number[])[], outputs: readonly (readonly number[])[]) {
  const params: Record<string, number> = {
    states: outputs.length,
    inputs,
    outputs: outputs[0].length,
    rules: rules.length,
  }
  rules.forEach(([from, to, ...when], rule) => {
    params[ruleFrom(rule)] = from
    params[ruleTo(rule)] = to
    when.forEach((digit, input) => {
      params[ruleWhen(rule, input)] = digit
    })
  })
  outputs.forEach((digits, state) =>
    digits.forEach((digit, output) => {
      params[stateOutput(state, output)] = digit
    }),
  )
  return params
}

/** Counts presses of `go` to three: the output is on in the third state. */
const counter = machine(
  1,
  [
    [0, 1, 1],
    [1, 2, 1],
    [2, 0, 1],
  ],
  [[0], [0], [1]],
)

function bench(params: Record<string, number>, radix = 2) {
  const sim = new Simulator(undefined, radix)
  const part = sim.addComponent('fsm', { params })
  const sources = new Map<string, ComponentId>()
  const drive = (port: string, text: string): void => {
    let source = sources.get(port)
    if (source === undefined) {
      source = sim.addComponent('input', {})
      sim.connect({ component: source, port: 'out' }, { component: part, port })
      sources.set(port, source)
    }
    sim.setState(source, parseSignal(text, radix))
    sim.settle()
  }
  const top = (radix - 1).toString(16).toUpperCase()
  const read = (port = 'out0'): string => formatSignal(sim.readPin({ component: part, port }))
  const tick = (): void => {
    drive('clk', '0')
    drive('clk', top)
  }
  drive('clk', '0')
  return { sim, part, drive, read, tick, top }
}

describe('nextState', () => {
  it('follows the first rule that leaves the state and matches, and otherwise stays', () => {
    const params = machine(
      2,
      [
        [0, 1, 1, ANY],
        [0, 2, ANY, 1],
        [1, 0, 0, 0],
      ],
      [[0], [1], [2]],
    )
    expect(nextState(0, [1, 1], params, 2)).toBe(1)
    expect(nextState(0, [0, 1], params, 2)).toBe(2)
    expect(nextState(0, [0, 0], params, 2)).toBe(0)
    expect(nextState(1, [0, 0], params, 2)).toBe(0)
    expect(nextState(1, [1, 0], params, 2)).toBe(1)
  })

  it('is unknown when an unknown input decides it, but not when the rule does not ask', () => {
    const params = machine(2, [[0, 1, 1, ANY]], [[0], [1]])
    expect(nextState(0, [X, 0], params, 2)).toBeUndefined()
    expect(nextState(0, [1, X], params, 2)).toBe(1)
  })

  it('never matches a digit the radix has no room for', () => {
    const params = machine(1, [[0, 1, 2]], [[0], [1]])
    expect(nextState(0, [1], params, 2)).toBe(0)
    expect(nextState(0, [2], params, 3)).toBe(1)
  })
})

describe('fsm', () => {
  it('starts in state 0 and moves on the rising edge of the clock', () => {
    const { sim, part, drive, read, tick } = bench(counter)
    drive('in0', '1')
    expect(read()).toBe('0')
    tick()
    expect(sim.getStored(part)).toEqual([1])
    tick()
    expect(read()).toBe('1')
    drive('in0', '0')
    tick()
    expect(read()).toBe('1')
    drive('in0', '1')
    tick()
    expect(read()).toBe('0')
    expect(sim.getStored(part)).toEqual([0])
  })

  it('goes back to state 0 at once on reset', () => {
    const { drive, read, tick } = bench(counter)
    drive('in0', '1')
    tick()
    tick()
    expect(read()).toBe('1')
    drive('reset', '1')
    expect(read()).toBe('0')
    tick()
    expect(read()).toBe('0')
  })

  it('shows X on an unknown input that decides, and keeps its state', () => {
    const { sim, part, drive, read, tick } = bench(counter)
    drive('in0', '1')
    tick()
    tick()
    drive('in0', 'X')
    tick()
    expect(read()).toBe('X')
    expect(sim.getStored(part)).toEqual([2])
    drive('in0', '0')
    tick()
    expect(read()).toBe('1')
  })

  it('works at radix 3, and an output digit it has no room for reads X', () => {
    const params = machine(1, [[0, 1, 2], [1, 0, 2]], [[1, 2], [3, 0]])
    const { drive, read, tick } = bench(params, 3)
    drive('in0', '1')
    tick()
    expect(read('out0')).toBe('1')
    expect(read('out1')).toBe('2')
    drive('in0', '2')
    tick()
    expect(read('out0')).toBe('X')
    expect(read('out1')).toBe('0')
  })
})
