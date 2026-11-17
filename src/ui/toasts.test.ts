import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_LIMIT, TOAST_TIME, dismissToast, toast, useToasts } from './toasts.ts'

const messages = (): string[] => useToasts.getState().toasts.map((item) => item.message)

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToasts.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a message and takes it away after a while', () => {
    toast('Saved')
    expect(messages()).toEqual(['Saved'])
    vi.advanceTimersByTime(TOAST_TIME - 1)
    expect(messages()).toEqual(['Saved'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('takes a message away at once when asked', () => {
    const first = toast('One')
    toast('Two')
    dismissToast(first)
    expect(messages()).toEqual(['Two'])
  })

  it('keeps only the newest few', () => {
    for (let i = 0; i < TOAST_LIMIT + 2; i++) toast(`Message ${i}`)
    expect(messages()).toHaveLength(TOAST_LIMIT)
    expect(messages()[TOAST_LIMIT - 1]).toBe(`Message ${TOAST_LIMIT + 1}`)
    expect(messages()).not.toContain('Message 0')
  })
})
