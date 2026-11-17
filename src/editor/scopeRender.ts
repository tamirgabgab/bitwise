import { X, Z } from '../core/index.ts'
import type { Recorder, ScopeSignal } from './scope.ts'
import type { CanvasTheme } from './theme.ts'
import type { ValueStyle } from './valueStyle.ts'

/** Everything one picture of the timing diagram shows. */
export interface ScopeScene {
  readonly signals: readonly ScopeSignal[]
  readonly recorder: Recorder
  /** The simulator's clock. */
  readonly time: number
  readonly radix: number
}

/** How the diagram is looked at: the zoom, where it ends, and the cursor. */
export interface ScopeView {
  /** Pixels one tick takes; one of `SCOPE_ZOOMS`. */
  readonly tickWidth: number
  /**
   * The tick at the right edge, or null to follow the simulator's clock.
   * A frozen diagram keeps its right edge while the simulation goes on.
   */
  readonly end: number | null
  /** The tick under the pointer, if it is over the traces. */
  readonly cursor: number | null
}

/** The zoom steps of the diagram, in pixels per tick. */
export const SCOPE_ZOOMS = [1, 2, 4, 8, 16, 32] as const

export const DEFAULT_SCOPE_VIEW: ScopeView = { tickWidth: 4, end: null, cursor: null }

/** Width of the column of names. */
export const SCOPE_NAMES = 88
/** Height of the strip of tick numbers along the top. */
const AXIS = 20
const PAD = 7
const FONT = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif'

/** Height of one row: taller with more values, so each level has room. */
export function scopeRowHeight(radix: number): number {
  return radix > 2 ? 44 : 30
}

/** How tall the diagram is for this many rows, in CSS pixels. */
export function scopeHeight(rows: number, radix: number): number {
  return AXIS + rows * scopeRowHeight(radix) + 4
}

/** How many ticks fit beside the names in a diagram this wide. */
export function scopeTicks(width: number, tickWidth: number): number {
  return Math.max(10, Math.floor((width - SCOPE_NAMES - 6) / tickWidth))
}

/** The first tick the diagram shows. */
export function scopeStart(time: number, width: number, view: ScopeView): number {
  const end = view.end === null ? time : Math.min(view.end, time)
  // Until the record fills the width it grows from the left, then it scrolls.
  return Math.max(0, end - scopeTicks(width, view.tickWidth))
}

/** The tick at a point `x` pixels from the left, or null over the names. */
export function scopeTickAt(x: number, time: number, width: number, view: ScopeView): number | null {
  if (x < SCOPE_NAMES) return null
  const tick = Math.round(scopeStart(time, width, view) + (x - SCOPE_NAMES) / view.tickWidth)
  return Math.min(tick, view.end ?? time, time)
}

/** The row at a point `y` pixels from the top, or null outside the rows. */
export function scopeRowAt(y: number, rows: number, radix: number): number | null {
  const row = Math.floor((y - AXIS) / scopeRowHeight(radix))
  return y < AXIS || row >= rows ? null : row
}

/** The next zoom step in or out from `tickWidth`. */
export function scopeZoom(tickWidth: number, direction: 1 | -1): number {
  const index = SCOPE_ZOOMS.findIndex((step) => step >= tickWidth)
  const at = index < 0 ? SCOPE_ZOOMS.length - 1 : index
  return SCOPE_ZOOMS[Math.max(0, Math.min(SCOPE_ZOOMS.length - 1, at + direction))]
}

/**
 * Where the right edge of the diagram goes when it is moved `direction`
 * steps through time: never past the start of the record or past `now`.
 * Null means it follows the run again.
 */
export function scopePan(end: number | null, now: number, shown: number, direction: number): number | null {
  const step = Math.max(1, Math.round(shown / 8)) * Math.sign(direction)
  const next = Math.min(now, Math.max(Math.min(shown, now), (end ?? now) + step))
  return next >= now ? null : next
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Paints the timing diagram. `width` and `height` are in CSS pixels. With a
 * value style, the traces of a radix above 2 take the colors of their values.
 */
export function renderScope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelRatio: number,
  theme: CanvasTheme,
  scene: ScopeScene,
  view: ScopeView,
  style: ValueStyle,
): void {
  const { signals, recorder, time, radix } = scene
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  const tickWidth = view.tickWidth
  const ticks = scopeTicks(width, tickWidth)
  const from = scopeStart(time, width, view)
  const to = Math.min(from + ticks, time)
  const x = (tick: number): number => SCOPE_NAMES + (tick - from) * tickWidth
  const rowHeight = scopeRowHeight(radix)

  // Tick numbers, and a faint line down the rows under each.
  ctx.font = `500 10px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  // A mark every 1, 2, 5, 10, 20, 50... ticks, whichever leaves room for its number.
  const marks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  const mark = marks.find((step) => step * tickWidth >= 36) ?? 1000
  for (let tick = Math.ceil(from / mark) * mark; tick <= from + ticks; tick += mark) {
    const at = Math.round(x(tick)) + 0.5
    ctx.strokeStyle = theme.gridDot
    ctx.lineWidth = 1
    ctx.globalAlpha = tick % (mark * 5) === 0 ? 1 : 0.45
    ctx.beginPath()
    ctx.moveTo(at, AXIS - 4)
    ctx.lineTo(at, height)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.wire
    ctx.fillText(String(tick), at, AXIS / 2)
  }

  signals.forEach((signal, index) => {
    const top = AXIS + index * rowHeight
    const low = top + rowHeight - PAD
    const high = top + PAD
    const level = (digit: number): number => low - (digit / (radix - 1)) * (low - high)
    const middle = (low + high) / 2

    ctx.strokeStyle = theme.gridDot
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, top + 0.5)
    ctx.lineTo(width, top + 0.5)
    ctx.stroke()

    // With more than two values, a faint guide for each level the trace can take.
    if (radix > 2 && radix <= 8) {
      ctx.globalAlpha = 0.35
      ctx.setLineDash([2, 4])
      for (let digit = 0; digit < radix; digit++) {
        const y = Math.round(level(digit)) + 0.5
        ctx.beginPath()
        ctx.moveTo(SCOPE_NAMES, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    ctx.font = `500 12px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillStyle = signal.kind === 'wire' ? theme.wire : theme.ink
    ctx.fillText(clip(signal.name, 11), 10, top + rowHeight / 2 + 1)

    const spans = recorder.spans(signal.key, from, Math.max(to, from + 1))
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
      const color = radix > 2 ? style.wire(span.digit, false).color : theme.ink
      if (previous !== undefined) {
        // The step from the last level, in the plain ink so the color stays with its level.
        ctx.strokeStyle = theme.ink
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x0, previous)
        ctx.lineTo(x0, y)
        ctx.stroke()
      }
      ctx.strokeStyle = color
      ctx.lineWidth = radix > 2 ? 2 : 1.5
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
      previous = y
      // With more than two values the height alone is hard to read.
      if (radix > 2 && x1 - x0 >= 14) {
        ctx.font = `600 10px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillStyle = theme.wire
        const above = span.digit < radix - 1
        ctx.fillText(style.text(span.digit), (x0 + x1) / 2, above ? y - 7 : y + 8)
      }
    }
  })

  // The names sit on their own ground, so a trace never runs under them.
  ctx.strokeStyle = theme.gridDot
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(SCOPE_NAMES - 0.5, 0)
  ctx.lineTo(SCOPE_NAMES - 0.5, height)
  ctx.stroke()

  if (view.cursor !== null && view.cursor >= from && view.cursor <= to) {
    drawCursor(ctx, x(view.cursor), view.cursor, height, theme, scene, rowHeight, style)
  }
}

/** A line down the rows at one tick, with that tick and what each row held then. */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  at: number,
  tick: number,
  height: number,
  theme: CanvasTheme,
  scene: ScopeScene,
  rowHeight: number,
  style: ValueStyle,
): void {
  const line = Math.round(at) + 0.5
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(line, AXIS)
  ctx.lineTo(line, height)
  ctx.stroke()

  // The tick, on a chip over the axis.
  ctx.font = `600 10px ${FONT}`
  ctx.textAlign = 'center'
  const label = String(tick)
  const chip = ctx.measureText(label).width + 10
  ctx.fillStyle = theme.accent
  ctx.fillRect(line - chip / 2, 2, chip, AXIS - 4)
  ctx.fillStyle = theme.background
  ctx.fillText(label, line, AXIS / 2)

  ctx.textAlign = 'left'
  scene.signals.forEach((signal, index) => {
    const value = scene.recorder.valueAt(signal.key, tick)
    if (value === undefined) return
    // A bus is kept as its digits written out already.
    const text = typeof value === 'string' ? value : style.text(value)
    const top = AXIS + index * rowHeight
    const width = ctx.measureText(text).width + 8
    ctx.fillStyle = theme.background
    ctx.globalAlpha = 0.85
    ctx.fillRect(line + 3, top + rowHeight / 2 - 7, width, 14)
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.ink
    ctx.fillText(text, line + 7, top + rowHeight / 2 + 1)
  })
}
