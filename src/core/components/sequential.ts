import type { ComponentDef, PortSpec } from '../component.ts'
import { X, mirrorDigit } from '../signal.ts'
import type { Digit } from '../signal.ts'

/*
 * Parts with time or memory in them: a clock, a latch and flip-flops.
 *
 * They work at any radix and are the usual binary parts at radix 2:
 *
 * - A clock alternates between 0 and the top value, radix - 1.
 * - A clock input is high when its value is in the upper half of the digits
 *   (2 * value >= radix) and low when it is in the lower half. A rising edge
 *   is a step from low to high. X and Z are neither, so coming out of them
 *   is no edge.
 * - A control input (Set, Reset, J, K, S, R) is on only at the top value.
 * - Q starts at 0, and the second output is Q mirrored.
 * - While a Set, Reset, S or R input is unknown and could change the
 *   result, the outputs read X but the stored value is kept. Otherwise the
 *   X every wire carries for a moment at power-on would wipe the memory.
 */

/** A clock: 0 for `half` ticks, then the top value for `half` ticks. */
export const clockSource: ComponentDef<boolean> = {
  type: 'clock',
  params: { half: { default: 5, min: 1, max: 1000 } },
  ports() {
    return [{ name: 'out', direction: 'out', width: 1 }]
  },
  initialState() {
    return false
  },
  evaluate(_inputs, { half }, high, { radix, woke }) {
    const next = woke ? !high : high
    return { outputs: { out: [next ? radix - 1 : 0] }, state: next, wake: half }
  },
}

/** Where a clock input stands. */
export type ClockLevel = 'low' | 'high' | 'unknown'

export function clockLevel(digit: Digit, radix: number): ClockLevel {
  if (digit < 0 || digit >= radix) return 'unknown'
  return 2 * digit >= radix ? 'high' : 'low'
}

/** True, false, or undefined when the input is unknown. */
type Flag = boolean | undefined

/** Set and Reset: on at the top value, and off when left unattached. */
function control(digit: Digit, radix: number): Flag {
  if (digit === X || digit >= radix) return undefined
  return digit === radix - 1
}

/** J, K, S and R: floating is as unknown as X. */
function strict(digit: Digit, radix: number): Flag {
  if (digit < 0 || digit >= radix) return undefined
  return digit === radix - 1
}

/**
 * The value `next` gives when every unknown flag is tried both ways: the
 * common answer if they all agree, otherwise undefined.
 */
function decide(
  flags: readonly Flag[],
  next: (flags: readonly boolean[]) => Digit,
): Digit | undefined {
  let result: Digit | undefined
  const tried: boolean[] = []
  const walk = (index: number): boolean => {
    if (index === flags.length) {
      const value = next(tried)
      if (result === undefined) result = value
      return result === value
    }
    const flag = flags[index]
    for (const option of flag === undefined ? [false, true] : [flag]) {
      tried[index] = option
      if (!walk(index + 1)) return false
    }
    return true
  }
  return walk(0) ? result : undefined
}

function plus(q: Digit, by: Digit, radix: number): Digit {
  if (by === 0) return q
  if (q < 0 || by < 0 || by >= radix) return X
  return (q + by) % radix
}

function qOutputs(q: Digit, radix: number): { q: Digit[]; nq: Digit[] } {
  return { q: [q], nq: [mirrorDigit(q, radix)] }
}

const Q_PORTS: readonly PortSpec[] = [
  { name: 'q', direction: 'out', width: 1 },
  { name: 'nq', direction: 'out', width: 1 },
]

/**
 * An SR latch. S at the top value sets Q to the top value, R at the top
 * value clears it to 0, and with neither it remembers. Both at once is not
 * allowed and leaves Q unknown.
 */
export const srLatch: ComponentDef<Digit> = {
  type: 'sr',
  params: {},
  ports() {
    return [
      { name: 's', direction: 'in', width: 1 },
      { name: 'r', direction: 'in', width: 1 },
      ...Q_PORTS,
    ]
  },
  initialState() {
    return 0
  },
  evaluate(inputs, _params, stored, { radix }) {
    const flags = [strict(inputs.s[0], radix), strict(inputs.r[0], radix)]
    const q = decide(flags, ([s, r]) => (s && r ? X : s ? radix - 1 : r ? 0 : stored))
    return { outputs: qOutputs(q ?? X, radix), state: q ?? stored }
  },
}

export interface FlipFlopState {
  readonly q: Digit
  /** Where the clock stood at the last evaluation, to tell an edge. */
  readonly clock: ClockLevel
}

/**
 * A flip-flop that takes a new value on the rising edge of `clk`. `data`
 * names its data inputs and `onEdge` works out the new Q from them.
 *
 * Set (Q becomes the top value) and Reset (Q becomes 0) act at once, clock
 * or no clock. Left unattached they are off. Both at once leave Q unknown.
 */
function flipFlop(
  type: string,
  data: readonly string[],
  onEdge: (q: Digit, inputs: Readonly<Record<string, Digit>>, radix: number) => Digit,
): ComponentDef<FlipFlopState> {
  return {
    type,
    params: {},
    ports() {
      return [
        ...data.map((name): PortSpec => ({ name, direction: 'in', width: 1 })),
        { name: 'clk', direction: 'in', width: 1 },
        { name: 'set', direction: 'in', width: 1 },
        { name: 'reset', direction: 'in', width: 1 },
        ...Q_PORTS,
      ]
    },
    initialState() {
      return { q: 0, clock: 'unknown' }
    },
    evaluate(inputs, _params, state, { radix }) {
      const clock = clockLevel(inputs.clk[0], radix)
      const edge = state.clock === 'low' && clock === 'high'
      const values: Record<string, Digit> = {}
      for (const name of data) values[name] = inputs[name][0]
      const clocked = edge ? onEdge(state.q, values, radix) : state.q
      const flags = [control(inputs.set[0], radix), control(inputs.reset[0], radix)]
      const q = decide(flags, ([set, reset]) =>
        set && reset ? X : set ? radix - 1 : reset ? 0 : clocked,
      )
      return { outputs: qOutputs(q ?? X, radix), state: { q: q ?? clocked, clock } }
    },
  }
}

/** D flip-flop: on the edge Q takes the value of D, whatever digit it is. */
export const dFlipFlop = flipFlop('dff', ['d'], (_q, { d }, radix) =>
  d < 0 || d >= radix ? X : d,
)

/**
 * T flip-flop: on the edge Q becomes Q + T modulo the radix. With T at 1 it
 * is one digit of a counter, and at radix 2 that is the usual toggle.
 */
export const tFlipFlop = flipFlop('tff', ['t'], (q, { t }, radix) => plus(q, t, radix))

/**
 * JK flip-flop: on the edge J alone sets Q to the top value, K alone clears
 * it to 0, and both together add 1 modulo the radix (a toggle at radix 2).
 */
export const jkFlipFlop = flipFlop(
  'jkff',
  ['j', 'k'],
  (q, { j, k }, radix) =>
    decide([strict(j, radix), strict(k, radix)], ([set, clear]) =>
      set && clear ? plus(q, 1, radix) : set ? radix - 1 : clear ? 0 : q,
    ) ?? X,
)
