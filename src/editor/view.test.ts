import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  UNIT,
  fitView,
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
