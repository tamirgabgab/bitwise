import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { describeEdit, useEditor } from '../editor/index.ts'
import type { DocComponent } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { partName } from './parts.ts'
import { useModal } from './useModal.ts'

const nameOf = (part: DocComponent): string => part.sub?.name ?? partName(part.type)

/** Arrow keys move between the rows, as in a menu. */
function walkRows(event: KeyboardEvent<HTMLOListElement>): void {
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const at = rows.indexOf(document.activeElement as HTMLButtonElement)
  const to =
    event.code === 'ArrowDown'
      ? at + 1
      : event.code === 'ArrowUp'
        ? at - 1
        : event.code === 'Home'
          ? 0
          : event.code === 'End'
            ? rows.length - 1
            : undefined
  if (to === undefined) return
  event.preventDefault()
  rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus()
}

/**
 * The steps of undo of the open circuit, each by the name of its edit. A
 * click goes straight to that step; the steps after it wait for redo, as
 * after an undo, until the next edit.
 */
export function HistoryDialog() {
  const open = useChrome((state) => state.overlay === 'history')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const past = useEditor((state) => state.past)
  const doc = useEditor((state) => state.doc)
  const future = useEditor((state) => state.future)
  const circuitName = useEditor((state) => state.circuits[state.active]?.name ?? '')
  const jump = useEditor.getState().jumpHistory

  const names = useMemo(() => {
    if (!open) return []
    const steps = [...past, doc, ...future]
    return steps.map((step, index) =>
      index === 0 ? 'Start' : describeEdit(steps[index - 1], step, nameOf),
    )
  }, [open, past, doc, future])
  const now = past.length

  return (
    <dialog {...modal} className="dialog history" aria-labelledby="history-title">
      {open && (
        <div>
          <header className="overlay-head">
            <h2 id="history-title">Edit history</h2>
            <button
              type="button"
              className="tool"
              aria-label="Close the edit history"
              title="Close the edit history (Esc)"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </header>
          <p className="history-note">
            {circuitName}: pick a step to go back to it. The later steps wait for redo until your next
            edit.
          </p>
          <ol className="history-list" onKeyDown={walkRows}>
            {names.map((name, index) => (
              <li key={index}>
                <button
                  type="button"
                  className="history-row"
                  aria-current={index === now ? 'step' : undefined}
                  data-undone={index > now ? '' : undefined}
                  data-first={index === now ? '' : undefined}
                  ref={(row) => {
                    if (row && index === now) row.scrollIntoView({ block: 'nearest' })
                  }}
                  onClick={() => jump(index)}
                >
                  <span className="history-name">{name}</span>
                  {index === now && <span className="history-now">Now</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </dialog>
  )
}
