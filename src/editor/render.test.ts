import { describe, expect, it } from 'vitest'
import { MAX_TEXT_BOOST, MIN_TEXT_PX, textPixels } from './render.ts'

describe('textPixels', () => {
  it('keeps text that is already readable', () => {
    expect(textPixels(12, MIN_TEXT_PX)).toBe(12)
    expect(textPixels(MIN_TEXT_PX, MIN_TEXT_PX)).toBe(MIN_TEXT_PX)
  })

  it('enlarges slightly small text to the floor', () => {
    expect(textPixels(MIN_TEXT_PX / 1.2, MIN_TEXT_PX)).toBe(MIN_TEXT_PX)
  })

  it('leaves out text that is far too small to read', () => {
    expect(textPixels(MIN_TEXT_PX / (MAX_TEXT_BOOST + 0.1), MIN_TEXT_PX)).toBe(0)
  })
})
