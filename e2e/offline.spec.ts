import { expect, test } from '@playwright/test'
import { visit } from './helpers.ts'

test('the app opens again without a network once it has been visited', async ({ page, context }) => {
  await visit(page)
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  // The service worker has kept the files once it is active.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  // A window loaded on first open comes from the cache too.
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('Build circuits from Verilog')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Verilog, one circuit for each module')).toBeVisible()
})
