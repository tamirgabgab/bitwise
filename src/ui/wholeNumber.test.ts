import { describe, expect, it } from 'vitest'
import { rangeText, readWholeNumber } from './wholeNumber.ts'

describe('readWholeNumber', () => {
  it('reads a number in the range', () => {
    expect(readWholeNumber('50', 1, 1000)).toEqual({ ok: true, value: 50 })
    expect(readWholeNumber(' 7 ', 1, 99)).toEqual({ ok: true, value: 7 })
    expect(readWholeNumber('1', 1, 1)).toEqual({ ok: true, value: 1 })
    expect(readWholeNumber('007', 1, 10)).toEqual({ ok: true, value: 7 })
  })

  it('refuses a number outside the range and names the range', () => {
    expect(readWholeNumber('0', 1, 1000)).toEqual({ ok: false, message: rangeText(1, 1000) })
    expect(readWholeNumber('1001', 1, 1000)).toEqual({ ok: false, message: rangeText(1, 1000) })
  })

  it('refuses what is not a plain whole number', () => {
    for (const text of ['', ' ', '-3', '2.5', '1e3', 'ten', '0x10', '5 5', '9999999999']) {
      expect(readWholeNumber(text, 0, 100).ok).toBe(false)
    }
  })

  it('says which values are allowed', () => {
    expect(rangeText(1, 99)).toBe('Use a whole number from 1 to 99.')
  })
})
