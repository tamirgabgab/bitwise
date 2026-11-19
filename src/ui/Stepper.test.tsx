// @vitest-environment jsdom
import './domTesting.ts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Inspector.tsx'

function stepper(value = 3) {
  const onSet = vi.fn()
  render(<Stepper label="Inputs" value={value} min={1} max={64} onSet={onSet} />)
  return { onSet, field: screen.getByRole('textbox', { name: 'Inputs' }) }
}

describe('the stepper of the inspector', () => {
  it('steps the value with its buttons and the arrow keys', () => {
    const { onSet, field } = stepper()
    fireEvent.click(screen.getByRole('button', { name: 'Inputs: higher' }))
    expect(onSet).toHaveBeenLastCalledWith(4)
    fireEvent.click(screen.getByRole('button', { name: 'Inputs: lower' }))
    expect(onSet).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(field, { code: 'ArrowUp' })
    expect(onSet).toHaveBeenLastCalledWith(4)
  })

  it('takes a typed value on Enter', () => {
    const { onSet, field } = stepper()
    fireEvent.change(field, { target: { value: '12' } })
    expect(onSet).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { code: 'Enter' })
    expect(onSet).toHaveBeenCalledWith(12)
  })

  it('refuses a value out of range with a note that names the range', () => {
    const { onSet, field } = stepper()
    fireEvent.change(field, { target: { value: '65' } })
    fireEvent.keyDown(field, { code: 'Enter' })
    expect(onSet).not.toHaveBeenCalled()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/1.*64/)
    // The note goes the moment the value is right.
    fireEvent.change(field, { target: { value: '64' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('puts the value back when the typing is cancelled', () => {
    const { onSet, field } = stepper()
    fireEvent.change(field, { target: { value: '9' } })
    fireEvent.keyDown(field, { code: 'Escape' })
    expect((field as HTMLInputElement).value).toBe('3')
    expect(onSet).not.toHaveBeenCalled()
  })

  it('has no step past either end', () => {
    stepper(64)
    expect(screen.getByRole('button', { name: 'Inputs: higher' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Inputs: lower' })).toHaveProperty('disabled', false)
  })
})
