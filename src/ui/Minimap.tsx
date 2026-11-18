import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { canvasRuntime, minimapPan, minimapScene, readCanvasTheme, useEditor } from '../editor/index.ts'
import type { MinimapScene } from '../editor/index.ts'

const WIDTH = 168
const HEIGHT = 108

/**
 * A small map of the whole drawing in the corner of the canvas, with a frame
 * around what the canvas shows. It appears only while part of the drawing
 * is out of sight. Dragging on it moves the canvas there.
 */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<MinimapScene | undefined>(undefined)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let frame = 0

    const draw = (): void => {
      frame = 0
      const { doc, view } = useEditor.getState()
      const size = canvasRuntime.current?.size() ?? { width: 0, height: 0 }
      const scene = minimapScene(doc, view, size.width, size.height, WIDTH, HEIGHT)
      sceneRef.current = scene
      // Out of the way, and out of the pointer's way, while there is nothing to find.
      canvas.hidden = !scene?.needed
      if (!scene?.needed) return

      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== WIDTH * ratio) {
        canvas.width = WIDTH * ratio
        canvas.height = HEIGHT * ratio
      }
      const theme = readCanvasTheme(canvas)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      ctx.strokeStyle = theme.wire
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      for (const wire of scene.wires) {
        ctx.beginPath()
        wire.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y)
          else ctx.lineTo(point.x, point.y)
        })
        ctx.stroke()
      }
      ctx.globalAlpha = 0.75
      ctx.fillStyle = theme.ink
      for (const part of scene.parts) {
        ctx.fillRect(part.x0, part.y0, Math.max(part.x1 - part.x0, 2), Math.max(part.y1 - part.y0, 2))
      }
      ctx.globalAlpha = 1

      const { viewport } = scene
      const w = viewport.x1 - viewport.x0
      const h = viewport.y1 - viewport.y0
      ctx.fillStyle = theme.accentSoft
      ctx.fillRect(viewport.x0, viewport.y0, w, h)
      ctx.strokeStyle = theme.accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(viewport.x0 + 0.75, viewport.y0 + 0.75, Math.max(w - 1.5, 1), Math.max(h - 1.5, 1))
    }
    const request = (): void => {
      if (frame === 0) frame = requestAnimationFrame(draw)
    }

    request()
    const stop = useEditor.subscribe((state, previous) => {
      if (
        state.doc !== previous.doc ||
        state.view !== previous.view ||
        state.theme !== previous.theme ||
        state.canvasLook !== previous.canvasLook
      ) {
        request()
      }
    })
    const observer = new ResizeObserver(request)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', request)
    return () => {
      stop()
      observer.disconnect()
      scheme.removeEventListener('change', request)
      cancelAnimationFrame(frame)
    }
  }, [])

  const moveTo = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const scene = sceneRef.current
    const size = canvasRuntime.current?.size()
    if (!scene || !size) return
    const rect = event.currentTarget.getBoundingClientRect()
    const { view, setView } = useEditor.getState()
    setView(
      minimapPan(scene, view, size.width, size.height, event.clientX - rect.left, event.clientY - rect.top),
    )
  }

  return (
    <canvas
      ref={ref}
      className="minimap"
      hidden
      // The same can be done with the keyboard through "Fit to the screen".
      aria-hidden="true"
      title="Overview. Drag to move around the circuit"
      style={{ width: WIDTH, height: HEIGHT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        moveTo(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) moveTo(event)
      }}
    />
  )
}
