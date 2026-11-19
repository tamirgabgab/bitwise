import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs'
import { t } from '../i18n/index.ts'
import { fileHooks } from '../io/index.ts'
import type { PickedFile } from '../io/index.ts'
import { openPickedProject } from './persistence.ts'

/*
 * The window of the desktop app (`src-tauri`). Only the build for it loads
 * this module (`vite build --mode desktop`). Saving and opening go through
 * the system's own file dialogs to real files instead of downloads, a
 * project is saved as a `.bitwise` file, and the file the app was opened
 * with, by a double click, is opened as a project of the list.
 */

/** The extension of a project file of the desktop app; the system opens it with the app. */
const PROJECT = 'bitwise'

/** A file of the web app's kind, as the desktop app saves it. */
function desktopName(fileName: string): string {
  return fileName.replace(/\.bitwise\.json$/i, `.${PROJECT}`)
}

/** What the dialog offers to pick, from an `accept` list such as `.json,application/json`. */
function extensionsOf(accept: string): string[] {
  const listed = accept
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('.'))
    .map((item) => item.slice(1))
  // Where a project file can be opened, so can the desktop app's own.
  return listed.includes('json') ? [PROJECT, ...listed] : listed
}

function kindOf(extension: string): string {
  if (extension === PROJECT || extension === 'json') return t('Bitwise project')
  if (extension === 'svg') return t('SVG picture')
  if (extension === 'v') return t('Verilog')
  if (extension === 'vcd') return t('VCD waves')
  return t('File')
}

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

async function saveFile(fileName: string, text: string): Promise<void> {
  const name = desktopName(fileName)
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const path = await save({
    defaultPath: name,
    filters: extension === '' ? [] : [{ name: kindOf(extension), extensions: [extension] }],
  })
  if (path) await writeTextFile(path, text)
}

async function pickFile(accept: string, maxBytes: number): Promise<PickedFile | null> {
  const extensions = extensionsOf(accept)
  const path = await open({
    multiple: false,
    directory: false,
    filters: extensions.length === 0 ? [] : [{ name: kindOf(extensions[0]), extensions }],
  })
  if (typeof path !== 'string') return null
  const name = baseName(path)
  // A file can come from anyone; a huge one is not read at all.
  if ((await stat(path)).size > maxBytes) return { name }
  return { name, text: await readTextFile(path) }
}

/** The text opened last from the system, so a file handed over twice opens once. */
let lastOpened: string | undefined

function openHanded(file: PickedFile): void {
  if (file.text !== undefined && file.text === lastOpened) return
  lastOpened = file.text
  void openPickedProject(file)
}

export function startDesktop(): void {
  fileHooks.save = (fileName, text) => void saveFile(fileName, text)
  fileHooks.pick = pickFile
  // macOS hands over a file the app is asked to open while it runs.
  void listen<PickedFile>('open-file', (event) => openHanded(event.payload))
  void invoke<PickedFile | null>('opened_file').then((file) => {
    if (file) openHanded(file)
  })
}
