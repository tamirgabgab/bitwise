import { expect, test } from '@playwright/test'
import { drawWire, dropPart, newProject, onCanvas, pinAt, wires } from './helpers.ts'

test('a selected wire is dragged by a handle, and goes back to its automatic route', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -160, 0))
  const output = await dropPart(page, 'Output', await onCanvas(page, 160, 0))
  const out = await pinAt(page, input, 'out')
  const into = await pinAt(page, output, 'in')
  await drawWire(page, out, into)
  const middle = { x: (out.x + into.x) / 2, y: out.y }
  await page.mouse.click(middle.x, middle.y)
  // The handle sits in the middle of the straight wire: dragging it moves the stretch down.
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x, middle.y + 64, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await wires(page)).length).toBe(3)
  await page.getByRole('button', { name: 'Automatic route' }).click()
  await expect.poll(() => wires(page)).toEqual([[`${input}:out`, `${output}:in`]])
})
