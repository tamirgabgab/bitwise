import type { Point } from './geometry.ts'

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

/** Zooms by `factor`, keeping the world point under screen (x, y) in place. */
export function zoomAt(view: View, factor: number, x: number, y: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
  const k = zoom / view.zoom
  return { zoom, panX: x - (x - view.panX) * k, panY: y - (y - view.panY) * k }
}
