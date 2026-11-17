import { add } from './geometry.ts'
import type { Point } from './geometry.ts'
import { simplify } from './routing.ts'
import type { RouteEnd } from './routing.ts'

/*
 * A wire that finds its way around things. The simple routes of `routing.ts`
 * know nothing of what lies between the two ends; when all of them run
 * through a part, this search takes over. It walks the grid from one end to
 * the other, around every blocked square, and prefers a short path with few
 * corners.
 */

/**
 * What another wire does at a grid point: runs across it left to right
 * ('h'), top to bottom ('v'), or turns, ends or crosses there ('x').
 */
export type WireMark = 'h' | 'v' | 'x'

export interface Terrain {
  /** A square no wire may enter: the body of a part. */
  blocked(x: number, y: number): boolean
  /** A wire of another net at this point, if there is one. */
  wire(x: number, y: number): WireMark | undefined
}

/** How far outside the box around its two ends a wire may wander. */
const MARGIN = 12
/** Searching a larger area than this many squares is not worth the wait. */
const MAX_AREA = 40000
/** A search that has looked at this many places gives up: the wire is boxed in. */
const MAX_VISITS = 20000
/** What a corner costs, in grid steps: a longer path is better than a crooked one. */
const BEND = 3
/** What crossing another wire costs. */
const CROSS = 2

const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

// The search keeps its notes in these between calls: clearing three large
// arrays for every wire would cost more than the search itself. `round`
// says which notes belong to the search going on.
let cost = new Int32Array(0)
let parent = new Int32Array(0)
let seen = new Int32Array(0)
let closed = new Int32Array(0)
let round = 0

function heading(dir: Point): number {
  return dir.x > 0 ? 0 : dir.y > 0 ? 1 : dir.x < 0 ? 2 : 3
}

/**
 * The cheapest path between two ends that enters no blocked square, never
 * runs along a wire of another net and never turns on one. It may cross
 * such a wire at a right angle. A wire leaves a pin straight out and arrives
 * at one straight in. Returns undefined when there is no such path nearby.
 */
export function mazeRoute(a: RouteEnd, b: RouteEnd, terrain: Terrain): Point[] | undefined {
  const start = a.dir ? add(a.pos, a.dir) : a.pos
  const goal = b.dir ? add(b.pos, b.dir) : b.pos
  const x0 = Math.min(start.x, goal.x) - MARGIN
  const y0 = Math.min(start.y, goal.y) - MARGIN
  const width = Math.abs(start.x - goal.x) + 2 * MARGIN + 1
  const height = Math.abs(start.y - goal.y) + 2 * MARGIN + 1
  if (width * height > MAX_AREA) return undefined

  // A state is a square and the way the wire was heading when it got there.
  const stateOf = (x: number, y: number, d: number): number =>
    ((y - y0) * width + (x - x0)) * 4 + d
  const states = width * height * 4
  if (cost.length < states) {
    cost = new Int32Array(states)
    parent = new Int32Array(states)
    seen = new Int32Array(states)
    closed = new Int32Array(states)
    round = 0
  }
  round++

  // States wait in a list per estimate: what the path cost so far plus the
  // steps still to go at the very least. The numbers are small and whole.
  const buckets: number[][] = []
  const push = (x: number, y: number, d: number, at: number, from: number): void => {
    const state = stateOf(x, y, d)
    if (seen[state] === round && cost[state] <= at) return
    seen[state] = round
    cost[state] = at
    parent[state] = from
    const estimate = at + Math.abs(goal.x - x) + Math.abs(goal.y - y)
    ;(buckets[estimate] ??= []).push(state)
  }

  if (a.dir) push(start.x, start.y, heading(a.dir), 0, -1)
  else for (let d = 0; d < 4; d++) push(start.x, start.y, d, 0, -1)

  // Arriving at a pin, the last step goes into the part, against its direction.
  const inward = b.dir ? (heading(b.dir) + 2) % 4 : -1
  let best = -1
  let bestCost = Infinity
  let visits = 0

  for (let estimate = 0; estimate < buckets.length && estimate < bestCost; estimate++) {
    const bucket = buckets[estimate]
    if (!bucket) continue
    if (visits > MAX_VISITS) break
    for (let i = 0; i < bucket.length; i++) {
      const state = bucket[i]
      if (closed[state] === round) continue
      closed[state] = round
      visits++
      const at = cost[state]
      const d = state % 4
      const cell = (state - d) / 4
      const x = x0 + (cell % width)
      const y = y0 + Math.floor(cell / width)

      if (x === goal.x && y === goal.y) {
        // Coming out of the part the wire is going into makes no sense.
        if (inward === -1 || d !== (inward + 2) % 4) {
          const total = at + (inward !== -1 && d !== inward ? BEND : 0)
          if (total < bestCost) {
            bestCost = total
            best = state
          }
        }
        continue
      }

      const here = terrain.wire(x, y)
      for (let next = 0; next < 4; next++) {
        if (next === (d + 2) % 4) continue
        // On another wire the only way is straight across.
        if (here !== undefined && next !== d) continue
        const nx = x + DX[next]
        const ny = y + DY[next]
        if (nx < x0 || ny < y0 || nx >= x0 + width || ny >= y0 + height) continue
        const atGoal = nx === goal.x && ny === goal.y
        let step = 1 + (next === d ? 0 : BEND)
        if (!atGoal) {
          if (terrain.blocked(nx, ny)) continue
          const mark = terrain.wire(nx, ny)
          if (mark !== undefined) {
            const along = mark === 'x' || (mark === 'h') === (DX[next] !== 0)
            if (along) continue
            step += CROSS
          }
        }
        push(nx, ny, next, at + step, state)
      }
    }
  }
  if (best === -1) return undefined

  const cells: Point[] = []
  for (let state = best; state !== -1; state = parent[state]) {
    const cell = (state - (state % 4)) / 4
    cells.push({ x: x0 + (cell % width), y: y0 + Math.floor(cell / width) })
  }
  cells.reverse()
  return simplify([a.pos, ...cells, b.pos])
}
