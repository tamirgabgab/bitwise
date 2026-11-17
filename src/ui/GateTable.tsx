import type { CSSProperties } from 'react'
import { builtinComponents, gateTable } from '../core/index.ts'
import { digitColor, inkOn, readCanvasTheme, useEditor, valueText } from '../editor/index.ts'
import { partName } from './parts.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

interface GateTableProps {
  type: string
  /** Where the part's button is on the screen. The table opens beside it. */
  anchor: { readonly top: number; readonly right: number }
}

/**
 * What a gate answers for every input at the radix of the project, each
 * answer in the color its value has on a wire.
 */
export function GateTable({ type, anchor }: GateTableProps) {
  const settings = useEditor((state) => state.settings)
  // Read again when the theme changes: the classic colors come from it.
  useResolvedTheme()
  const table = gateTable(builtinComponents.get(type), settings.radix)
  if (!table) return null
  const theme = readCanvasTheme(document.documentElement)
  const digits = Array.from({ length: settings.radix }, (_, digit) => digit)

  const cell = (digit: number): CSSProperties => {
    if (digit < 0 || digit >= settings.radix) return {}
    const background = digitColor(digit, settings, theme)
    return { background, color: inkOn(background) }
  }
  // A big table has small cells, so sixteen values still fit beside the palette.
  const size = settings.radix <= 6 ? 26 : settings.radix <= 10 ? 21 : 17
  const style: CSSProperties = {
    left: anchor.right + 10,
    top: Math.max(8, Math.min(anchor.top, window.innerHeight - (settings.radix + 3) * size - 40)),
    ['--cell' as string]: `${size}px`,
  }

  return (
    <div className="gate-table" style={style} aria-hidden="true">
      <p className="gate-table-title">
        {partName(type)} at radix {settings.radix}
      </p>
      <table>
        <thead>
          <tr>
            <th className="gate-table-corner">{table.inputs === 2 ? 'a \\ b' : 'in'}</th>
            {digits.map((digit) => (
              <th key={digit} scope="col">
                {valueText(digit, settings)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, a) => (
            <tr key={a}>
              <th scope="row">{table.inputs === 2 ? valueText(a, settings) : 'out'}</th>
              {row.map((digit, b) => (
                <td key={b} style={cell(digit)}>
                  {valueText(digit, settings)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
