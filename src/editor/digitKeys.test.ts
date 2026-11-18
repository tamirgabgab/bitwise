import { describe, expect, it } from 'vitest'
import { WheelSteps, digitOfKey, typedBusValue } from './digitKeys.ts'

describe('digitOfKey', () => {
  it('reads the main row and the number pad', () => {
    expect(digitOfKey('Digit0', 2)).toBe(0)
    expect(digitOfKey('Numpad7', 10)).toBe(7)
  })

  it('reads A to F as ten to fifteen', () => {
    expect(digitOfKey('KeyA', 16)).toBe(10)
    expect(digitOfKey('KeyF', 16)).toBe(15)
  })

  it('refuses a digit the radix has no room for', () => {
    expect(digitOfKey('Digit2', 2)).toBeUndefined()
    expect(digitOfKey('KeyB', 11)).toBeUndefined()
  })

  it('refuses other keys', () => {
    expect(digitOfKey('KeyG', 16)).toBeUndefined()
    expect(digitOfKey('Space', 16)).toBeUndefined()
  })
})

describe('typedBusValue', () => {
  it('moves the digits up and puts the new one at the bottom', () => {
    expect(typedBusValue('012', 2, 3)).toBe('122')
    expect(typedBusValue('0000', 1, 4)).toBe('0001')
  })

  it('fills a value it does not know with zeros', () => {
    expect(typedBusValue(undefined, 5, 3)).toBe('005')
    expect(typedBusValue('1X', 3, 2)).toBe('03')
  })
})

describe('WheelSteps', () => {
  it('steps once a notch of a mouse wheel, up for a turn away from the user', () => {
    const wheel = new WheelSteps()
    expect(wheel.turn('c1', -100)).toBe(1)
    expect(wheel.turn('c1', 100)).toBe(-1)
  })

  it('adds up the small turns of a touchpad', () => {
    const wheel = new WheelSteps()
    const steps = Array.from({ length: 12 }, () => wheel.turn('c1', -10))
    expect(steps.reduce((sum, step) => sum + step, 0)).toBe(2)
  })

  it('starts over on another switch', () => {
    const wheel = new WheelSteps()
    wheel.turn('c1', -50)
    expect(wheel.turn('c2', -50)).toBe(0)
  })
})
