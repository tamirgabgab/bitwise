import { useEffect, useRef } from 'react'
import { stopPresenting } from './presentation.ts'

/** How long the trail behind the laser lasts, in milliseconds. */
const TRAIL = 260
const DOT = 6

interface Mark {
  readonly x: number
  readonly y: number
  readonly t: number
}

/**
 * The pointer while presenting: an amber dot with a short fading trail over
 * the canvas, and the way out. Only the dot is drawn when the system asks
 * for less motion. Clicks go through to the canvas, so switches still work.
 */
export function LaserPointer() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const area = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !area || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let marks: Mark[] = []
    let frame = 0

    const draw = (): void => {
      frame = 0
      const ratio = window.devicePixelRatio || 1
      const { clientWidth: width, clientHeight: height } = area
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const now = performance.now()
      marks = marks.filter((mark, index) => index === marks.length - 1 || now - mark.t < TRAIL)
      if (marks.length === 0) return
      const style = getComputedStyle(canvas)
      const accent = style.getPropertyValue('--accent').trim()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = accent
      for (let i = 1; i < marks.length; i++) {
        const age = (now - marks[i].t) / TRAIL
        ctx.globalAlpha = 0.5 * (1 - age)
        ctx.lineWidth = DOT * (1 - age)
        ctx.beginPath()
        ctx.moveTo(marks[i - 1].x, marks[i - 1].y)
        ctx.lineTo(marks[i].x, marks[i].y)
        ctx.stroke()
      }
      const head = marks[marks.length - 1]
      ctx.globalAlpha = 1
      ctx.fillStyle = style.getPropertyValue('--accent-soft').trim()
      ctx.beginPath()
      ctx.arc(head.x, head.y, DOT * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(head.x, head.y, DOT, 0, Math.PI * 2)
      ctx.fill()
      // The trail fades on its own; the dot stays while the pointer rests.
      if (marks.length > 1) frame = requestAnimationFrame(draw)
    }

    const onMove = (event: PointerEvent): void => {
      const box = area.getBoundingClientRect()
      const mark = { x: event.clientX - box.left, y: event.clientY - box.top, t: performance.now() }
      marks = still ? [mark] : [...marks, mark]
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const onLeave = (): void => {
      marks = []
      if (!frame) frame = requestAnimationFrame(draw)
    }
    area.addEventListener('pointermove', onMove)
    area.addEventListener('pointerleave', onLeave)
    return () => {
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <canvas ref={ref} className="laser" aria-hidden="true" />
      <button type="button" className="button present-exit" onClick={stopPresenting}>
        Exit presentation
        <kbd>Esc</kbd>
      </button>
    </>
  )
}
