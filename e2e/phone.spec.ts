import { expect, test } from '@playwright/test'
import { dropPart, newProject, onCanvas, partAt } from './helpers.ts'

test('the page fits the width of a phone', async ({ page }) => {
  await newProject(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a tap on a switch turns it on', async ({ page }) => {
  await newProject(page)
  // High on the canvas: the inspector of a selected part is a sheet over its lower half.
  const input = await dropPart(page, 'Input', await onCanvas(page, 0, -160))
  // A phone has no pointer to rest on a wire; the inspector of the switch says what it gives.
  const pins = page.locator('.inspector .probe-pins')
  await expect(pins).toHaveText(/0$/)
  const face = await partAt(page, input)
  await page.touchscreen.tap(face.x, face.y)
  await expect(pins).toHaveText(/1$/)
})
