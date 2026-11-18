import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { X, tableCell } from '../core/index.ts'
import {
  digitColor,
  inkOn,
  readCanvasTheme,
  readPart,
  useEditor,
  useSim,
  valueText,
} from '../editor/index.ts'
import type { DocComponent } from '../editor/index.ts'
import { nextAnswer, typedAnswer } from './tableAnswers.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

/**
 * The table of a table gate, to fill in. A click steps an answer on, a
 * Shift-click or right-click steps it back, and a key types it. The cell
 * the inputs point at now is ringed while the circuit runs.
 */
export function TableEditor({ component }: { component: DocComponent }) {
  const settings = useEditor((state) => state.settings)
  useSim((state) => state.revision)
  useResolvedTheme()
  const grid = useRef<HTMLTableElement>(null)
  const [focus, setFocus] = useState<[number, number]>([0, 0])

  const radix = settings.radix
  const inputs = component.params.inputs
  const rows = inputs === 2 ? radix : 1
  const digits = Array.from({ length: radix }, (_, digit) => digit)
  const theme = readCanvasTheme(document.documentElement)
  const { setParams } = useEditor.getState()

  // The cell the inputs choose right now, if they are all known.
  const pins = readPart(component.id)?.pins ?? []
  const now = (port: string): number => pins.find((pin) => pin.port === port)?.signal[0] ?? X
  const a = now('in0')
  const b = inputs === 2 ? now('in1') : 0
  const live = a >= 0 && a < radix && b >= 0 && b < radix ? (inputs === 2 ? [a, b] : [0, a]) : null

  const paramOf = (row: number, column: number): string =>
    inputs === 2 ? tableCell(2, row, column) : tableCell(1, column)
  const answerAt = (row: number, column: number): number => component.params[paramOf(row, column)]
  const write = (row: number, column: number, value: number): void => {
    if (answerAt(row, column) !== value) setParams(component.id, { [paramOf(row, column)]: value })
  }

  const moveFocus = (row: number, column: number): void => {
    const next: [number, number] = [
      Math.max(0, Math.min(rows - 1, row)),
      Math.max(0, Math.min(radix - 1, column)),
    ]
    setFocus(next)
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${next[0]}:${next[1]}"]`)
      ?.focus()
  }

  const onKeyDown = (event: KeyboardEvent, row: number, column: number): void => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, column],
      ArrowDown: [row + 1, column],
      ArrowLeft: [row, column - 1],
      ArrowRight: [row, column + 1],
      Home: [row, 0],
      End: [row, radix - 1],
    }
    if (event.code in moves) {
      event.preventDefault()
      moveFocus(...moves[event.code])
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const typed = typedAnswer(event.code, radix)
    if (typed === undefined) return
    event.preventDefault()
    write(row, column, typed)
    // Typing walks on to the next answer, as in a spreadsheet.
    if (column < radix - 1) moveFocus(row, column + 1)
    else if (row < rows - 1) moveFocus(row + 1, 0)
  }

  const step = (event: MouseEvent, row: number, column: number, by: number): void => {
    event.preventDefault()
    setFocus([row, column])
    write(row, column, nextAnswer(answerAt(row, column), event.shiftKey ? -by : by, radix))
  }

  const look = (digit: number): CSSProperties => {
    if (digit < 0 || digit >= radix) return {}
    const background = digitColor(digit, settings, theme)
    return { background, color: inkOn(background) }
  }
  const size = radix <= 6 ? 26 : radix <= 10 ? 19 : 12
  const [focusRow, focusColumn] = [Math.min(focus[0], rows - 1), Math.min(focus[1], radix - 1)]

  return (
    <section className="table-editor" aria-label="Table">
      <h3>Table</h3>
      <div className="table-editor-scroll" style={{ ['--cell' as string]: `${size}px` }}>
        <table ref={grid} role="grid" aria-label={inputs === 2 ? 'Answers by in0 and in1' : 'Answers by in0'}>
          <thead>
            <tr>
              <th className="table-editor-corner" scope="col">
                {inputs === 2 ? '0 \\ 1' : 'in0'}
              </th>
              {digits.map((digit) => (
                <th key={digit} scope="col">
                  {valueText(digit, settings)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                <th scope="row">{inputs === 2 ? valueText(row, settings) : 'out'}</th>
                {digits.map((column) => {
                  const digit = answerAt(row, column)
                  const shown = digit >= 0 && digit < radix ? valueText(digit, settings) : 'X'
                  const isLive = live !== null && live[0] === row && live[1] === column
                  const at = inputs === 2 ? `in0 ${valueText(row, settings)}, in1 ${valueText(column, settings)}` : `in0 ${valueText(column, settings)}`
                  return (
                    <td key={column} role="gridcell">
                      <button
                        type="button"
                        data-cell={`${row}:${column}`}
                        className={isLive ? 'table-cell live' : 'table-cell'}
                        style={look(digit)}
                        tabIndex={row === focusRow && column === focusColumn ? 0 : -1}
                        aria-label={`${at}: ${shown}`}
                        title={`${at} gives ${shown}`}
                        onClick={(event) => step(event, row, column, 1)}
                        onContextMenu={(event) => step(event, row, column, -1)}
                        onKeyDown={(event) => onKeyDown(event, row, column)}
                        onFocus={() => setFocus([row, column])}
                      >
                        {shown}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Click an answer to step it, or type a digit. X leaves it unknown.</p>
    </section>
  )
}
