import { useEffect, useRef } from 'react'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { Keys } from './Keys.tsx'
import { SHORTCUTS } from './shortcuts.ts'

/** The list of keyboard and mouse shortcuts, in a window over the app. */
export function ShortcutsSheet() {
  const open = useChrome((state) => state.overlay === 'shortcuts')
  const ref = useRef<HTMLDialogElement>(null)
  const close = useChrome.getState().closeOverlay

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog shortcuts"
      aria-labelledby="shortcuts-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      {open && (
        <div className="shortcuts-box">
          <header className="shortcuts-head">
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <button
              type="button"
              className="tool"
              aria-label="Close the shortcuts"
              title="Close the shortcuts (Esc)"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="shortcuts-groups">
            {SHORTCUTS.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <dl>
                  {group.items.map((item) => (
                    <div key={item.does} className="shortcut">
                      <dt>
                        {item.keys.map((combo) => (
                          <Keys key={combo} combo={combo} />
                        ))}
                      </dt>
                      <dd>{item.does}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </dialog>
  )
}
