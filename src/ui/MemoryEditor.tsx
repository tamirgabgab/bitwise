import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { addressOf, formatSignal, memoryCell, wordCount } from '../core/index.ts'
import { readPart, useEditor, useSim } from '../editor/index.ts'
import type { DocComponent } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { addressText, typedWord, wordText, wordsFromText } from './memoryWords.ts'

/** One word to type over. It takes the word when it loses focus or on Enter; Esc puts it back. */
function WordField({
  label,
  shown,
  width,
  onWord,
}: {
  label: string
  shown: string
  width: number
  onWord: (text: string) => boolean
}) {
  const [text, setText] = useState(shown)
  const [was, setWas] = useState(shown)
  // A new word from outside (undo, a paste, a new radix) replaces what is typed.
  if (shown !== was) {
    setWas(shown)
    setText(shown)
  }
  const done = (): void => {
    if (text !== shown && !onWord(text)) setText(shown)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      done()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setText(shown)
    }
  }
  return (
    <input
      className="memory-word"
      aria-label={label}
      value={text}
      size={width}
      maxLength={width}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setText(event.target.value.toUpperCase())}
      onBlur={done}
      onKeyDown={onKeyDown}
    />
  )
}

/**
 * The words of a ROM or RAM: the ones it starts from, to type over or fill
 * from a pasted text, and for a RAM what it holds now. The word the address
 * points at is ringed while the circuit runs.
 */
export function MemoryEditor({ component }: { component: DocComponent }) {
  const radix = useEditor((state) => state.settings.radix)
  useSim((state) => state.revision)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const pasteId = useId()

  const { address, width } = component.params
  const count = wordCount(address, radix)
  const reading = readPart(component.id)
  const now = component.type === 'ram' ? reading?.memory : undefined
  const pointer = reading?.pins.find((pin) => pin.port === 'a')?.signal
  const at = pointer ? addressOf(pointer, radix) : undefined
  const { setParams } = useEditor.getState()

  const put = (place: number, text: string): boolean => {
    const word = typedWord(text, width, radix)
    if (word === undefined) {
      setProblem(t('Type up to {width} digits from 0 to {top}.', { width, top: (radix - 1).toString(16).toUpperCase() }))
      return false
    }
    setProblem(null)
    if (word !== component.params[memoryCell(place)]) setParams(component.id, { [memoryCell(place)]: word })
    return true
  }

  const fill = (): void => {
    const words = wordsFromText(pasted, width, radix, count)
    if (typeof words === 'string') {
      setProblem(words)
      return
    }
    const changes: Record<string, number> = {}
    for (let place = 0; place < count; place++) changes[memoryCell(place)] = words[place] ?? 0
    setParams(component.id, changes)
    setProblem(null)
    setPasting(false)
    setPasted('')
  }

  return (
    <section className="memory-editor" aria-label={t('Contents')}>
      <h3>
        {t('Contents')} <span className="memory-count">{t('{count} words', { count })}</span>
      </h3>
      <div className="memory-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('Address')}</th>
              <th scope="col">{now ? t('Starts as') : t('Word')}</th>
              {now && <th scope="col">{t('Now')}</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, place) => {
              const name = addressText(place, address, radix)
              return (
                <tr key={place} className={place === at ? 'live' : undefined}>
                  <th scope="row">{name}</th>
                  <td>
                    <WordField
                      label={t('Word at {address}', { address: name })}
                      shown={wordText(component.params[memoryCell(place)], width, radix)}
                      width={width}
                      onWord={(text) => put(place, text)}
                    />
                  </td>
                  {now && <td className="memory-now">{now[place] ? formatSignal(now[place]) : ''}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {problem && (
        <p className="note memory-problem" role="status">
          {problem}
        </p>
      )}
      {pasting ? (
        <div className="memory-paste">
          <label htmlFor={pasteId}>{t('Words from address {address}', { address: addressText(0, address, radix) })}</label>
          <textarea
            id={pasteId}
            rows={3}
            value={pasted}
            spellCheck={false}
            placeholder="0101 1100 0011"
            onChange={(event) => setPasted(event.target.value)}
          />
          <p className="note">
            {t('Words apart by spaces, commas or lines.')}{' '}
            {t('The rest become 0; Undo brings back the old words.')}
          </p>
          <div className="memory-paste-actions">
            <button type="button" className="button button-main" onClick={fill}>
              {t('Fill the words')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setPasting(false)
                setProblem(null)
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button memory-fill" onClick={() => setPasting(true)}>
          {t('Fill from text')}
        </button>
      )}
    </section>
  )
}
