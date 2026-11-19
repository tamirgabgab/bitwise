import { useRef, useState } from 'react'
import { MAX_EXPRESSION_LENGTH, MAX_LABEL, isExpressionError, parseExpression, useEditor } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { toast } from './toasts.ts'
import { useModal } from './useModal.ts'

/**
 * Builds a circuit from an expression the user types: a switch for each
 * variable, the fewest gates a sum of products needs, and an output. The
 * circuit is new in the project; the open one stays as it is.
 */
export function ExpressionDialog() {
  const open = useChrome((state) => state.overlay === 'expression')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const radix = useEditor((state) => state.settings.radix)
  const [text, setText] = useState('')
  const [output, setOutput] = useState('F')
  // Shown once the user leaves the field or builds, and cleared as they type.
  const [problem, setProblem] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  const parsed = text.trim() === '' ? null : parseExpression(text, radix)
  const ready = parsed !== null && !isExpressionError(parsed)

  const showProblem = (message: string, column?: number): void => {
    setProblem(column === undefined ? message : `Column ${column}: ${message}`)
    if (column !== undefined && field.current) {
      field.current.focus()
      field.current.setSelectionRange(column - 1, column)
    }
  }

  const build = (): void => {
    const result = useEditor.getState().expressionToCircuit(text, output)
    if ('problem' in result) {
      showProblem(result.problem, result.column)
      return
    }
    setProblem(null)
    close()
    toast(`Built “${useEditor.getState().circuits[result.circuit].name}” from the expression`)
  }

  const top = radix - 1
  const example = radix === 2 ? 'a & ~b | c' : `a=${top} & ~b | 1 & c`

  return (
    <dialog {...modal} className="dialog expression" aria-labelledby="expression-title">
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            build()
          }}
        >
          <header className="overlay-head">
            <h2 id="expression-title">Build from an expression</h2>
            <button type="button" className="tool" aria-label="Close" title="Close (Esc)" onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="expression-body">
            <label htmlFor="expression-text" className="expression-label">
              Expression at radix {radix}
            </label>
            <textarea
              id="expression-text"
              ref={field}
              data-first
              className="expression-input"
              rows={3}
              spellCheck={false}
              autoComplete="off"
              maxLength={MAX_EXPRESSION_LENGTH}
              placeholder={example}
              value={text}
              aria-invalid={problem !== null}
              aria-describedby="expression-help expression-problem"
              onChange={(event) => {
                setText(event.target.value)
                setProblem(null)
              }}
              onBlur={() => {
                // The caret is not moved back into the field the user left.
                if (parsed !== null && isExpressionError(parsed)) setProblem(`Column ${parsed.column}: ${parsed.message}`)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  build()
                }
              }}
            />
            <p id="expression-help" className="expression-help">
              OR <code>|</code> or <code>+</code>, XOR <code>^</code>, AND <code>&amp;</code>, <code>·</code> or side by
              side, NOT <code>~a</code> or <code>a'</code>
              {radix > 2 && (
                <>
                  , a value <code>a={top}</code>. At radix {radix} AND is the smaller value, OR the larger, NOT is{' '}
                  {top}−a and XOR the sum modulo {radix}
                </>
              )}
              .
            </p>
            <p id="expression-problem" className="expression-problem" aria-live="polite">
              {problem ??
                (ready
                  ? `${parsed.variables.length === 1 ? '1 input' : `${parsed.variables.length} inputs`}: ${parsed.variables.join(', ') || 'none'}`
                  : '')}
            </p>
            <div className="field">
              <label htmlFor="expression-output">Name of the output</label>
              <input
                id="expression-output"
                value={output}
                maxLength={MAX_LABEL}
                autoComplete="off"
                onChange={(event) => setOutput(event.target.value)}
              />
            </div>
          </div>
          <footer className="dialog-actions">
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button-main" disabled={text.trim() === ''}>
              Build circuit
            </button>
          </footer>
        </form>
      )}
    </dialog>
  )
}
