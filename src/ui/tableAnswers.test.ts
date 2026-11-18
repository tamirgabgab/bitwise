import { describe, expect, it } from 'vitest'
import { X } from '../core/index.ts'
import { nextAnswer, typedAnswer } from './tableAnswers.ts'

describe('nextAnswer', () => {
  it('steps through every value and then X', () => {
    expect(nextAnswer(0, 1, 3)).toBe(1)
    expect(nextAnswer(2, 1, 3)).toBe(X)
    expect(nextAnswer(X, 1, 3)).toBe(0)
  })

  it('steps back the other way', () => {
    expect(nextAnswer(0, -1, 3)).toBe(X)
    expect(nextAnswer(X, -1, 3)).toBe(2)
  })

  it('treats an answer the radix has no room for as X', () => {
    expect(nextAnswer(5, 1, 3)).toBe(0)
  })
})

describe('typedAnswer', () => {
  it('types digits and X', () => {
    expect(typedAnswer('Digit1', 2)).toBe(1)
    expect(typedAnswer('KeyX', 2)).toBe(X)
    expect(typedAnswer('Digit3', 2)).toBeUndefined()
  })
})
