import { expect, test } from '@playwright/test'
import { dropPart, newProject, onCanvas, pinAt, wires } from './helpers.ts'

test('a click on a pin and a click on another connect them', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -160, 0))
  const output = await dropPart(page, 'Output', await onCanvas(page, 160, 0))
  const out = await pinAt(page, input, 'out')
  const into = await pinAt(page, output, 'in')
  await page.mouse.click(out.x, out.y)
  await page.mouse.click(into.x, into.y)
  await expect.poll(() => wires(page)).toEqual([[`${input}:out`, `${output}:in`]])
})

test('a selected wire is disconnected from its inspector', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -160, 0))
  const output = await dropPart(page, 'Output', await onCanvas(page, 160, 0))
  const out = await pinAt(page, input, 'out')
  const into = await pinAt(page, output, 'in')
  await page.mouse.click(out.x, out.y)
  await page.mouse.click(into.x, into.y)
  await expect.poll(async () => (await wires(page)).length).toBe(1)
  // The middle of the wire, on the straight line between the two pins.
  await page.mouse.click((out.x + into.x) / 2, out.y)
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect.poll(async () => (await wires(page)).length).toBe(0)
})

test('Esc lets go of a pin chosen by a click', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -160, 0))
  const out = await pinAt(page, input, 'out')
  await page.mouse.click(out.x, out.y)
  const bar = page.getByRole('group', { name: 'Connecting' })
  await expect(bar).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
})
