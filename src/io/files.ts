/* Files on the user's computer: saving a text as a download, picking one to open. */

/** A name that is safe to use for a file on any system. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40)
  return cleaned === '' ? fallback : cleaned
}

/**
 * Where files go and come from instead of downloads and the browser's file
 * picker: the desktop app sets these to the system's own dialogs and real
 * files (`src/ui/desktop.ts`).
 */
export const fileHooks: {
  save: ((fileName: string, text: string, type: string) => void) | null
  pick: ((accept: string, maxBytes: number) => Promise<PickedFile | null>) | null
} = { save: null, pick: null }

/** Hands `text` to the browser as a file download. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  if (fileHooks.save) {
    fileHooks.save(fileName, text, type)
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by the next task; the address is not needed after.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A file the user picked: its text, or none when it is larger than was allowed. */
export interface PickedFile {
  readonly name: string
  readonly text?: string
}

/**
 * Lets the user pick one file and reads it as text, unless it is larger than
 * `maxBytes`: a file can come from anyone, and a huge one would hang the
 * page while it is read. Resolves with null when the user closes the dialog
 * without picking.
 */
export function pickTextFile(accept: string, maxBytes: number): Promise<PickedFile | null> {
  if (fileHooks.pick) return fileHooks.pick(accept, maxBytes)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      if (file.size > maxBytes) {
        resolve({ name: file.name })
        return
      }
      file.text().then(
        (text) => resolve({ name: file.name, text }),
        () => resolve(null),
      )
    })
    input.click()
  })
}
