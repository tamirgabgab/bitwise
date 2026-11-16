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

/** Hands `text` to the browser as a file download. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by the next task; the address is not needed after.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Lets the user pick one file and reads it as text. Resolves with null when
 * the user closes the dialog without picking.
 */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
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
      file.text().then(
        (text) => resolve({ name: file.name, text }),
        () => resolve(null),
      )
    })
    input.click()
  })
}
