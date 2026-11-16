import { describe, expect, it } from 'vitest'
import {
  closestOnPolyline,
  closestOnSegment,
  placeRect,
  rectContainsPoint,
  rectContainsRect,
  rectFromPoints,
  rotatePoint,
  snapPoint,
} from './geometry.ts'
import type { Rotation } from './geometry.ts'

describe('rotatePoint', () => {
  it('turns clockwise on a screen where y grows downwards', () => {
    const right = { x: 1, y: 0 }
    expect(rotatePoint(right, 0)).toEqual({ x: 1, y: 0 })
    expect(rotatePoint(right, 1)).toEqual({ x: 0, y: 1 })
    expect(rotatePoint(right, 2)).toEqual({ x: -1, y: 0 })
    expect(rotatePoint(right, 3)).toEqual({ x: 0, y: -1 })
  })

  it('never produces a negative zero', () => {
    for (const turns of [0, 1, 2, 3] as Rotation[]) {
      const turned = rotatePoint({ x: 0, y: 0 }, turns)
      expect(Object.is(turned.x, 0)).toBe(true)
      expect(Object.is(turned.y, 0)).toBe(true)
    }
  })

  it('comes back to the start after four quarter turns', () => {
    let point = { x: 3, y: -2 }
    for (let i = 0; i < 4; i++) point = rotatePoint(point, 1)
    expect(point).toEqual({ x: 3, y: -2 })
  })
})

describe('closest points', () => {
  it('clamps to the ends of a segment', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(closestOnSegment({ x: 4, y: 3 }, a, b)).toEqual({ x: 4, y: 0 })
    expect(closestOnSegment({ x: -5, y: 3 }, a, b)).toEqual(a)
    expect(closestOnSegment({ x: 50, y: 3 }, a, b)).toEqual(b)
  })

  it('handles a segment of zero length', () => {
    const a = { x: 2, y: 2 }
    expect(closestOnSegment({ x: 9, y: 9 }, a, a)).toEqual(a)
  })

  it('picks the nearest stretch of a polyline', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(closestOnPolyline({ x: 12, y: 6 }, path)).toEqual({ x: 10, y: 6 })
    expect(closestOnPolyline({ x: 3, y: -1 }, path)).toEqual({ x: 3, y: 0 })
  })
})

describe('rectangles', () => {
  it('builds a rectangle from any two opposite corners', () => {
    expect(rectFromPoints({ x: 5, y: 1 }, { x: 2, y: 7 })).toEqual({ x0: 2, y0: 1, x1: 5, y1: 7 })
  })

  it('tests containment, edges included', () => {
    const rect = { x0: 0, y0: 0, x1: 4, y1: 4 }
    expect(rectContainsPoint(rect, { x: 4, y: 0 })).toBe(true)
    expect(rectContainsPoint(rect, { x: 4.1, y: 0 })).toBe(false)
    expect(rectContainsRect(rect, { x0: 1, y0: 1, x1: 4, y1: 3 })).toBe(true)
    expect(rectContainsRect(rect, { x0: 1, y0: 1, x1: 5, y1: 3 })).toBe(false)
  })

  it('places a symbol rectangle in the world, rotation included', () => {
    const bounds = { x0: -3, y0: -1.5, x1: 3, y1: 1.5 }
    expect(placeRect(bounds, { x: 10, y: 10 }, 0)).toEqual({ x0: 7, y0: 8.5, x1: 13, y1: 11.5 })
    expect(placeRect(bounds, { x: 10, y: 10 }, 1)).toEqual({ x0: 8.5, y0: 7, x1: 11.5, y1: 13 })
  })
})

describe('snapPoint', () => {
  it('rounds to the nearest grid point', () => {
    expect(snapPoint({ x: 2.4, y: 2.6 })).toEqual({ x: 2, y: 3 })
  })
})
