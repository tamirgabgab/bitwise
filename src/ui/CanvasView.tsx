import { useEffect, useRef } from 'react'
import { CanvasController, useEditor } from '../editor/index.ts'
import { Inspector } from './Inspector.tsx'
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
          <p>Drag a part from the left onto the canvas, or click one to add it here.</p>
        </div>
      )}
      <Inspector />
      <ProbeBubble />
    </div>
  )
}
