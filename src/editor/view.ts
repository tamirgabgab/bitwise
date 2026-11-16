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
