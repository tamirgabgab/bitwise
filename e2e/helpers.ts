import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

declare global {
  interface Window {
    /** Where parts are drawn: only in the build for these tests (`src/ui/e2eHook.ts`). */
    bitwise?: {
      parts(): { id: string; type: string; label?: string }[]
      wires(): string[][]
      part(id: string): Point | null
      pin(id: string, port: string): Point | null
    }
  }
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** Opens the app as someone who has taken the tour, at the home screen. */
export async function visit(page: Page, path = '/'): Promise<void> {
  await page.addInitScript(() => {
    // Once per page, so a reload keeps what the test did.
    if (sessionStorage.getItem('e2e-started')) return
    sessionStorage.setItem('e2e-started', '1')
    localStorage.setItem('cedar-logic.chrome', JSON.stringify({ tourDone: true }))
  })
  await page.goto(path)
}

/** Opens the app on a new, empty project. */
export async function newProject(page: Page): Promise<void> {
  await visit(page)
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Waits for the page to say where parts are drawn; it says so once its hook has loaded. */
async function hooked(page: Page): Promise<void> {
  await page.waitForFunction(() => window.bitwise !== undefined)
}

/** The parts of the open circuit, in the order they were added. */
export async function parts(page: Page): Promise<{ id: string; type: string; label?: string }[]> {
  await hooked(page)
  return page.evaluate(() => window.bitwise!.parts())
}

/** The wires of the open circuit, each as its two ends, `c1:out`, sorted. */
export async function wires(page: Page): Promise<string[][]> {
  await hooked(page)
  return page.evaluate(() => window.bitwise!.wires().map((ends) => [...ends].sort()))
}

/** Where a part sits on the page. */
export async function partAt(page: Page, id: string): Promise<Point> {
  await hooked(page)
  const at = await page.evaluate((part) => window.bitwise!.part(part), id)
  expect(at, `part ${id}`).not.toBeNull()
  return at!
}

/** Where a pin of a part is on the page. */
export async function pinAt(page: Page, id: string, port: string): Promise<Point> {
  await hooked(page)
  const at = await page.evaluate(([part, pin]) => window.bitwise!.pin(part, pin), [id, port])
  expect(at, `pin ${port} of ${id}`).not.toBeNull()
  return at!
}

/** The tab of a circuit of the project, by its name. */
export function circuitTab(page: Page, name: string | RegExp): Locator {
  return page.getByRole('navigation', { name: 'Circuits', exact: true }).getByRole('button', { name, exact: typeof name === 'string' })
}

/** The middle of the canvas, moved by `dx` and `dy` pixels. */
export async function onCanvas(page: Page, dx = 0, dy = 0): Promise<Point> {
  const box = await page.locator('canvas.canvas').boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x + box!.width / 2 + dx, y: box!.y + box!.height / 2 + dy }
}

/** Carries a part from the palette to a point of the canvas. */
export async function dropPart(page: Page, name: string, to: Point): Promise<string> {
  // Nothing selected, so no inspector opens over the canvas between two drops.
  await page.keyboard.press('Escape')
  const before = (await parts(page)).length
  // The last: the part's own section, not the parts used lately above it.
  const item = page.getByRole('navigation', { name: 'Parts' }).getByRole('button', { name, exact: true }).last()
  // On a phone the palette is a strip that scrolls sideways.
  await item.scrollIntoViewIfNeeded()
  const box = await item.boundingBox()
  expect(box, `palette item ${name}`).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  const after = await parts(page)
  expect(after).toHaveLength(before + 1)
  return after[after.length - 1].id
}

/** Draws a wire from one point to another with the mouse. */
export async function drawWire(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

/** What the probe bubble says with the pointer at `at`. */
export async function probe(page: Page, at: Point): Promise<string> {
  await page.mouse.move(at.x + 3, at.y + 3)
  await page.mouse.move(at.x, at.y)
  const bubble = page.locator('.probe')
  await expect(bubble).toBeVisible()
  return (await bubble.innerText()).replace(/\s+/g, ' ')
}
