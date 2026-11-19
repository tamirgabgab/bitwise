import { meterReadings, signalText, unpinMeter, useEditor, useSim } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { CloseIcon } from './icons.tsx'

/**
 * The meter board: large readouts pinned to the corner of the canvas, one
 * for each wire the user pinned, like a multimeter left on a probe point.
 * They stay while the selection moves elsewhere, and only for the session.
 */
export function MeterBoard() {
  const count = useSim((state) => state.meters)
  // The readings follow the simulator.
  useSim((state) => state.revision)
  const settings = useEditor((state) => state.settings)
  // The board belongs to the open circuit.
  useEditor((state) => state.active)
  if (count === 0) return null
  const readings = meterReadings()
  if (readings.length === 0) return null

  return (
    <section className="meters" aria-label={t('Meter board')}>
      {readings.map((meter) => (
        <div key={meter.key} className="meter" data-conflict={meter.conflict || undefined}>
          <div className="meter-head">
            <span className="meter-name">{meter.name}</span>
            <button
              type="button"
              className="tool meter-close"
              aria-label={t('Take {name} off the meter board', { name: meter.name })}
              title={t('Take off the board')}
              onClick={() => unpinMeter(meter.key)}
            >
              <CloseIcon />
            </button>
          </div>
          <output className="meter-value" aria-live="off">
            {signalText(meter.signal, settings, meter.format)}
          </output>
          {meter.conflict && <span className="meter-note">{t('In conflict')}</span>}
        </div>
      ))}
    </section>
  )
}
