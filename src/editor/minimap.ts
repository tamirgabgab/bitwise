import type { CircuitDoc } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds, docBounds } from './hitTest.ts'
import { screenToWorld, UNIT } from './view.ts'
import type { View } from './view.ts'
import { wirePath } from './wireLayout.ts'

/*
 * The overview map: the whole drawing made small, with a frame around the
 * part of it the canvas shows. Everything here is geometry; the drawing
 * itself is done by the component that owns the little canvas.
 */

/** Grid units left free around the drawing on the map. */
const PADDING = 2

/** A drawing laid out on a map of a given size, in the map's own pixels. */
export interface MinimapScene {
  /** Map pixels per grid unit. */
  readonly scale: number
  /** The grid point at the map's top left corner. */
  readonly origin: Point
  readonly parts: readonly Rect[]
  readonly wires: readonly (readonly Point[])[]
  /** The part of the drawing the canvas shows now. */
  readonly viewport: Rect
  /** False when the canvas already shows the whole drawing. */
  readonly needed: boolean
}

/** The grid rectangle a canvas of the given size shows. */
export function visibleWorld(view: View, width: number, height: number): Rect {
  const from = screenToWorld(view, 0, 0)
  const to = screenToWorld(view, width, height)
  return { x0: from.x, y0: from.y, x1: to.x, y1: to.y }
}

/**
 * Lays the drawing out on a map. The map covers the drawing and whatever
 * the canvas shows, so the frame is always on it. Undefined for an empty
 * drawing or a canvas without a size.
 */
export function minimapScene(
  doc: CircuitDoc,
  view: View,
  width: number,
  height: number,
  mapWidth: number,
  mapHeight: number,
): MinimapScene | undefined {
  const bounds = docBounds(doc)
  if (!bounds || width <= 0 || height <= 0) return undefined
  const seen = visibleWorld(view, width, height)
  const x0 = Math.min(bounds.x0 - PADDING, seen.x0)
  const y0 = Math.min(bounds.y0 - PADDING, seen.y0)
  const x1 = Math.max(bounds.x1 + PADDING, seen.x1)
  const y1 = Math.max(bounds.y1 + PADDING, seen.y1)
  const scale = Math.min(mapWidth / (x1 - x0), mapHeight / (y1 - y0))
  // What is left over goes half to each side, so the drawing sits centred.
  const origin = {
    x: x0 - (mapWidth / scale - (x1 - x0)) / 2,
    y: y0 - (mapHeight / scale - (y1 - y0)) / 2,
  }
  const place = (rect: Rect): Rect => ({
    x0: (rect.x0 - origin.x) * scale,
    y0: (rect.y0 - origin.y) * scale,
    x1: (rect.x1 - origin.x) * scale,
    y1: (rect.y1 - origin.y) * scale,
  })

  const wires: Point[][] = []
  for (const wire of Object.values(doc.wires)) {
    const path = wirePath(doc, wire)
    if (!path) continue
    wires.push(path.map((p) => ({ x: (p.x - origin.x) * scale, y: (p.y - origin.y) * scale })))
  }
  return {
    scale,
    origin,
    parts: Object.keys(doc.components).map((id) => place(componentBounds(doc, id)!)),
    wires,
    viewport: place(seen),
    needed:
      bounds.x0 < seen.x0 || bounds.y0 < seen.y0 || bounds.x1 > seen.x1 || bounds.y1 > seen.y1,
  }
}

/** The view that puts the grid point under a spot on the map mid-canvas. */
export function minimapPan(
  scene: MinimapScene,
  view: View,
  width: number,
  height: number,
  mapX: number,
  mapY: number,
): View {
  const pixels = UNIT * view.zoom
  const world = { x: scene.origin.x + mapX / scene.scale, y: scene.origin.y + mapY / scene.scale }
  return {
    zoom: view.zoom,
    panX: Math.round(width / 2 - world.x * pixels),
    panY: Math.round(height / 2 - world.y * pixels),
  }
}
