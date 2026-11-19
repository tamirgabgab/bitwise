import { useEffect, useRef } from 'react'
import { CanvasController, describeCircuit, useEditor } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { MeterBoard } from './MeterBoard.tsx'
import { Minimap } from './Minimap.tsx'
import { ProbeBubble } from './ProbeBubble.tsx'
import { LaserPointer } from './LaserPointer.tsx'
import { problemName } from './parts.ts'
import { ValueLegend } from './ValueLegend.tsx'

export function CanvasView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const isEmpty = useEditor((state) => Object.keys(state.doc.components).length === 0)
  const isPlacing = useEditor((state) => state.placing !== null)
  const presenting = useChrome((state) => state.presenting)
  // What a screen reader hears of the drawing: the circuit in words.
  const description = useEditor((state) =>
    describeCircuit(state.doc, state.circuits[state.active]?.name ?? '', problemName),
  )

  useEffect(() => {
    if (!ref.current) return
    const controller = new CanvasController(ref.current)
    return () => controller.dispose()
  }, [])

  return (
    <div className="canvas-wrap">
      <canvas
        ref={ref}
        className="canvas"
        tabIndex={0}
        aria-label={t('Circuit canvas')}
        aria-description={description}
      />
      {isEmpty && !isPlacing && (
        <div className="empty-hint">
          <h2 className="empty-title">{t('This circuit is empty')}</h2>
          <p className="empty-line">
            {t('Drag or click a part in the palette, {examples} or {search}.')
              .split(/(\{\w+\})/)
              .map((piece, index) =>
                piece === '{examples}' ? (
                  <button
                    key={index}
                    type="button"
                    className="empty-link"
                    onClick={() => useChrome.getState().openCommands(t('example'))}
                  >
                    {t('browse examples')}
                  </button>
                ) : piece === '{search}' ? (
                  <button
                    key={index}
                    type="button"
                    className="empty-link"
                    onClick={() => useChrome.getState().openCommands(t('add '))}
                  >
                    {t('search parts')}
                  </button>
                ) : (
                  piece
                ),
              )}
          </p>
        </div>
      )}
      <ValueLegend />
      <Minimap />
      {presenting && <LaserPointer />}
      <MeterBoard />
      <ProbeBubble />
    </div>
  )
}
