/*
 * Draws the pictures of the site that are not drawn by the simulator's own
 * code: the icons of the installed app, the picture shown when a link to
 * the site is pasted (`public/og.png`), the icons of the desktop app
 * (`src-tauri/icons`), and the screenshot and short film of the README. Run it after a change to how the app looks:
 *
 *   npm run build:e2e && npm run site-pictures
 *
 * It opens the build for the end-to-end tests in Chromium (the test helpers
 * need to know where parts are drawn), and turns the film into a GIF with
 * ffmpeg, which must be on the PATH.
 */
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { preview } from 'vite'
import { drawWire, dropPart, newProject, onCanvas, partAt, pinAt, visit } from '../e2e/helpers.ts'

const PORT = 4181
const SITE = `http://localhost:${PORT}/`
const INK = '#14181f'
const GLYPH = `<g fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 8h6a8 8 0 0 1 0 16h-6z" /><path d="M4 12h6M4 20h6M24 16h4" /></g>`

/** The icon on a square of its own color, the glyph at `scale` of the square. */
function squareIcon(scale: number, rounded: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 6 : 0}" fill="${INK}" />
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${GLYPH}</g></svg>`
}

async function icon(browser: Browser, svg: string, size: number, file: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>` +
      `<img src="data:image/svg+xml,${encodeURIComponent(svg)}">`,
  )
  await page.screenshot({ path: file, omitBackground: true })
  await page.close()
}

async function openExample(page: Page, name: string): Promise<void> {
  await visit(page)
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).first().click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  // The message that says so would cover the bottom of the picture.
  await page.getByRole('button', { name: 'Dismiss this message' }).click()
  await page.getByRole('button', { name: 'Timing diagram' }).click()
}

/** The picture of a pasted link: the counter running, with its timing diagram. */
async function shareImage(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light', baseURL: SITE })
  await openExample(page, 'Four-bit counter')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'public/og.png' })
  await page.close()
}

async function readmeShot(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', baseURL: SITE })
  await openExample(page, 'Four-bit counter')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'docs/pictures/app.png' })
  await page.close()
}

/** A short film: two switches, an XOR gate and a light, wired and played with. */
async function film(browser: Browser): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'bitwise-film-'))
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    colorScheme: 'light',
    baseURL: SITE,
    recordVideo: { dir: folder, size: { width: 960, height: 600 } },
  })
  const page = await context.newPage()
  await newProject(page)
  const a = await dropPart(page, 'Input', await onCanvas(page, -220, -60))
  const b = await dropPart(page, 'Input', await onCanvas(page, -220, 60))
  const gate = await dropPart(page, 'XOR', await onCanvas(page, 0, 0))
  const light = await dropPart(page, 'Output', await onCanvas(page, 220, 0))
  await drawWire(page, await pinAt(page, a, 'out'), await pinAt(page, gate, 'in0'))
  await drawWire(page, await pinAt(page, b, 'out'), await pinAt(page, gate, 'in1'))
  await drawWire(page, await pinAt(page, gate, 'out'), await pinAt(page, light, 'in'))
  await page.mouse.move(10, 10)
  for (const id of [a, b, a, b]) {
    await page.waitForTimeout(700)
    const face = await partAt(page, id)
    await page.mouse.click(face.x, face.y)
    await page.mouse.move(10, 10)
  }
  await page.waitForTimeout(900)
  await context.close()
  const video = readdirSync(folder).find((file) => file.endsWith('.webm'))!
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    join(folder, video),
    '-vf',
    'fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse',
    '-loop',
    '0',
    'docs/pictures/demo.gif',
  ])
  rmSync(folder, { recursive: true, force: true })
}

const server = await preview({ build: { outDir: 'dist-e2e' }, preview: { port: PORT, strictPort: true } })
const browser = await chromium.launch()
try {
  mkdirSync('public/icons', { recursive: true })
  await icon(browser, squareIcon(1, true), 192, 'public/icons/icon-192.png')
  await icon(browser, squareIcon(1, true), 512, 'public/icons/icon-512.png')
  // A maskable icon is cut to a circle or a squircle: the glyph keeps to the middle.
  await icon(browser, squareIcon(0.66, false), 512, 'public/icons/icon-maskable-512.png')
  await icon(browser, squareIcon(0.8, false), 180, 'public/icons/apple-touch-icon.png')
  // The desktop app draws every size it needs from one large picture.
  await icon(browser, squareIcon(1, true), 1024, 'src-tauri/app-icon.png')
  // npx is a script on Windows, so it runs through the shell, as one command.
  execSync('npx tauri icon src-tauri/app-icon.png --output src-tauri/icons', { stdio: 'inherit' })
  // The desktop app does not need the icons of the phone apps the command also draws.
  for (const folder of ['android', 'ios']) rmSync(`src-tauri/icons/${folder}`, { recursive: true, force: true })
  await shareImage(browser)
  await readmeShot(browser)
  await film(browser)
} finally {
  await browser.close()
  await new Promise<void>((done) => server.httpServer.close(() => done()))
}
