import { expect, test } from '@playwright/test'
import { drawWire, dropPart, newProject, onCanvas, partAt, pinAt, probe } from './helpers.ts'

test('a switch drives an output through a wire, and undo takes the wire away', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -160, 0))
  const output = await dropPart(page, 'Output', await onCanvas(page, 160, 0))

  await drawWire(page, await pinAt(page, input, 'out'), await pinAt(page, output, 'in'))
  await expect(page.locator('.statusbar')).toContainText('2 parts, 1 wire')

  const end = await pinAt(page, output, 'in')
  await expect.poll(() => probe(page, end)).toMatch(/\b0\b/)

  // A click on the switch turns it on, and the output follows.
  const face = await partAt(page, input)
  await page.mouse.click(face.x, face.y)
  await expect.poll(() => probe(page, end)).toMatch(/\b1\b/)

  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusbar')).toContainText('2 parts, 0 wires')
})

test('a gate from the palette works on the canvas', async ({ page }) => {
  await newProject(page)
  const a = await dropPart(page, 'Input', await onCanvas(page, -200, -60))
  const b = await dropPart(page, 'Input', await onCanvas(page, -200, 60))
  const gate = await dropPart(page, 'AND', await onCanvas(page, 0, 0))
  const out = await dropPart(page, 'Output', await onCanvas(page, 200, 0))

  await drawWire(page, await pinAt(page, a, 'out'), await pinAt(page, gate, 'in0'))
  await drawWire(page, await pinAt(page, b, 'out'), await pinAt(page, gate, 'in1'))
  await drawWire(page, await pinAt(page, gate, 'out'), await pinAt(page, out, 'in'))
  await expect(page.locator('.statusbar')).toContainText('4 parts, 3 wires')

  const end = await pinAt(page, out, 'in')
  for (const [left, right, want] of [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ] as const) {
    for (const [id, on] of [
      [a, left],
      [b, right],
    ] as const) {
      // Typing a digit with the pointer on a switch puts it on that value.
      const face = await partAt(page, id)
      await page.mouse.move(face.x, face.y)
      await page.keyboard.press(`Digit${on}`)
    }
    await expect.poll(() => probe(page, end)).toMatch(new RegExp(`\\b${want}\\b`))
  }
})
