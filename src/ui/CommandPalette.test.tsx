// @vitest-environment jsdom
import './domTesting.ts'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useChrome } from './chrome.ts'
import { CommandPalette } from './CommandPalette.tsx'

afterEach(() => act(() => useChrome.getState().closeOverlay()))

function search(query = '') {
  render(<CommandPalette />)
  act(() => useChrome.getState().openCommands(query))
  return screen.getByRole('combobox')
}

function chosen(): string | undefined {
  return screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true')
    ?.textContent ?? undefined
}

describe('the command search', () => {
  it('runs the command found, and closes first', () => {
    const field = search()
    fireEvent.change(field, { target: { value: 'keyboard shortcuts' } })
    expect(chosen()).toMatch(/Show keyboard shortcuts/)
    fireEvent.keyDown(field, { code: 'Enter' })
    // The search closed, and the command opened its own window in its place.
    expect(useChrome.getState().overlay).toBe('shortcuts')
  })

  it('walks the list with the arrow keys and wraps round at the end', () => {
    const field = search()
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(2)
    expect(chosen()).toBe(options[0].textContent)
    fireEvent.keyDown(field, { code: 'ArrowDown' })
    expect(chosen()).toBe(options[1].textContent)
    fireEvent.keyDown(field, { code: 'ArrowUp' })
    fireEvent.keyDown(field, { code: 'ArrowUp' })
    expect(chosen()).toBe(options.at(-1)?.textContent)
    expect(field.getAttribute('aria-activedescendant')).toBe(options.at(-1)?.id)
  })

  it('says when nothing matches and offers to clear the search', () => {
    const field = search('qqqzzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/Nothing matches “qqqzzz”/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }))
    expect((field as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('closes on Escape', () => {
    search()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(useChrome.getState().overlay).toBeNull()
  })
})
