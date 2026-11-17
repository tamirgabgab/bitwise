import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { Keys } from './Keys.tsx'
import { SHORTCUTS } from './shortcuts.ts'
import { useModal } from './useModal.ts'

/** The list of keyboard and mouse shortcuts, in a window over the app. */
export function ShortcutsSheet() {
  const open = useChrome((state) => state.overlay === 'shortcuts')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)

  return (
    <dialog {...modal} className="dialog shortcuts" aria-labelledby="shortcuts-title">
      {open && (
        <div className="shortcuts-box">
          <header className="overlay-head">
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
