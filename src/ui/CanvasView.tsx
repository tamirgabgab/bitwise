import { useEffect, useRef } from 'react'
import { CanvasController, describeCircuit, useEditor } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { MeterBoard } from './MeterBoard.tsx'
import { Minimap } from './Minimap.tsx'
import { ProbeBubble } from './ProbeBubble.tsx'
import { problemName } from './parts.ts'
import { ValueLegend } from './ValueLegend.tsx'

export function CanvasView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const isEmpty = useEditor((state) => Object.keys(state.doc.components).length === 0)
  const isPlacing = useEditor((state) => state.placing !== null)
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
        aria-label="Circuit canvas"
        aria-description={description}
      />
      {isEmpty && !isPlacing && (
        <div className="empty-hint">
          <h2 className="empty-title">This circuit is empty</h2>
          <p className="empty-line">
            Drag or click a part in the palette,{' '}
            <button
              type="button"
              className="empty-link"
              onClick={() => useChrome.getState().openCommands('example')}
            >
              browse examples
            </button>{' '}
            or{' '}
            <button
              type="button"
              className="empty-link"
              onClick={() => useChrome.getState().openCommands('add ')}
            >
              search parts
            </button>
            .
          </p>
        </div>
      )}
      <ValueLegend />
      <Minimap />
      <MeterBoard />
      <ProbeBubble />
    </div>
  )
}
