import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { dropPart, newProject, onCanvas, parts } from './helpers.ts'

const menu = async (page: import('@playwright/test').Page, row: string): Promise<void> => {
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: new RegExp(`^${row}`) }).click()
}

test('a project saved as a file opens again as a project of its own', async ({ page }) => {
  await newProject(page)
  await dropPart(page, 'Input', await onCanvas(page, -80, 0))
  await dropPart(page, 'Output', await onCanvas(page, 80, 0))

  const saving = page.waitForEvent('download')
  await menu(page, 'Save the project as a file')
  const file = await (await saving).path()
  const text = await readFile(file, 'utf8')
  expect(JSON.parse(text)).toHaveProperty('format')

  await newProject(page)
  expect(await parts(page)).toHaveLength(0)
  const choosing = page.waitForEvent('filechooser')
  await menu(page, 'Open a project file')
  await (await choosing).setFiles(file)
  await expect.poll(async () => (await parts(page)).map((part) => part.type).sort()).toEqual(['input', 'output'])
})

test('a share link carries the project into another tab', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await newProject(page)
  await dropPart(page, 'Input', await onCanvas(page, 0, 0))
  await menu(page, 'Copy a link to this project')
  // The link is packed before it is copied, so the clipboard fills a moment later.
  let link = ''
  await expect
    .poll(async () => (link = await page.evaluate(() => navigator.clipboard.readText())))
    .toMatch(/#n=.*&p=/)

  const other = await context.newPage()
  await other.goto(link)
  await expect.poll(async () => (await parts(other)).map((part) => part.type)).toEqual(['input'])
  // The address forgets the project once it is open, so a reload does not open it twice.
  await expect.poll(() => new URL(other.url()).hash).toBe('')
})
