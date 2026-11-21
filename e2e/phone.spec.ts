import { expect, test } from '@playwright/test'
import type { CDPSession, Page } from '@playwright/test'
import { dropPart, newProject, onCanvas, partAt, parts, pinAt, wires } from './helpers.ts'
import type { Point } from './helpers.ts'

/*
 * A phone is used with fingers. Playwright's touchscreen only taps, so a
 * finger that moves is sent through Chromium's own touch events: they come
 * to the page as a real finger's would, with the browser's scrolling and
 * the `touch-action` of what is under it.
 */

async function finger(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page)
}

/** A finger that comes down at `from`, rests for `rest` ms, slides to `to` and lifts. */
async function slide(cdp: CDPSession, page: Page, from: Point, to: Point, rest = 0): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  if (rest > 0) await page.waitForTimeout(rest)
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** The middle of a palette item, by its name. */
async function item(page: Page, name: string): Promise<Point> {
  const button = page.getByRole('navigation', { name: 'Parts' }).getByRole('button', { name, exact: true }).last()
  await button.scrollIntoViewIfNeeded()
  const box = await button.boundingBox()
  expect(box, `palette item ${name}`).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

test('the page fits the width of a phone', async ({ page }) => {
  await newProject(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a tap on a switch turns it on', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, 0, -160))
  // The sheet of a selected part comes up low; opened, it says what the switch gives.
  await page.getByRole('button', { name: 'Show settings' }).tap()
  const pins = page.locator('.inspector .probe-pins')
  await expect(pins).toHaveText(/0$/)
  const face = await partAt(page, input)
  await page.touchscreen.tap(face.x, face.y)
  await expect(pins).toHaveText(/1$/)
})

test('a swipe scrolls the palette and adds nothing', async ({ page }) => {
  await newProject(page)
  const cdp = await finger(page)
  const strip = page.getByRole('navigation', { name: 'Parts' })
  const box = (await strip.boundingBox())!
  const y = box.y + box.height / 2
  const before = await strip.evaluate((element) => element.scrollLeft)
  // The page is in English: the strip goes on to the right, so the finger moves left.
  await slide(cdp, page, { x: box.x + box.width * 0.8, y }, { x: box.x + box.width * 0.2, y })
  await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).not.toBe(before)
  expect(await parts(page)).toHaveLength(0)
})

test('a tap on the palette adds the part where it can be seen', async ({ page }) => {
  await newProject(page)
  const and = await item(page, 'AND')
  await page.touchscreen.tap(and.x, and.y)
  await expect.poll(async () => (await parts(page)).length).toBe(1)
  const [added] = await parts(page)
  const at = await partAt(page, added.id)
  const canvas = (await page.locator('canvas.canvas').boundingBox())!
  const sheet = (await page.locator('.inspector').boundingBox())!
  expect(at.y).toBeGreaterThan(canvas.y)
  expect(at.y).toBeLessThan(sheet.y)
})

test('a finger that rests on a palette item carries the part', async ({ page }) => {
  await newProject(page)
  const cdp = await finger(page)
  const to = await onCanvas(page, -80, -120)
  await slide(cdp, page, await item(page, 'OR'), to, 600)
  await expect.poll(async () => (await parts(page)).length).toBe(1)
  const [or] = await parts(page)
  const at = await partAt(page, or.id)
  expect(Math.abs(at.x - to.x)).toBeLessThan(24)
  expect(Math.abs(at.y - to.y)).toBeLessThan(24)
})

test('one finger on empty canvas moves the view', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, 0, -160))
  await page.keyboard.press('Escape')
  const before = await partAt(page, input)
  const cdp = await finger(page)
  const from = await onCanvas(page, 60, 120)
  await slide(cdp, page, from, { x: from.x - 90, y: from.y - 60 })
  await expect.poll(async () => (await partAt(page, input)).x).toBeCloseTo(before.x - 90, -1)
  expect((await partAt(page, input)).y).toBeCloseTo(before.y - 60, -1)
})

test('the sheet of a selected part opens with a swipe up and closes with a swipe down', async ({ page }) => {
  await newProject(page)
  await dropPart(page, 'AND', await onCanvas(page, 0, -160))
  const sheet = page.locator('.inspector')
  await expect(sheet).not.toHaveClass(/open/)
  const cdp = await finger(page)
  const head = (await page.locator('.sheet-head').boundingBox())!
  const x = head.x + head.width / 2
  await slide(cdp, page, { x, y: head.y + head.height / 2 }, { x, y: head.y - 100 })
  await expect(sheet).toHaveClass(/open/)
  const opened = (await page.locator('.sheet-head').boundingBox())!
  await slide(cdp, page, { x, y: opened.y + opened.height / 2 }, { x, y: opened.y + 160 })
  await expect(sheet).not.toHaveClass(/open/)
})

test('the search above the strip finds parts by what people call them', async ({ page }) => {
  await newProject(page)
  const strip = page.getByRole('navigation', { name: 'Parts' })
  await strip.getByPlaceholder('Search parts').fill('memry')
  await expect(strip.getByRole('button', { name: 'RAM', exact: true })).toBeVisible()
  await expect(strip.getByRole('button', { name: 'AND', exact: true })).toHaveCount(0)
})

test('the window of all parts adds the part tapped', async ({ page }) => {
  await newProject(page)
  await page.getByRole('button', { name: 'All parts' }).tap()
  const picker = page.getByRole('dialog', { name: 'All parts' })
  await picker.getByPlaceholder('Search parts').fill('counter')
  await picker.getByRole('button', { name: 'Counter', exact: true }).tap()
  await expect(picker).toBeHidden()
  await expect.poll(async () => (await parts(page)).map((part) => part.type)).toEqual(['counter'])
})

test('taps connect: a part then a part, a pin then a pin, and the same pins again disconnect', async ({ page }) => {
  await newProject(page)
  // Low enough that the bar over the top of the canvas leaves the pins free.
  const input = await dropPart(page, 'Input', await onCanvas(page, -100, -60))
  const gate = await dropPart(page, 'AND', await onCanvas(page, 60, -60))
  // A tap on a switch flips it, so the gate is chosen first: the order does not matter.
  const body = await partAt(page, gate)
  await page.touchscreen.tap(body.x, body.y)
  await page.getByRole('button', { name: 'Connect', exact: true }).tap()
  const face = await partAt(page, input)
  await page.touchscreen.tap(face.x, face.y)
  await expect.poll(() => wires(page)).toEqual([[`${input}:out`, `${gate}:in0`]])

  const out = await pinAt(page, input, 'out')
  const in1 = await pinAt(page, gate, 'in1')
  await page.touchscreen.tap(out.x, out.y)
  await expect(page.getByRole('group', { name: 'Connecting' })).toBeVisible()
  await page.touchscreen.tap(in1.x, in1.y)
  await expect.poll(async () => (await wires(page)).length).toBe(2)

  await page.touchscreen.tap(out.x, out.y)
  await page.touchscreen.tap(in1.x, in1.y)
  await expect.poll(() => wires(page)).toEqual([[`${input}:out`, `${gate}:in0`]])
})

test('a chosen pin lists its wires, each to disconnect', async ({ page }) => {
  await newProject(page)
  const input = await dropPart(page, 'Input', await onCanvas(page, -100, -160))
  const output = await dropPart(page, 'Output', await onCanvas(page, 80, -160))
  const out = await pinAt(page, input, 'out')
  const into = await pinAt(page, output, 'in')
  await page.touchscreen.tap(out.x, out.y)
  await page.touchscreen.tap(into.x, into.y)
  await expect.poll(async () => (await wires(page)).length).toBe(1)
  await page.touchscreen.tap(out.x, out.y)
  await page.getByRole('list', { name: 'Wires on this pin' }).getByRole('button', { name: /^Disconnect/ }).tap()
  await expect.poll(async () => (await wires(page)).length).toBe(0)
})
