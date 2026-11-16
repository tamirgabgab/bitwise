import { useEffect, useRef } from 'react'
import { answerDialog, useDialog } from './dialogs.ts'

/**
 * Shows whatever `ask` was last called with. A native dialog keeps the focus
 * inside it and gives it back to where it was when it closes.
 */
export function DialogHost() {
  const open = useDialog((state) => state.open)
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

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-body"
      onCancel={(event) => {
        // Escape: answer through the store, which then closes the dialog.
        event.preventDefault()
        answerDialog(false)
      }}
      onClick={(event) => {
        // The dialog itself is only hit on the dimmed area around the box.
        if (event.target === event.currentTarget) answerDialog(false)
      }}
    >
      {open && (
        <div className="dialog-box">
          <h2 id="dialog-title">{open.title}</h2>
          <div id="dialog-body">
            {open.body.split('\n').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="dialog-actions">
            {open.cancel !== undefined && (
              // Backing out is the safe answer, so it is the one Enter gives
              // when the other button destroys something.
              <button
                type="button"
                className="button"
                data-first={open.danger ? '' : undefined}
                onClick={() => answerDialog(false)}
              >
                {open.cancel}
              </button>
            )}
            <button
              type="button"
              className={open.danger ? 'button button-danger' : 'button button-main'}
              data-first={open.danger ? undefined : ''}
              onClick={() => answerDialog(true)}
            >
              {open.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
