import { add, samePoint } from './geometry.ts'
import type { Point } from './geometry.ts'

/** One end of a wire: where it is, and which way a pin points if it is one. */
export interface RouteEnd {
  readonly pos: Point
  /** Unit vector pointing away from the component. Junctions have none. */
  readonly dir?: Point
}

type Axis = 'h' | 'v'

function axisOf(dir: Point): Axis {
  return dir.x !== 0 ? 'h' : 'v'
}

/** A row or column for a wire that has to double back between two ends. */
function detour(a: number, b: number): number {
  return a === b ? a + 2 : Math.round((a + b) / 2)
}

/**
 * Drops repeated points and points in the middle of a straight run. A run
 * that goes out and straight back along itself disappears altogether.
 */
function simplify(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    result.push(point)
    for (;;) {
      const last = result[result.length - 1]
      const middle = result[result.length - 2]
      const first = result[result.length - 3]
      if (middle && samePoint(middle, last)) {
        result.pop()
      } else if (
        first &&
        ((first.x === middle.x && middle.x === last.x) ||
          (first.y === middle.y && middle.y === last.y))
      ) {
        result.splice(result.length - 2, 1)
      } else {
        break
      }
    }
  }
  return result
}

/** `value`, kept between `a` and `b`, whichever of the two is larger. */
function between(value: number, a: number, b: number): number {
  return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b))
}

/**
 * The path of a wire between two ends, using only horizontal and vertical
 * segments on the grid. A wire leaves a pin straight out for one grid unit
 * before it turns, so it never runs back through its own component.
 *
 * Where the wire has a free middle run, `shift` moves that run sideways by
 * so many grid units. It is how two wires that would share a channel are
 * told apart. A wire with a single corner has nothing to shift.
 */
export function routeWire(a: RouteEnd, b: RouteEnd, shift = 0): Point[] {
  const start = a.dir ? add(a.pos, a.dir) : a.pos
  const end = b.dir ? add(b.pos, b.dir) : b.pos
  const startAxis = a.dir ? axisOf(a.dir) : undefined
  const endAxis = b.dir ? axisOf(b.dir) : undefined

  let middle: Point[]
  if (a.dir && startAxis !== undefined && startAxis === endAxis) {
    if (startAxis === 'h') {
      const forward = a.dir.x > 0 ? end.x >= start.x : end.x <= start.x
      if (forward) {
        const x = between(Math.round((start.x + end.x) / 2) + shift, start.x, end.x)
        middle = [
          { x, y: start.y },
          { x, y: end.y },
        ]
      } else {
        const y = detour(start.y, end.y) + shift
        middle = [
          { x: start.x, y },
          { x: end.x, y },
        ]
      }
    } else {
      const forward = a.dir.y > 0 ? end.y >= start.y : end.y <= start.y
      if (forward) {
        const y = between(Math.round((start.y + end.y) / 2) + shift, start.y, end.y)
        middle = [
          { x: start.x, y },
          { x: end.x, y },
        ]
      } else {
        const x = detour(start.x, end.x) + shift
        middle = [
          { x, y: start.y },
          { x, y: end.y },
        ]
      }
    }
  } else {
    // One corner is enough. Leave along the start's axis; if only the end
    // has a direction, turn so the wire arrives along the end's axis.
    let first: Axis
    if (startAxis !== undefined) first = startAxis
    else if (endAxis !== undefined) first = endAxis === 'h' ? 'v' : 'h'
    else first = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'h' : 'v'
    middle = [first === 'h' ? { x: end.x, y: start.y } : { x: start.x, y: end.y }]
  }
  return simplify([a.pos, start, ...middle, end, b.pos])
}
