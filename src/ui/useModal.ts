import { useEffect, useRef } from 'react'
import type { MouseEvent, SyntheticEvent } from 'react'

/**
 * What a native `<dialog>` needs to be a modal window while `open` is true:
 * spread the result on it. Escape calls `close`, and so does a click on the
 * dimmed area around the box unless `backdrop` is false. The store that owns
 * `open` then closes the window. On opening, the element marked `data-first`
 * takes the focus, if there is one; on closing, the browser gives the focus
 * back to where it was.
 */
export function useModal(open: boolean, close: () => void, backdrop = true) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-first]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return {
    ref,
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault()
      close()
    },
    onClick: backdrop
      ? (event: MouseEvent<HTMLDialogElement>) => {
          // The dialog itself is only hit on the dimmed area around the box.
          if (event.target === event.currentTarget) close()
        }
      : undefined,
  }
}
