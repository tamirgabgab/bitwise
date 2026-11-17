import type { Point, Rect } from './geometry.ts'

/** Screen pixels per grid unit at 100% zoom. */
export const UNIT = 16

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

/** Where the canvas is looking: a pan in screen pixels and a zoom factor. */
export interface View {
  readonly panX: number
  readonly panY: number
  readonly zoom: number
}

export const DEFAULT_VIEW: View = { panX: 0, panY: 0, zoom: 1 }

export function screenToWorld(view: View, x: number, y: number): Point {
  const scale = UNIT * view.zoom
  return { x: (x - view.panX) / scale, y: (y - view.panY) / scale }
}

export function worldToScreen(view: View, p: Point): Point {
  const scale = UNIT * view.zoom
  return { x: p.x * scale + view.panX, y: p.y * scale + view.panY }
}

/** Screen pixels left free around a drawing that is fitted to the canvas. */
const FIT_MARGIN = 40

/**
 * The view that shows all of `bounds`, centred, on a canvas of the given
 * size. It zooms out as far as needed but never in past 100%.
 */
export function fitView(bounds: Rect, width: number, height: number): View {
  const spanX = Math.max(bounds.x1 - bounds.x0, 1) * UNIT
  const spanY = Math.max(bounds.y1 - bounds.y0, 1) * UNIT
  const room = (size: number): number => Math.max(size - 2 * FIT_MARGIN, 1)
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(room(width) / spanX, room(height) / spanY)))
  const scale = UNIT * zoom
  return {
    zoom,
    panX: Math.round(width / 2 - ((bounds.x0 + bounds.x1) / 2) * scale),
    panY: Math.round(height / 2 - ((bounds.y0 + bounds.y1) / 2) * scale),
  }
}

/** Zooms by `factor`, keeping the world point under screen (x, y) in place. */
export function zoomAt(view: View, factor: number, x: number, y: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
  const k = zoom / view.zoom
  return { zoom, panX: x - (x - view.panX) * k, panY: y - (y - view.panY) * k }
}

/** Screen pixels kept free between a drawing and the edge when it is moved into sight. */
const SIGHT_MARGIN = 16

/**
 * The canvas changed size from `before` to `after` (a panel opened beside or
 * below it). When all of `bounds` was in sight before, it stays in sight: the
 * view moves just enough, or zooms out to fit when the drawing no longer fits
 * at the same zoom. A drawing that was partly out of sight is left alone.
 */
export function keepInSight(
  view: View,
  bounds: Rect,
  before: { readonly width: number; readonly height: number },
  after: { readonly width: number; readonly height: number },
): View {
  const { x: left, y: top } = worldToScreen(view, { x: bounds.x0, y: bounds.y0 })
  const { x: right, y: bottom } = worldToScreen(view, { x: bounds.x1, y: bounds.y1 })
  const wasInSight = left >= 0 && top >= 0 && right <= before.width && bottom <= before.height
  if (!wasInSight) return view
  // Along one axis: the shift that brings [low, high] inside [0, size].
  if (right - left > after.width || bottom - top > after.height) {
    const fitted = fitView(bounds, after.width, after.height)
    return fitted.zoom < view.zoom ? fitted : view
  }
  const shift = (low: number, high: number, size: number): number =>
    high > size ? Math.max(size - SIGHT_MARGIN - high, -low) : 0
  const dx = shift(left, right, after.width)
  const dy = shift(top, bottom, after.height)
  return dx === 0 && dy === 0 ? view : { ...view, panX: view.panX + dx, panY: view.panY + dy }
}

/** The most a single wheel event may zoom, as pixels of scroll. About 16%. */
const MAX_WHEEL_STEP = 100

/**
 * The zoom factor for one wheel event. Line and page scrolling are turned
 * into pixels, and one event never zooms more than one notch of an ordinary
 * mouse wheel, so a coarse wheel steps evenly while a touchpad stays smooth.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pageHeight: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageHeight : deltaY
  const step = Math.max(-MAX_WHEEL_STEP, Math.min(MAX_WHEEL_STEP, pixels))
  return Math.exp(-step * 0.0015)
}
