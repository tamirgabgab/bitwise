import { describe, expect, it } from 'vitest'
import { digitOfKey } from './digitKeys.ts'

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
