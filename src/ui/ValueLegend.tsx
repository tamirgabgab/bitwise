import { useEditor, valueText } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { swatchStyle } from './swatch.ts'

/**
 * A key to the wire colors in the corner of the canvas: one chip per value,
 * and how a floating, an unknown and a fought-over wire are drawn. It is
 * there when a wire can carry more than two values, which is when the
 * colors stop being obvious.
 */
export function ValueLegend() {
  const settings = useEditor((state) => state.settings)
  const hasParts = useEditor((state) => Object.keys(state.doc.components).length > 0)
  if (settings.radix <= 2 || !hasParts) return null

  return (
    <aside className="legend" aria-label={t('Wire colors')}>
      <ul className="legend-values">
        {Array.from({ length: settings.radix }, (_, digit) => (
          <li key={digit} className="legend-chip" style={swatchStyle(settings, digit)}>
            {valueText(digit, settings)}
          </li>
        ))}
      </ul>
      <ul className="legend-lines">
        <li>
          <span className="legend-line legend-floating" />
          {t('Floating')}
        </li>
        <li>
          <span className="legend-line legend-unknown" />
          {t('Unknown')}
        </li>
        <li>
          <span className="legend-line legend-conflict" />
          {t('Conflict')}
        </li>
      </ul>
    </aside>
  )
}
