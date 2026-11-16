import { terminalNets } from './connectivity.ts'
import { terminalEnd, terminalKey } from './document.ts'
import type { CircuitDoc, DocWire } from './document.ts'
import { samePoint } from './geometry.ts'
import type { Point } from './geometry.ts'
import { routeWire } from './routing.ts'

/*
 * Where every wire of a drawing runs.
 *
 * Routed one at a time, two wires often pick the same channel. They then
 * touch at a corner or lie on top of each other, and the picture suggests a
 * connection that is not there. So each wire tries a few channels and takes
 * the first one that keeps clear of the wires of other nets placed before it.
 * Wires of the same net may overlap freely: they are one node anyway.
 */

/** Channels to try, nearest to the natural route first. */
const SHIFTS = [0, 1, -1, 2, -2, 3, -3]

type Path = readonly Point[]

function onSegment(p: Point, a: Point, b: Point): boolean {
  if (a.x === b.x) {
    return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  }
  return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
}

function onPath(p: Point, path: Path): boolean {
  for (let i = 1; i < path.length; i++) {
    if (onSegment(p, path[i - 1], path[i])) return true
  }
  return false
}

/** Whether two segments run along the same line for more than a point. */
function overlap(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
  if (a0.x === a1.x && b0.x === b1.x && a0.x === b0.x) {
    return (
      Math.min(Math.max(a0.y, a1.y), Math.max(b0.y, b1.y)) >
      Math.max(Math.min(a0.y, a1.y), Math.min(b0.y, b1.y))
    )
  }
  if (a0.y === a1.y && b0.y === b1.y && a0.y === b0.y) {
    return (
      Math.min(Math.max(a0.x, a1.x), Math.max(b0.x, b1.x)) >
      Math.max(Math.min(a0.x, a1.x), Math.min(b0.x, b1.x))
    )
  }
  return false
}

/**
 * Whether two paths could be mistaken for being connected: a corner of one
 * sits on the other, or they share a stretch. Crossing at right angles, away
 * from any corner, is fine and reads as two separate wires.
 */
export function pathsClash(a: Path, b: Path): boolean {
  for (let i = 1; i < a.length - 1; i++) {
    if (onPath(a[i], b)) return true
  }
  for (let i = 1; i < b.length - 1; i++) {
    if (onPath(b[i], a)) return true
  }
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (overlap(a[i - 1], a[i], b[j - 1], b[j])) return true
    }
  }
  return false
}

/** A dot where wires of one net split, and the net (see `terminalNets`). */
export interface Branch {
  readonly pos: Point
  readonly net: string | undefined
}

interface Layout {
  readonly paths: ReadonlyMap<string, Path>
  readonly branches: readonly Branch[]
  readonly branchPoints: readonly Point[]
}

/**
 * Where wires of one net part ways without a junction, as happens when two
 * wires start on the same pin: every corner of one that sits on another,
 * other than at that wire's ends.
 */
function findBranches(
  placed: readonly { readonly net: string | undefined; readonly path: Path }[],
): Branch[] {
  const branches = new Map<string, Branch>()
  for (const a of placed) {
    for (const b of placed) {
      if (a === b || a.net !== b.net) continue
      const first = b.path[0]
      const last = b.path[b.path.length - 1]
      for (let i = 1; i < a.path.length - 1; i++) {
        const corner = a.path[i]
        if (samePoint(corner, first) || samePoint(corner, last)) continue
        if (onPath(corner, b.path)) {
          branches.set(`${corner.x},${corner.y}`, { pos: corner, net: a.net })
        }
      }
    }
  }
  return [...branches.values()]
}

const cache = new WeakMap<CircuitDoc, Layout>()

/** Documents are immutable, so a layout is worked out once per document. */
function layoutOf(doc: CircuitDoc): Layout {
  const cached = cache.get(doc)
  if (cached) return cached

  const nets = terminalNets(doc)
  const placed: { readonly net: string | undefined; readonly path: Path }[] = []
  const paths = new Map<string, Path>()
  for (const wire of Object.values(doc.wires)) {
    const from = terminalEnd(doc, wire.from)
    const to = terminalEnd(doc, wire.to)
    if (!from || !to) continue
    const net = nets.get(terminalKey(wire.from))
    const isClear = (path: Path): boolean =>
      !placed.some((other) => other.net !== net && pathsClash(path, other.path))

    // With no clear channel in reach, the natural route is as good as any.
    let path = routeWire(from, to)
    for (const shift of SHIFTS) {
      const candidate = shift === 0 ? path : routeWire(from, to, shift)
      if (isClear(candidate)) {
        path = candidate
        break
      }
    }
    placed.push({ net, path })
    paths.set(wire.id, path)
  }
  const branches = findBranches(placed)
  const layout: Layout = { paths, branches, branchPoints: branches.map((branch) => branch.pos) }
  cache.set(doc, layout)
  return layout
}

/** The path of every wire, by wire id. A wire with a missing end has none. */
export function wirePaths(doc: CircuitDoc): ReadonlyMap<string, Path> {
  return layoutOf(doc).paths
}

/** The points that need a dot to show that wires of one net split there. */
export function branchPoints(doc: CircuitDoc): readonly Point[] {
  return layoutOf(doc).branchPoints
}

/** The same dots as `branchPoints`, each with the net it belongs to. */
export function wireBranches(doc: CircuitDoc): readonly Branch[] {
  return layoutOf(doc).branches
}

/** The path a wire takes across the grid, or undefined if an end is missing. */
export function wirePath(doc: CircuitDoc, wire: DocWire): Path | undefined {
  return wirePaths(doc).get(wire.id)
}
