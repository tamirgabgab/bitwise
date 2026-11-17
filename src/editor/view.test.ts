import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  UNIT,
  fitView,
  keepInSight,
  wheelZoomFactor,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './view.ts'
import type { View } from './view.ts'

const view: View = { panX: 120, panY: 80, zoom: 2 }

describe('view', () => {
  it('converts between screen pixels and grid units', () => {
    expect(worldToScreen(view, { x: 0, y: 0 })).toEqual({ x: 120, y: 80 })
    expect(worldToScreen(view, { x: 1, y: -1 })).toEqual({ x: 120 + 2 * UNIT, y: 80 - 2 * UNIT })
    expect(screenToWorld(view, 120 + 2 * UNIT, 80 - 2 * UNIT)).toEqual({ x: 1, y: -1 })
  })

  it('keeps the point under the pointer still while zooming', () => {
    const before = screenToWorld(view, 300, 200)
    const zoomed = zoomAt(view, 1.5, 300, 200)
    const after = screenToWorld(zoomed, 300, 200)
    expect(zoomed.zoom).toBe(3)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('stops at the zoom limits without drifting', () => {
    const far = zoomAt({ ...view, zoom: MAX_ZOOM }, 2, 10, 10)
    expect(far).toEqual({ ...view, zoom: MAX_ZOOM })
    expect(zoomAt(view, 0.0001, 0, 0).zoom).toBe(MIN_ZOOM)
  })
})

describe('fitView', () => {
  it('centres a small drawing without zooming in', () => {
    const fitted = fitView({ x0: 0, y0: 0, x1: 10, y1: 4 }, 800, 600)
    expect(fitted.zoom).toBe(1)
    expect(worldToScreen(fitted, { x: 5, y: 2 })).toEqual({ x: 400, y: 300 })
  })

  it('zooms out until a large drawing fits, with room around it', () => {
    const bounds = { x0: -10, y0: -5, x1: 110, y1: 35 }
    const fitted = fitView(bounds, 800, 600)
    expect(fitted.zoom).toBeLessThan(1)
    const topLeft = worldToScreen(fitted, { x: bounds.x0, y: bounds.y0 })
    const bottomRight = worldToScreen(fitted, { x: bounds.x1, y: bounds.y1 })
    expect(topLeft.x).toBeGreaterThanOrEqual(39)
    expect(topLeft.y).toBeGreaterThanOrEqual(39)
    expect(bottomRight.x).toBeLessThanOrEqual(761)
    expect(bottomRight.y).toBeLessThanOrEqual(561)
  })

  it('never zooms out past the limit, however large the drawing', () => {
    expect(fitView({ x0: 0, y0: 0, x1: 5000, y1: 5000 }, 800, 600).zoom).toBe(MIN_ZOOM)
  })

  it('copes with a single point and with a canvas that has no size yet', () => {
    expect(fitView({ x0: 3, y0: 3, x1: 3, y1: 3 }, 800, 600).zoom).toBe(1)
    expect(Number.isFinite(fitView({ x0: 0, y0: 0, x1: 10, y1: 10 }, 0, 0).zoom)).toBe(true)
  })
})

describe('keepInSight', () => {
  const view: View = { panX: 0, panY: 0, zoom: 1 }
  // 10 by 5 grid units: 160 by 80 pixels at 100%.
  const bounds = { x0: 20, y0: 10, x1: 30, y1: 15 }

  it('moves a drawing that was in sight back into a narrower canvas', () => {
    const moved = keepInSight(view, bounds, { width: 600, height: 400 }, { width: 400, height: 400 })
    expect(moved.panX).toBeLessThan(0)
    expect(moved.panY).toBe(0)
    const right = bounds.x1 * UNIT + moved.panX
    expect(right).toBeLessThanOrEqual(400)
    expect(bounds.x0 * UNIT + moved.panX).toBeGreaterThanOrEqual(0)
  })

  it('moves it up when the canvas gets shorter', () => {
    const moved = keepInSight(view, bounds, { width: 600, height: 400 }, { width: 600, height: 200 })
    expect(bounds.y1 * UNIT + moved.panY).toBeLessThanOrEqual(200)
  })

  it('leaves the view alone when the drawing was not all in sight', () => {
    expect(keepInSight(view, bounds, { width: 400, height: 400 }, { width: 300, height: 400 })).toBe(view)
  })

  it('zooms out when the drawing no longer fits', () => {
    const fitted = keepInSight(view, bounds, { width: 600, height: 400 }, { width: 120, height: 400 })
    expect(fitted.zoom).toBeLessThan(1)
    expect(bounds.x1 * UNIT * fitted.zoom + fitted.panX).toBeLessThanOrEqual(120)
    expect(bounds.x0 * UNIT * fitted.zoom + fitted.panX).toBeGreaterThanOrEqual(0)
  })

  it('leaves the view alone when the canvas grows', () => {
    expect(keepInSight(view, bounds, { width: 600, height: 400 }, { width: 800, height: 500 })).toBe(view)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoomFactor(-100, 0, 800)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, 0, 800)).toBeLessThan(1)
  })

  it('caps one event at one ordinary notch', () => {
    expect(wheelZoomFactor(400, 0, 800)).toBe(wheelZoomFactor(100, 0, 800))
    expect(wheelZoomFactor(-1000, 0, 800)).toBe(wheelZoomFactor(-100, 0, 800))
  })

  it('reads line and page scrolling as pixels', () => {
    expect(wheelZoomFactor(3, 1, 800)).toBe(wheelZoomFactor(48, 0, 800))
    expect(wheelZoomFactor(1, 2, 800)).toBe(wheelZoomFactor(100, 0, 800))
  })

  it('keeps a touchpad smooth', () => {
    expect(wheelZoomFactor(4, 0, 800)).toBeCloseTo(Math.exp(-0.006))
  })
})
