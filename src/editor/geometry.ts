/** A position in grid units. Pins and junctions always sit on whole numbers. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** Quarter turns clockwise, as seen on screen (y grows downwards). */
export type Rotation = 0 | 1 | 2 | 3

export interface Rect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function snapPoint(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

export function rotatePoint(p: Point, turns: Rotation): Point {
  // "0 - n" instead of "-n" so a zero coordinate never becomes -0.
  switch (turns) {
    case 0:
      return p
    case 1:
      return { x: 0 - p.y, y: p.x }
    case 2:
      return { x: 0 - p.x, y: 0 - p.y }
    default:
      return { x: p.y, y: 0 - p.x }
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** The point of segment a-b that lies closest to p. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

/** The point of a polyline that lies closest to p. */
export function closestOnPolyline(p: Point, points: readonly Point[]): Point {
  let best = points[0]
  let bestDistance = distance(p, best)
  for (let i = 1; i < points.length; i++) {
    const candidate = closestOnSegment(p, points[i - 1], points[i])
    const candidateDistance = distance(p, candidate)
    if (candidateDistance < bestDistance) {
      best = candidate
      bestDistance = candidateDistance
    }
  }
  return best
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  }
}

export function rectContainsPoint(rect: Rect, p: Point): boolean {
  return p.x >= rect.x0 && p.x <= rect.x1 && p.y >= rect.y0 && p.y <= rect.y1
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1
  )
}

/** A rectangle given in a component's own coordinates, placed in the world. */
export function placeRect(rect: Rect, pos: Point, rotation: Rotation): Rect {
  const a = add(pos, rotatePoint({ x: rect.x0, y: rect.y0 }, rotation))
  const b = add(pos, rotatePoint({ x: rect.x1, y: rect.y1 }, rotation))
  return rectFromPoints(a, b)
}
