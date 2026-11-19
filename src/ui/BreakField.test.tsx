// @vitest-environment jsdom
import './domTesting.ts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { breakpointOn, setBreakpoint, useEditor } from '../editor/index.ts'
import type { Terminal } from '../editor/index.ts'
import { BreakField } from './Inspector.tsx'

let pin: Terminal

/** A new project with one switch (type input) four digits wide, whose pin the field watches. */
beforeEach(() => {
  const editor = useEditor.getState()
  editor.newProject()
  editor.addComponent('input', { x: 0, y: 0 })
  const id = Object.keys(useEditor.getState().doc.components)[0]
  useEditor.getState().setParams(id, { width: 4 })
  pin = { kind: 'pin', component: id, port: 'out' }
  setBreakpoint(pin, null)
})

function field() {
  render(<BreakField terminal={pin} width={4} format="hex" />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Pause when it' }), { target: { value: 'value' } })
  return screen.getByRole('textbox', { name: 'Value' })
}

describe('the breakpoint on the value of a bus', () => {
  it('offers a typed value, not one choice for every digit', () => {
    render(<BreakField terminal={pin} width={4} format="hex" />)
    const choices = [...screen.getByRole('combobox').querySelectorAll('option')].map((option) => option.value)
    expect(choices).toEqual(['never', 'change', 'conflict', 'value'])
  })

  it('pauses on the value typed in the format of the bus', () => {
    const value = field()
    fireEvent.change(value, { target: { value: '0xA' } })
    fireEvent.keyDown(value, { key: 'Enter' })
    expect(breakpointOn(pin)).toEqual({ bus: '1010', shown: '0xA' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses what is not a value of the bus, says why, and keeps no breakpoint', () => {
    const value = field()
    fireEvent.change(value, { target: { value: '0x1F' } })
    fireEvent.blur(value)
    expect(screen.getByRole('alert').textContent).toMatch(/at most 4 digits/)
    expect(value.getAttribute('aria-invalid')).toBe('true')
    expect(breakpointOn(pin)).toBeUndefined()
    // Typing again takes the note away.
    fireEvent.change(value, { target: { value: '7' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('drops the breakpoint when Never is chosen', () => {
    const value = field()
    fireEvent.change(value, { target: { value: 'F' } })
    fireEvent.blur(value)
    expect(breakpointOn(pin)).toEqual({ bus: '1111', shown: 'F' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Pause when it' }), { target: { value: 'never' } })
    expect(breakpointOn(pin)).toBeUndefined()
    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull()
  })
})
