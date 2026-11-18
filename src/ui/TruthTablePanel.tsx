import { useEffect, useRef } from 'react'
import type { Signal } from '../core/index.ts'
import {
  SUB_TYPE,
  describeNode,
  readPart,
  rowOf,
  signalText,
  truthTable,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { DocComponent } from '../editor/index.ts'
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
    </section>
  )
}
