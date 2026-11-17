import type { Point } from './geometry.ts'

/** What the rest of the app may ask of the canvas that is on screen. */
export interface CanvasRuntime {
  /** The grid point under a window position, or null if it is off the canvas. */
  clientToGrid(clientX: number, clientY: number): Point | null
  /** The grid point at the middle of the visible canvas. */
  gridCenter(): Point
  /** The middle of the visible canvas, in the canvas's own pixels. */
  screenCenter(): { x: number; y: number }
  /** How large the canvas is on screen, in its own pixels. */
  size(): { width: number; height: number }
  /** The open circuit as an SVG picture, in the colors on screen. */
  svg(): string
}

/** Set while a canvas is mounted. */
export const canvasRuntime: { current: CanvasRuntime | null } = { current: null }
