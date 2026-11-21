import { useEffect } from 'react'
import { attached, useEditor, useTapConnect, wireBetween } from '../editor/index.ts'
import type { CircuitDoc, Terminal } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { CloseIcon } from './icons.tsx'
import { partTitle, portLabel } from './probeText.ts'
import { toast } from './toasts.ts'

/** A pin as the user knows it: its part, and the pin when the part has more than one. */
function pinTitle(doc: CircuitDoc, terminal: Terminal): string {
  if (terminal.kind !== 'pin') return t('Junction')
  const part = doc.components[terminal.component]
  if (!part) return terminal.port
  const name = part.sub?.name ?? partTitle(part.type, part.label)
  return t('{part}, pin {pin}', { part: name, pin: portLabel(terminal.port) })
}

/** The pin at the other end of each wire on a terminal, with the wire. */
function wiresOn(doc: CircuitDoc, terminal: Terminal): { wire: string; other: Terminal }[] {
  const key = JSON.stringify(terminal)
  return Object.values(doc.wires).flatMap((wire) => {
    if (JSON.stringify(wire.from) === key) return [{ wire: wire.id, other: wire.to }]
    if (JSON.stringify(wire.to) === key) return [{ wire: wire.id, other: wire.from }]
    return []
  })
}

/**
 * What a connection made by taps is waiting for (`tapConnect.ts` in the
 * editor): the second tap, or which output to take when there are several.
 * A chosen pin also lists its wires, each with a button that takes it away.
 */
export function TapConnectBar() {
  const armed = useTapConnect((state) => state.armed)
  const choices = useTapConnect((state) => state.choices)
  const nothing = useTapConnect((state) => state.nothing)
  const doc = useEditor((state) => state.doc)
  const cancel = useTapConnect.getState().cancel

  useEffect(() => {
    if (!nothing) return
    toast(t('No free pin there fits. Tap a pin to choose it yourself.'))
    useTapConnect.getState().cancel()
  }, [nothing])

  if (choices) {
    return (
      <div className="tap-connect" role="group" aria-label={t('Choose the output to connect')}>
        <p>{t('Which output goes there?')}</p>
        <div className="tap-connect-choices">
          {choices.map((link) => (
            <button
              key={JSON.stringify(link)}
              type="button"
              className="button"
              onClick={() => {
                useEditor.getState().connect({ kind: 'terminal', terminal: link.from }, { kind: 'terminal', terminal: link.to })
                cancel()
              }}
            >
              {t('{from} to {to}', { from: pinTitle(doc, link.from), to: pinTitle(doc, link.to) })}
            </button>
          ))}
        </div>
        <button type="button" className="tool" aria-label={t('Cancel connecting')} title={t('Cancel connecting (Esc)')} onClick={cancel}>
          <CloseIcon />
        </button>
      </div>
    )
  }
  if (!armed) return null

  const wires = armed.kind === 'pin' && attached(doc, armed.terminal) ? wiresOn(doc, armed.terminal) : []
  return (
    <div className="tap-connect" role="group" aria-label={t('Connecting')}>
      <p>
        {armed.kind === 'pin'
          ? t('Tap another pin, or a part, to connect {pin}.', { pin: pinTitle(doc, armed.terminal) })
          : t('Tap the part to connect {part} to.', {
              part: doc.components[armed.id]?.sub?.name ?? partTitle(doc.components[armed.id]?.type ?? '', doc.components[armed.id]?.label),
            })}
      </p>
      {wires.length > 0 && armed.kind === 'pin' && (
        <ul className="tap-connect-wires" aria-label={t('Wires on this pin')}>
          {wires.map(({ wire, other }) => (
            <li key={wire}>
              <button
                type="button"
                className="button tap-connect-wire"
                aria-label={t('Disconnect {pin}', { pin: pinTitle(doc, other) })}
                title={t('Disconnect {pin}', { pin: pinTitle(doc, other) })}
                onClick={() => {
                  // The wire may be gone already, if it was taken away another way.
                  if (wireBetween(doc, armed.terminal, other) === wire) useEditor.getState().disconnect(wire)
                }}
              >
                <span>{pinTitle(doc, other)}</span>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="tool" aria-label={t('Cancel connecting')} title={t('Cancel connecting (Esc)')} onClick={cancel}>
        <CloseIcon />
      </button>
    </div>
  )
}
