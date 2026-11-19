import { useEffect, useRef, useState } from 'react'
import type { Signal } from '../core/index.ts'
import {
  SUB_TYPE,
  describeNode,
  karnaughMap,
  readPart,
  rowOf,
  signalText,
  tableExpression,
  truthTable,
  useEditor,
  useSim,
  variableNames,
} from '../editor/index.ts'
import type { DocComponent, TruthTable } from '../editor/index.ts'
import { portLabel } from './probeText.ts'

/** What the inputs of `part` carry right now, column by column. */
function inputsNow(part: DocComponent, ports: readonly string[]): Signal[] {
  if (part.type === SUB_TYPE) {
    return ports.map((port) => describeNode({ kind: 'pin', component: part.id, port }).signal)
  }
  const pins = readPart(part.id)?.pins ?? []
  return ports.map((port) => pins.find((pin) => pin.port === port)?.signal ?? [])
}

/**
 * The truth table of the selected part, with the row its inputs are on
 * right now marked, and kept in view, as the circuit runs.
 */
export function TruthTablePanel({ part }: { part: DocComponent }) {
  const settings = useEditor((state) => state.settings)
  const circuits = useEditor((state) => state.circuits)
  useSim((state) => state.revision)
  const scroller = useRef<HTMLDivElement>(null)

  const table = truthTable(part, circuits, settings.radix)
  const live =
    table?.kind === 'table'
      ? rowOf(
          inputsNow(
            part,
            table.inputs.map((column) => column.port),
          ),
          settings.radix,
        )
      : undefined

  useEffect(() => {
    const box = scroller.current
    const row = box?.querySelector<HTMLElement>('tr.live')
    if (!box || !row) return
    // Scroll only the table, never the inspector around it.
    const top = row.offsetTop - box.querySelector('thead')!.offsetHeight
    if (top < box.scrollTop) box.scrollTop = top
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight
    }
  }, [live])

  if (!table) return null
  const name = (column: { name: string }): string =>
    part.type === SUB_TYPE ? column.name : portLabel(column.name)

  return (
    <section className="truth-table" aria-label="Truth table">
      <h3>Truth table</h3>
      {table.kind === 'none' ? (
        <p className="note">{table.reason}</p>
      ) : (
        <div className="truth-table-scroll" ref={scroller}>
          <table>
            <thead>
              <tr>
                {table.inputs.map((column, index) => (
                  <th key={column.port} scope="col" className={index === table.inputs.length - 1 ? 'last-in' : undefined}>
                    {name(column)}
                  </th>
                ))}
                {table.outputs.map((column) => (
                  <th key={column.port} scope="col">
                    {name(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr
                  key={index}
                  className={index === live ? 'live' : undefined}
                  aria-current={index === live ? 'true' : undefined}
                >
                  {row.inputs.map((signal, column) => (
                    <td key={column} className={column === row.inputs.length - 1 ? 'last-in' : undefined}>
                      {signalText(signal, settings)}
                    </td>
                  ))}
                  {row.outputs.map((signal, column) => (
                    <td key={`o${column}`} className="truth-out">
                      {signalText(signal, settings)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.kind === 'table' && <TableLogic table={table} names={table.inputs.map(name)} outNames={table.outputs.map(name)} live={live} />}
    </section>
  )
}

type Table = TruthTable & { kind: 'table' }

/**
 * Each output of a truth table as a small expression, and the Karnaugh map
 * of one of them, with the cell the inputs are on now marked.
 */
function TableLogic({
  table,
  names,
  outNames,
  live,
}: {
  table: Table
  names: readonly string[]
  outNames: readonly string[]
  live: number | undefined
}) {
  const settings = useEditor((state) => state.settings)
  const [chosen, setChosen] = useState(0)
  const radix = settings.radix
  const output = Math.min(chosen, table.outputs.length - 1)
  const written = table.outputs.map((_, index) => tableExpression(table, index, radix, names))
  const single = table.inputs.every((column) => column.width === 1)
  const map = single && table.outputs[output].width === 1 ? karnaughMap(table.inputs.length, radix) : undefined
  const variables = variableNames(names)
  const outputName = (index: number): string => variableNames([...names, outNames[index]])[names.length]

  return (
    <>
      <h3>Expression</h3>
      {written.every((item) => item.kind === 'none') ? (
        <p className="note">{(written[0] as { reason: string }).reason}</p>
      ) : (
        <ul className="truth-expressions">
          {written.map((item, index) =>
            item.kind === 'expression' ? (
              <li key={table.outputs[index].port}>
                <span className="truth-expression-name">{outputName(index)} =</span> <code>{item.text}</code>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {map?.kind === 'map' && (
        <details className="karnaugh">
          <summary>Karnaugh map</summary>
          {table.outputs.length > 1 && (
            <div className="field">
              <label htmlFor="karnaugh-output">Output</label>
              <select id="karnaugh-output" value={output} onChange={(event) => setChosen(Number(event.target.value))}>
                {table.outputs.map((column, index) =>
                  column.width === 1 ? (
                    <option key={column.port} value={index}>
                      {outputName(index)}
                    </option>
                  ) : null,
                )}
              </select>
            </div>
          )}
          <table aria-label={`Karnaugh map of ${outputName(output)}`}>
            <thead>
              <tr>
                <th scope="col" className="karnaugh-corner">
                  {variables.slice(0, map.rowInputs).join(' ')} \ {variables.slice(map.rowInputs).join(' ')}
                </th>
                {map.columns.map((code) => (
                  <th key={code.join()} scope="col">
                    {code.map((digit) => digit.toString(radix).toUpperCase()).join('')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {map.cells.map((cells, row) => (
                <tr key={map.rows[row].join()}>
                  <th scope="row">{map.rows[row].map((digit) => digit.toString(radix).toUpperCase()).join('')}</th>
                  {cells.map((cell) => (
                    <td key={cell} className={cell === live ? 'live' : undefined}>
                      {signalText(table.rows[cell].outputs[output], settings)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  )
}
