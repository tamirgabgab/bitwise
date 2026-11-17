import { useEffect, useRef } from 'react'
import { CanvasController, useEditor } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { Minimap } from './Minimap.tsx'
import { ProbeBubble } from './ProbeBubble.tsx'

export function CanvasView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const isEmpty = useEditor((state) => Object.keys(state.doc.components).length === 0)
  const isPlacing = useEditor((state) => state.placing !== null)

  useEffect(() => {
    if (!ref.current) return
    const controller = new CanvasController(ref.current)
    return () => controller.dispose()
  }, [])

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} className="canvas" tabIndex={0} aria-label="Circuit canvas" />
      {isEmpty && !isPlacing && (
        <div className="empty-hint">
          <div className="empty-card">
            <h2>This circuit is empty</h2>
            <p>Drag a part from the palette onto the canvas, or click one to add it here.</p>
            <div className="empty-actions">
              <button
                type="button"
                className="button button-main"
                onClick={() => useChrome.getState().openCommands('example')}
              >
                Browse examples
              </button>
              <button
                type="button"
                className="button"
                onClick={() => useChrome.getState().openCommands('add ')}
              >
                Search parts
              </button>
            </div>
          </div>
        </div>
      )}
      <Minimap />
      <ProbeBubble />
    </div>
  )
}
