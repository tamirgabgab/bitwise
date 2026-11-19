import { describe, expect, it } from 'vitest'
import { parseSignal } from '../core/index.ts'
import { checkBreaks } from './session.ts'
import type { BreakWhen } from './simStore.ts'

/** A wire whose value the test sets, with a breakpoint that waits for `when`. */
function watched(when: BreakWhen) {
  let value = parseSignal('0000')
  const engine = {
    bridge: { probeTerminal: () => ({ value, conflict: false }) },
    breaks: new Map([['p:a:out', { terminal: { kind: 'pin', part: 'a', port: 'out' }, when }]]),
  } as unknown as Parameters<typeof checkBreaks>[0]
  return {
    tick(text: string) {
      value = parseSignal(text)
      return checkBreaks(engine)
    },
  }
}

describe('a breakpoint on a bus', () => {
  it('stops when the bus becomes the value, and says it as it was typed', () => {
    const wire = watched({ bus: '1010', shown: '10' })
    expect(wire.tick('0000')).toBeNull()
    expect(wire.tick('0110')).toBeNull()
    expect(wire.tick('1010')).toMatchObject({ key: 'p:a:out', value: '10' })
    // Staying at the value is not a new reason to stop.
    expect(wire.tick('1010')).toBeNull()
    expect(wire.tick('0000')).toBeNull()
    expect(wire.tick('1010')).not.toBeNull()
  })

  it('stops on a change of any digit, and gives the whole value', () => {
    const wire = watched('change')
    wire.tick('0000')
    expect(wire.tick('1000')).toMatchObject({ value: '1000' })
  })
})
