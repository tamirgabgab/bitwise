import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, UNIT, screenToWorld, worldToScreen, zoomAt } from './view.ts'
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
