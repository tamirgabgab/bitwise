import { describe, expect, it } from 'vitest'
import { MAX_NOTE, MAX_STEPS, changeStep, cleanInputValue, cleanSteps, insertStep, removeStep } from './steps.ts'
import type { Step } from './steps.ts'

const step = (note: string, inputs: Record<string, number> = {}): Step => ({ note, inputs })
const isSwitch = (id: string): boolean => id === 'c1' || id === 'c2'

describe('cleanSteps', () => {
  it('keeps notes and the values switches can take', () => {
    const steps = cleanSteps(
      [{ note: '  Both  on ', inputs: { c1: 1, c2: 2, c9: 1, c3: 'x' } }, { inputs: { c2: 1.5 } }],
      isSwitch,
      3,
    )
    expect(steps).toEqual([
      { note: 'Both on', inputs: { c1: 1, c2: 2 } },
      { note: '', inputs: {} },
    ])
  })

  it('drops values the radix has no room for', () => {
    expect(cleanSteps([{ note: 'a', inputs: { c1: 2 } }], isSwitch, 2)).toEqual([step('a')])
  })

  it('reads anything that is not a list as no steps, and cuts a long list and a long note', () => {
    expect(cleanSteps('nope', isSwitch, 2)).toEqual([])
    expect(cleanSteps([7, null, { note: 'x'.repeat(MAX_NOTE + 9) }], isSwitch, 2)).toEqual([
      step('x'.repeat(MAX_NOTE)),
    ])
    const many = Array.from({ length: MAX_STEPS + 5 }, () => ({ note: 'n' }))
    expect(cleanSteps(many, isSwitch, 2)).toHaveLength(MAX_STEPS)
  })
})

describe('editing a list of steps', () => {
  const list = [step('one'), step('two')]

  it('inserts after a position', () => {
    expect(insertStep(list, 0, step('new')).map((item) => item.note)).toEqual(['one', 'new', 'two'])
    expect(insertStep(list, 9, step('new')).map((item) => item.note)).toEqual(['one', 'two', 'new'])
    expect(insertStep([], -1, step('new'))).toEqual([step('new')])
  })

  it('stops growing at the limit', () => {
    const full = Array.from({ length: MAX_STEPS }, () => step('n'))
    expect(insertStep(full, 0, step('new'))).toHaveLength(MAX_STEPS)
  })

  it('changes and removes one step', () => {
    expect(changeStep(list, 1, { note: 'second' })[1]).toEqual(step('second'))
    expect(changeStep(list, 1, { inputs: { c1: 1 } })[1]).toEqual(step('two', { c1: 1 }))
    expect(changeStep(list, 5, { note: 'x' })).toBe(list)
    expect(removeStep(list, 0)).toEqual([step('two')])
    expect(removeStep(list, 5)).toBe(list)
  })
})

describe('cleanInputValue', () => {
  it('keeps a digit the radix has', () => {
    expect(cleanInputValue(0, 2)).toBe(0)
    expect(cleanInputValue(2, 3)).toBe(2)
    expect(cleanInputValue(2, 2)).toBeUndefined()
    expect(cleanInputValue(-1, 2)).toBeUndefined()
    expect(cleanInputValue(0.5, 2)).toBeUndefined()
  })

  it('keeps the digits of a bus when the radix has them all', () => {
    expect(cleanInputValue('0110', 2)).toBe('0110')
    expect(cleanInputValue('0A3F', 16)).toBe('0A3F')
    expect(cleanInputValue('0120', 2)).toBeUndefined()
    expect(cleanInputValue('1', 2)).toBeUndefined()
    expect(cleanInputValue('1X', 2)).toBeUndefined()
    expect(cleanInputValue('ab', 16)).toBeUndefined()
    expect(cleanInputValue(null, 2)).toBeUndefined()
  })
})

describe('cleanSteps on a bus', () => {
  it('keeps the digits of a wide switch', () => {
    const steps = cleanSteps([{ inputs: { c1: '101', c2: 1, c3: '1Z' } }], () => true, 2)
    expect(steps).toEqual([{ note: '', inputs: { c1: '101', c2: 1 } }])
  })
})
