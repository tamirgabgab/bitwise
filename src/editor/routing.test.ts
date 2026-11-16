import { describe, expect, it } from 'vitest'
import type { Point } from './geometry.ts'
import { routeWire } from './routing.ts'
import type { RouteEnd } from './routing.ts'

const RIGHT: Point = { x: 1, y: 0 }
const LEFT: Point = { x: -1, y: 0 }
const UP: Point = { x: 0, y: -1 }
const DOWN: Point = { x: 0, y: 1 }

const pinAt = (x: number, y: number, dir: Point): RouteEnd => ({ pos: { x, y }, dir })
const dotAt = (x: number, y: number): RouteEnd => ({ pos: { x, y } })
const points = (...flat: number[]): Point[] => {
  const result: Point[] = []
  for (let i = 0; i < flat.length; i += 2) result.push({ x: flat[i], y: flat[i + 1] })
  return result
}

describe('routeWire', () => {
  it('draws one straight segment between pins that face each other', () => {
    expect(routeWire(pinAt(0, 0, RIGHT), pinAt(10, 0, LEFT))).toEqual(points(0, 0, 10, 0))
  })

  it('steps sideways halfway between an output and an input', () => {
    expect(routeWire(pinAt(0, 0, RIGHT), pinAt(10, 4, LEFT))).toEqual(
      points(0, 0, 5, 0, 5, 4, 10, 4),
    )
  })

  it('moves the middle run by the shift, but never past either stub', () => {
    const from = pinAt(0, 0, RIGHT)
    const to = pinAt(10, 4, LEFT)
    expect(routeWire(from, to, 1)).toEqual(points(0, 0, 6, 0, 6, 4, 10, 4))
    expect(routeWire(from, to, -2)).toEqual(points(0, 0, 3, 0, 3, 4, 10, 4))
    expect(routeWire(from, to, 100)).toEqual(points(0, 0, 9, 0, 9, 4, 10, 4))
    expect(routeWire(from, to, -100)).toEqual(points(0, 0, 1, 0, 1, 4, 10, 4))
  })

  it('goes around when the input is behind the output', () => {
    expect(routeWire(pinAt(10, 0, RIGHT), pinAt(0, 4, LEFT))).toEqual(
      points(10, 0, 11, 0, 11, 2, -1, 2, -1, 4, 0, 4),
    )
  })

  it('leaves the row to go around when both pins are on the same row', () => {
    expect(routeWire(pinAt(10, 0, RIGHT), pinAt(0, 0, LEFT))).toEqual(
      points(10, 0, 11, 0, 11, 2, -1, 2, -1, 0, 0, 0),
    )
  })

  it('routes between vertical pins the same way, turned', () => {
    expect(routeWire(pinAt(0, 0, DOWN), pinAt(4, 10, UP))).toEqual(
      points(0, 0, 0, 5, 4, 5, 4, 10),
    )
  })

  it('uses a single corner between two junctions', () => {
    expect(routeWire(dotAt(0, 0), dotAt(5, 3))).toEqual(points(0, 0, 5, 0, 5, 3))
    expect(routeWire(dotAt(0, 0), dotAt(2, 6))).toEqual(points(0, 0, 0, 6, 2, 6))
  })

  it('leaves a pin along its axis on the way to a junction', () => {
    expect(routeWire(pinAt(0, 0, RIGHT), dotAt(5, 3))).toEqual(points(0, 0, 5, 0, 5, 3))
  })

  it('arrives at a pin along its axis when coming from a junction', () => {
    expect(routeWire(dotAt(0, 0), pinAt(5, 3, LEFT))).toEqual(points(0, 0, 0, 3, 5, 3))
  })

  it('drops a stub that the wire would only run straight back along', () => {
    expect(routeWire(pinAt(2, 3, RIGHT), dotAt(2, 9))).toEqual(points(2, 3, 2, 9))
    expect(routeWire(pinAt(2, 3, RIGHT), dotAt(-4, 3))).toEqual(points(2, 3, -4, 3))
  })

  it('uses only horizontal and vertical segments, with no repeated points', () => {
    const dirs = [RIGHT, LEFT, UP, DOWN, undefined]
    const spots = [
      { x: 0, y: 0 },
      { x: 7, y: 0 },
      { x: 0, y: -5 },
      { x: -6, y: 4 },
      { x: 1, y: 1 },
    ]
    for (const fromDir of dirs) {
      for (const toDir of dirs) {
        for (const to of spots) {
          for (const shift of [0, 1, -3]) {
            const path = routeWire(
              { pos: { x: 2, y: 3 }, dir: fromDir },
              { pos: to, dir: toDir },
              shift,
            )
            expect(path[0]).toEqual({ x: 2, y: 3 })
            expect(path[path.length - 1]).toEqual(to)
            for (let i = 1; i < path.length; i++) {
              const a = path[i - 1]
              const b = path[i]
              expect(a.x === b.x || a.y === b.y).toBe(true)
              expect(a.x === b.x && a.y === b.y).toBe(false)
            }
          }
        }
      }
    }
  })
})
