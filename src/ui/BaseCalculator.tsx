import { useId, useState } from 'react'
import { MAX_RADIX, MIN_RADIX } from '../core/index.ts'
import { useEditor } from '../editor/index.ts'
import { calcLines, readNumber, writeBalanced, writeInRadix } from './calculator.ts'
import type { Written } from './calculator.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { useModal } from './useModal.ts'

const RADIXES = Array.from({ length: MAX_RADIX - MIN_RADIX + 1 }, (_, index) => MIN_RADIX + index)

/** What may be typed at a radix, for the hint under a field that is wrong. */
function allowed(radix: number, written: Written): string {
  const base = written === 'decimal' ? 10 : radix
  const top = '0123456789ABCDEF'[base - 1]
  return `Use the digits 0 to ${top}, with a minus sign in front if you need one.`
}

interface OperandProps {
  name: string
  text: string
  valid: boolean
  hint: string
  first?: boolean
  onChange(text: string): void
}

/** One number to type, with its label and, once the field is left, what is wrong. */
function Operand({ name, text, valid, hint, first, onChange }: OperandProps) {
  const id = useId()
  const [left, setLeft] = useState(false)
  const wrong = left && text.trim() !== '' && !valid
  return (
    <div className="calc-operand">
      <div className="field">
        <label htmlFor={id}>{name}</label>
        <input
          id={id}
          className="calc-input"
          value={text}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-invalid={wrong}
          aria-describedby={wrong ? `${id}-hint` : undefined}
          data-first={first ? '' : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setLeft(true)}
        />
      </div>
      {wrong && (
        <p id={`${id}-hint`} className="calc-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * A small window that writes numbers in base n, in decimal and, at an odd
 * radix, in balanced form, and adds and multiplies two of them. It starts
 * at the radix of the project.
 */
export function BaseCalculator() {
  const open = useChrome((state) => state.overlay === 'calculator')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const projectRadix = useEditor((state) => state.settings.radix)
  // Null follows the project; a radix picked here stays until the project's changes.
  const [picked, setPicked] = useState<{ radix: number; project: number } | null>(null)
  const radix = picked && picked.project === projectRadix ? picked.radix : projectRadix
  const [written, setWritten] = useState<Written>('radix')
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  const valueA = readNumber(a, radix, written)
  const valueB = readNumber(b, radix, written)
  const lines = calcLines(valueA, valueB)
  const balanced = radix % 2 === 1
  const hint = allowed(radix, written)
  const show = (value: number | undefined, write: (value: number) => string | undefined): string =>
    value === undefined ? '' : (write(value) ?? '')

  return (
    <dialog {...modal} className="dialog calculator" aria-labelledby="calculator-title">
      {open && (
        <div>
          <header className="overlay-head">
            <h2 id="calculator-title">Base calculator</h2>
            <button
              type="button"
              className="tool"
              aria-label="Close the calculator"
              title="Close the calculator (Esc)"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="calc-body">
            <div className="field">
              <label htmlFor="calc-radix">Radix</label>
              <select
                id="calc-radix"
                value={radix}
                onChange={(event) => setPicked({ radix: Number(event.target.value), project: projectRadix })}
              >
                {RADIXES.map((value) => (
                  <option key={value} value={value}>
                    {value === projectRadix ? `${value}, the project's` : value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="calc-written">Type numbers in</label>
              <select
                id="calc-written"
                value={written}
                onChange={(event) => setWritten(event.target.value as Written)}
              >
                <option value="radix">Base {radix}</option>
                <option value="decimal">Decimal</option>
              </select>
            </div>
            <div className="calc-operands">
              <Operand name="A" text={a} valid={valueA !== undefined} hint={hint} first onChange={setA} />
              <Operand name="B" text={b} valid={valueB !== undefined} hint={hint} onChange={setB} />
            </div>
            <table className="calc-results">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Base {radix}</th>
                  <th scope="col">Decimal</th>
                  {balanced && <th scope="col">Balanced</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.name}>
                    <th scope="row">{line.name}</th>
                    <td>{show(line.value, (value) => writeInRadix(value, radix))}</td>
                    <td>{show(line.value, (value) => writeInRadix(value, 10))}</td>
                    {balanced && <td>{show(line.value, (value) => writeBalanced(value, radix))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!balanced && <p className="note">Balanced form needs an odd radix.</p>}
          </div>
        </div>
      )}
    </dialog>
  )
}
