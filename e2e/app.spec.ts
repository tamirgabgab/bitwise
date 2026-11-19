import { expect, test } from '@playwright/test'
import { circuitTab, visit } from './helpers.ts'

test('a first visit starts with the tour, and a later one at the home screen', async ({ page }) => {
  await page.goto('/')
  const skip = page.getByRole('button', { name: 'Skip the tour' })
  await expect(skip).toBeVisible()
  await skip.click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
})

test('the built page carries its security policy and loads without an error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await visit(page)
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(policy).toContain("script-src 'self'")
  expect(errors).toEqual([])
})

test('an example opens from the home screen and runs', async ({ page }) => {
  await visit(page)
  const examples = page.getByRole('dialog').getByRole('button', { name: /Four-bit counter/ })
  await examples.first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(circuitTab(page, /Counter/).first()).toBeVisible()
  // The counter has a clock, so the circuit never settles while it runs.
  await expect(page.locator('.statusbar')).toContainText(/tick \d+/)
})
