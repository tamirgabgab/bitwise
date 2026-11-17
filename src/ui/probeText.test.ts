import { describe, expect, it } from 'vitest'
import { portLabel } from './probeText.ts'

describe('portLabel', () => {
  it('names ports the way the symbols do', () => {
    expect(portLabel('in')).toBe('In')
    expect(portLabel('out')).toBe('Out')
    expect(portLabel('in2')).toBe('In 2')
    expect(portLabel('nq')).toBe('Q̅')
    expect(portLabel('clk')).toBe('Clock')
    expect(portLabel('q')).toBe('Q')
    expect(portLabel('en')).toBe('EN')
    expect(portLabel('set')).toBe('Set')
    expect(portLabel('reset')).toBe('Reset')
  })
})
