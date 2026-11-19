import { useState } from 'react'
import { describeCircuit, useEditor } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { problemName } from './parts.ts'
import { useModal } from './useModal.ts'

/**
 * The open circuit told in words: what it is made of and what each output
 * depends on. The same text is the canvas's description for a screen
 * reader; here it can be read at leisure or copied.
 */
export function DescribeDialog() {
  const open = useChrome((state) => state.overlay === 'describe')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const doc = useEditor((state) => state.doc)
  const name = useEditor((state) => state.circuits[state.active]?.name ?? '')
  const [copied, setCopied] = useState(false)
  const text = open ? describeCircuit(doc, name, problemName) : ''

  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <dialog {...modal} className="dialog describe" aria-labelledby="describe-title">
      {open && (
        <div>
          <header className="overlay-head">
            <h2 id="describe-title">{t('The circuit in words')}</h2>
            <button
              type="button"
              className="tool"
              aria-label={t('Close the description')}
              title={t('Close (Esc)')}
              onClick={() => {
                setCopied(false)
                close()
              }}
            >
              <CloseIcon />
            </button>
          </header>
          <p className="describe-text">{text}</p>
          <footer className="describe-foot">
            <span className="describe-note" aria-live="polite">
              {copied ? t('Copied.') : t('A screen reader hears the same on the canvas.')}
            </span>
            <button type="button" className="button" onClick={copy}>
              {t('Copy the text')}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  )
}
