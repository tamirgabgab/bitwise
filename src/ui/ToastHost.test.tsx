// @vitest-environment jsdom
import './domTesting.ts'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from './ToastHost.tsx'
import { toast, useToasts } from './toasts.ts'

afterEach(() => useToasts.setState({ toasts: [] }))

describe('the short messages', () => {
  it('runs what a message offers, once, and takes the message away', () => {
    const run = vi.fn()
    render(<ToastHost />)
    act(() => {
      toast('The part was deleted.', { action: 'Undo', run })
    })
    expect(screen.getByText('The part was deleted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(run).toHaveBeenCalledOnce()
    expect(screen.queryByText('The part was deleted.')).toBeNull()
  })

  it('takes a message away when it is dismissed, without running its offer', () => {
    const run = vi.fn()
    render(<ToastHost />)
    act(() => {
      toast('Saved.', { action: 'Show', run })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this message' }))
    expect(screen.queryByText('Saved.')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('speaks politely, so a screen reader hears a message without being cut off', () => {
    render(<ToastHost />)
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })
})
