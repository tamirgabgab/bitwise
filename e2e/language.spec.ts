import { expect, test } from '@playwright/test'
import { newProject, visit } from './helpers.ts'

test.describe('in a browser that asks for Hebrew', () => {
  test.use({ locale: 'he-IL' })

  test('the interface speaks Hebrew from right to left, and the canvas does not turn', async ({ page }) => {
    await visit(page)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'he')
    await expect(page.getByRole('button', { name: 'התחלת פרויקט חדש' })).toBeVisible()
    await page.getByRole('button', { name: 'התחלת פרויקט חדש' }).click()
    await expect(page.locator('canvas.canvas')).toHaveCSS('direction', 'ltr')
  })
})

test('the language chosen in the settings is kept, and the project stays open', async ({ page }) => {
  await newProject(page)
  await page.getByTitle(/^Logic settings/).click()
  await page.getByLabel('Language').selectOption('he')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: 'קובץ' })).toBeVisible()
  // Drawing the app again in another language does not bring the home screen back.
  await expect(page.getByRole('button', { name: 'התחלת פרויקט חדש' })).toHaveCount(0)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
})
