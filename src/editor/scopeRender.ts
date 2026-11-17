import { X, Z, digitChar } from '../core/index.ts'
import type { Recorder, ScopeSignal } from './scope.ts'
import type { CanvasTheme } from './theme.ts'

/** Everything one picture of the timing diagram shows. */
export interface ScopeScene {
  readonly signals: readonly ScopeSignal[]
  readonly recorder: Recorder
  /** The simulator's clock: the right edge of the diagram. */
  readonly time: number
  readonly radix: number
}

/** Width of the column of names. */
const NAMES = 88
/** Height of the strip of tick numbers along the top. */
const AXIS = 20
const ROW = 30
const PAD = 7
/** Pixels one tick takes. */
export const SCOPE_TICK = 4
const FONT = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif'

/** How tall the diagram is for this many rows, in CSS pixels. */
export function scopeHeight(rows: number): number {
  return AXIS + rows * ROW + 4
}

/** How many ticks fit beside the names in a diagram this wide. */
export function scopeTicks(width: number): number {
  return Math.max(10, Math.floor((width - NAMES - 6) / SCOPE_TICK))
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Paints the timing diagram. `width` and `height` are in CSS pixels. */
export function renderScope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelRatio: number,
  theme: CanvasTheme,
  scene: ScopeScene,
): void {
  const { signals, recorder, time, radix } = scene
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  const ticks = scopeTicks(width)
  // Until the record fills the width it grows from the left, then it scrolls.
  const from = Math.max(0, time - ticks)
  const x = (tick: number): number => NAMES + (tick - from) * SCOPE_TICK

  // Tick numbers, and a faint line down the rows under each.
  ctx.font = `500 10px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const mark = 10
  for (let tick = Math.ceil(from / mark) * mark; tick <= from + ticks; tick += mark) {
    const at = Math.round(x(tick)) + 0.5
    ctx.strokeStyle = theme.gridDot
    ctx.lineWidth = 1
    ctx.globalAlpha = tick % 50 === 0 ? 1 : 0.45
    ctx.beginPath()
    ctx.moveTo(at, AXIS - 4)
    ctx.lineTo(at, height)
    ctx.stroke()
    ctx.globalAlpha = 1
    if (tick % 50 === 0 || mark * SCOPE_TICK >= 40) {
      ctx.fillStyle = theme.wire
      ctx.fillText(String(tick), at, AXIS / 2)
    }
  }

  signals.forEach((signal, index) => {
    const top = AXIS + index * ROW
    const low = top + ROW - PAD
    const high = top + PAD
    const level = (digit: number): number => low - (digit / (radix - 1)) * (low - high)
    const middle = (low + high) / 2

    ctx.strokeStyle = theme.gridDot
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, top + 0.5)
    ctx.lineTo(width, top + 0.5)
    ctx.stroke()

    ctx.font = `500 12px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.ink
    ctx.fillText(clip(signal.name, 11), 10, top + ROW / 2 + 1)

    const spans = recorder.spans(signal.key, from, Math.max(time, from + 1))
    let previous: number | undefined
    for (const span of spans) {
      const x0 = x(span.from)
      const x1 = x(span.to)
      if (typeof span.digit === 'string') {
        // A bus: a closed lane with the value written in it.
        ctx.strokeStyle = theme.ink
        ctx.lineWidth = 1.5
        ctx.strokeRect(x0 + 1, high + 2, Math.max(0, x1 - x0 - 2), low - high - 4)
        if (x1 - x0 >= span.digit.length * 7 + 8) {
          ctx.font = `600 10px ${FONT}`
          ctx.textAlign = 'center'
          ctx.fillStyle = theme.ink
          ctx.fillText(span.digit, (x0 + x1) / 2, middle + 1)
        }
        previous = undefined
        continue
      }
      if (span.digit === X || span.digit >= radix) {
        // Unknown: a band over the whole height, since it could be anything.
        ctx.fillStyle = theme.signalUnknown
        ctx.globalAlpha = 0.28
        ctx.fillRect(x0, high, x1 - x0, low - high)
        ctx.globalAlpha = 1
        previous = undefined
        continue
      }
      if (span.digit === Z) {
        ctx.strokeStyle = theme.signalHiz
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x0, middle)
        ctx.lineTo(x1, middle)
        ctx.stroke()
        ctx.setLineDash([])
        previous = undefined
        continue
      }
      const y = level(span.digit)
      ctx.strokeStyle = theme.ink
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (previous !== undefined) {
        ctx.moveTo(x0, previous)
        ctx.lineTo(x0, y)
      } else {
        ctx.moveTo(x0, y)
      }
      ctx.lineTo(x1, y)
      ctx.stroke()
      previous = y
      // With more than two values the height alone is hard to read.
      if (radix > 2 && x1 - x0 >= 12) {
        ctx.font = `600 10px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillStyle = theme.wire
        const above = span.digit < radix - 1
        ctx.fillText(digitChar(span.digit), (x0 + x1) / 2, above ? y - 7 : y + 8)
      }
    }
  })

  // The names sit on their own ground, so a trace never runs under them.
  ctx.strokeStyle = theme.gridDot
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(NAMES - 0.5, 0)
  ctx.lineTo(NAMES - 0.5, height)
  ctx.stroke()
}
