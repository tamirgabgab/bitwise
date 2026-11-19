// @vitest-environment jsdom
import './domTesting.ts'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EXAMPLES } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { HomeScreen } from './HomeScreen.tsx'
import { useStorage } from './persistence.ts'

afterEach(() => {
  act(() => useChrome.getState().closeOverlay())
  useStorage.setState({ ok: true, library: { open: null, projects: [] } })
})

function home(projects: readonly { id: string; name: string; saved: number }[] = []) {
  useStorage.setState({ ok: true, library: { open: null, projects } })
  render(<HomeScreen />)
  act(() => useChrome.getState().openHome())
}

describe('the home screen', () => {
  it('shows every example, and says when the browser keeps no project yet', () => {
    home()
    const examples = screen.getByRole('region', { name: /Examples/ })
    expect(within(examples).getAllByRole('listitem')).toHaveLength(EXAMPLES.length)
    expect(screen.getByText(/Nothing is kept yet/)).toBeTruthy()
  })

  it('lists the projects, the latest first', () => {
    home([
      { id: 'p1', name: 'Adder', saved: 1000 },
      { id: 'p2', name: 'Counter', saved: 2000 },
    ])
    const projects = screen.getByRole('region', { name: /Projects in this browser/ })
    const names = within(projects)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.home-name')?.textContent)
    expect(names).toEqual(['Counter', 'Adder'])
  })

  it('asks in place before a project is deleted, and keeps it on no', () => {
    home([{ id: 'p1', name: 'Adder', saved: 1000 }])
    fireEvent.click(screen.getByRole('button', { name: 'Delete Adder' }))
    const question = screen.getByRole('group', { name: 'Delete Adder' })
    expect(question.textContent).toMatch(/It cannot be brought back/)
    // No second window opens over this one.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(within(question).getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('group', { name: 'Delete Adder' })).toBeNull()
    expect(useStorage.getState().library.projects).toHaveLength(1)
  })

  it('warns when the browser is not keeping projects', () => {
    useStorage.setState({ ok: false })
    render(<HomeScreen />)
    act(() => useChrome.getState().openHome())
    expect(screen.getByText(/not keeping your projects/)).toBeTruthy()
  })
})
