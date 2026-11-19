import { Fragment, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findPreset, sandboxGates } from '../core/index.ts'
import { useEditor } from '../editor/index.ts'
import { MAX_VERILOG_LENGTH, verilogCircuits } from '../editor/verilogImport.ts'
import { pickTextFile } from '../io/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { toast } from './toasts.ts'
import { useModal } from './useModal.ts'

/** `text` with each place `{name}` that `nodes` holds replaced by its node, such as a piece of code. */
function withNodes(text: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return text
    .split(/\{(\w+)\}/)
    .map((piece, index) =>
      index % 2 === 0 ? piece : <Fragment key={index}>{Object.hasOwn(nodes, piece) ? nodes[piece] : `{${piece}}`}</Fragment>,
    )
}

/** Where the text of the window is kept between visits. It is not part of the project. */
const KEY = 'cedar-logic.verilog'

const EXAMPLE = `module half_adder (input a, input b, output sum, output carry);
  assign sum = a ^ b;
  assign carry = a & b;
endmodule`

function storedText(): string {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function keepText(text: string): void {
  try {
    if (text.trim() === '') globalThis.localStorage?.removeItem(KEY)
    else globalThis.localStorage?.setItem(KEY, text)
  } catch {
    // A full or closed storage only loses the text for the next visit.
  }
}

/** The place in a text of a line and a column, both counted from 1. */
function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n')
  let offset = 0
  for (let index = 0; index < line - 1 && index < lines.length; index++) offset += lines[index].length + 1
  return Math.min(text.length, offset + column - 1)
}

/**
 * Builds circuits from Verilog the user pastes, types or opens: one new
 * circuit of the project for each module. The open circuit stays as it is,
 * and the text is kept in the browser for the next visit.
 */
export function VerilogDialog() {
  const open = useChrome((state) => state.overlay === 'verilog')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const radix = useEditor((state) => state.settings.radix)
  const [text, setText] = useState(storedText)
  const [problem, setProblem] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  const build = (): void => {
    keepText(text)
    const state = useEditor.getState()
    const { settings } = state
    if (settings.radix !== 2) {
      setProblem(
        t('Verilog is read only at radix 2, where a digit is a bit. This project is at radix {radix}.', {
          radix: settings.radix,
        }),
      )
      return
    }
    const gates = new Set(settings.sandbox ? sandboxGates(2) : (findPreset(settings.preset)?.gates ?? []))
    const built = verilogCircuits(text, { gates, circuits: state.circuits, nextCircuit: state.nextCircuit })
    if ('problem' in built) {
      const { line, column } = built
      setProblem(
        line === undefined || column === undefined
          ? t(built.problem)
          : t('Line {line}, column {column}: {problem}', { line, column, problem: t(built.problem) }),
      )
      if (line !== undefined && column !== undefined && field.current) {
        const at = offsetOf(text, line, column)
        field.current.focus()
        field.current.setSelectionRange(at, Math.min(text.length, at + 1))
      }
      return
    }
    const refused = state.addBuiltCircuits(built.circuits, built.top)
    if (refused) {
      setProblem(t(refused.problem))
      return
    }
    setProblem(null)
    close()
    toast(
      built.circuits.length === 1
        ? t('Built “{name}” from the Verilog', { name: built.circuits[0].name })
        : t('Built {count} circuits from the Verilog', { count: built.circuits.length }),
    )
  }

  const openFile = async (): Promise<void> => {
    const file = await pickTextFile('.v,.sv,.vh,.txt,text/plain', MAX_VERILOG_LENGTH)
    if (!file) return
    if (file.text === undefined) {
      setProblem(
        t('“{name}” is longer than {max} characters, the most that is read.', {
          name: file.name,
          max: MAX_VERILOG_LENGTH.toLocaleString('en-US'),
        }),
      )
      return
    }
    // A text field counts a line end as one character, whatever the file used.
    const read = file.text.replace(/\r\n?/g, '\n')
    setText(read)
    setProblem(null)
    keepText(read)
  }

  return (
    <dialog {...modal} className="dialog expression verilog" aria-labelledby="verilog-title">
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            build()
          }}
        >
          <header className="overlay-head">
            <h2 id="verilog-title">{t('Build from Verilog')}</h2>
            <button type="button" className="tool" aria-label={t('Close')} title={t('Close (Esc)')} onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="expression-body">
            <label htmlFor="verilog-text" className="expression-label">
              {t('Verilog, one circuit for each module')}
            </label>
            <textarea
              id="verilog-text"
              ref={field}
              data-first
              className="expression-input verilog-input"
              rows={14}
              wrap="off"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              maxLength={MAX_VERILOG_LENGTH}
              placeholder={EXAMPLE}
              value={text}
              aria-invalid={problem !== null}
              aria-describedby="verilog-help verilog-problem"
              onChange={(event) => {
                setText(event.target.value)
                setProblem(null)
              }}
              onBlur={() => keepText(text)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  build()
                }
              }}
            />
            <p id="verilog-help" className="expression-help">
              {withNodes(
                t(
                  'Read: gates, modules used as parts, {assign} with operators, and {always} on a clock edge or {star}. Each operator becomes a part, and the open circuit stays as it is.',
                ),
                { assign: <code>assign</code>, always: <code>always</code>, star: <code>@(*)</code> },
              )}
              {radix !== 2 && ' '}
              {radix !== 2 && t('Verilog is read only at radix 2, and this project is at radix {radix}.', { radix })}
            </p>
            <p id="verilog-problem" className="expression-problem" aria-live="polite">
              {problem ?? ''}
            </p>
          </div>
          <footer className="dialog-actions">
            <button type="button" className="button verilog-open" onClick={() => void openFile()}>
              {t('Open a .v file')}
            </button>
            <button type="button" className="button" onClick={close}>
              {t('Cancel')}
            </button>
            <button type="submit" className="button button-main" disabled={text.trim() === ''}>
              {t('Build circuits')}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  )
}
