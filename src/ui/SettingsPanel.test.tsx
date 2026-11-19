// @vitest-environment jsdom
import './domTesting.ts'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { language, t } from '../i18n/index.ts'
import { speak } from './language.ts'
import { SettingsPanel } from './SettingsPanel.tsx'

afterEach(async () => {
  await act(() => speak('en'))
  localStorage.clear()
})

describe('the choice of language in the settings', () => {
  it('names each language in itself', () => {
    render(<SettingsPanel onClose={() => {}} />)
    const field = screen.getByRole('combobox', { name: 'Language' })
    const names = [...field.querySelectorAll('option')].map((option) => [option.lang, option.textContent])
    expect(names).toEqual([
      ['en', 'English'],
      ['he', 'עברית'],
    ])
  })

  it('speaks Hebrew once it is chosen: right to left, and remembered', async () => {
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'he' } })
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
    expect(document.documentElement.lang).toBe('he')
    expect(language()).toBe('he')
    expect(t('Language')).toBe('שפה')
    expect(localStorage.getItem('cedar-logic.language')).toBe('he')
  })
})
