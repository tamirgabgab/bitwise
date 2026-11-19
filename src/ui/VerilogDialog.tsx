import { useRef, useState } from 'react'
import { findPreset, sandboxGates } from '../core/index.ts'
import { useEditor } from '../editor/index.ts'
import { MAX_VERILOG_LENGTH, verilogCircuits } from '../editor/verilogImport.ts'
import { pickTextFile } from '../io/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { toast } from './toasts.ts'
import { useModal } from './useModal.ts'

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
      setProblem(`Verilog is read only at radix 2, where a digit is a bit. This project is at radix ${settings.radix}.`)
      return
    }
    const gates = new Set(settings.sandbox ? sandboxGates(2) : (findPreset(settings.preset)?.gates ?? []))
    const built = verilogCircuits(text, { gates, circuits: state.circuits, nextCircuit: state.nextCircuit })
    if ('problem' in built) {
      const { line, column } = built
      setProblem(line === undefined || column === undefined ? built.problem : `Line ${line}, column ${column}: ${built.problem}`)
      if (line !== undefined && column !== undefined && field.current) {
        const at = offsetOf(text, line, column)
        field.current.focus()
        field.current.setSelectionRange(at, Math.min(text.length, at + 1))
      }
      return
    }
    const refused = state.addBuiltCircuits(built.circuits, built.top)
    if (refused) {
      setProblem(refused.problem)
      return
    }
    setProblem(null)
    close()
    toast(
      built.circuits.length === 1
        ? `Built “${built.circuits[0].name}” from the Verilog`
        : `Built ${built.circuits.length} circuits from the Verilog`,
    )
  }

  const openFile = async (): Promise<void> => {
    const file = await pickTextFile('.v,.sv,.vh,.txt,text/plain', MAX_VERILOG_LENGTH)
    if (!file) return
    if (file.text === undefined) {
      setProblem(`“${file.name}” is longer than ${MAX_VERILOG_LENGTH.toLocaleString('en-US')} characters, the most that is read.`)
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
            <h2 id="verilog-title">Build from Verilog</h2>
            <button type="button" className="tool" aria-label="Close" title="Close (Esc)" onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="expression-body">
            <label htmlFor="verilog-text" className="expression-label">
              Verilog, one circuit for each module
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
              Read: gates, modules used as parts, <code>assign</code> with operators, and <code>always</code> on a
              clock edge or <code>@(*)</code>. Each operator becomes a part, and the open circuit stays as it is.
              {radix !== 2 && ` Verilog is read only at radix 2, and this project is at radix ${radix}.`}
            </p>
            <p id="verilog-problem" className="expression-problem" aria-live="polite">
              {problem ?? ''}
            </p>
          </div>
          <footer className="dialog-actions">
            <button type="button" className="button verilog-open" onClick={() => void openFile()}>
              Open a .v file
            </button>
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button-main" disabled={text.trim() === ''}>
              Build circuits
            </button>
          </footer>
        </form>
      )}
    </dialog>
  )
}
