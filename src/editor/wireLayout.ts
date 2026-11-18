import { terminalNets } from './connectivity.ts'
import { isAnnotation, terminalEnd, terminalKey } from './document.ts'
import type { CircuitDoc, DocWire } from './document.ts'
import { placeRect, samePoint } from './geometry.ts'
import type { Point } from './geometry.ts'
import { mazeRoute } from './mazeRoute.ts'
import type { WireMark } from './mazeRoute.ts'
import { routeWire } from './routing.ts'
import { symbolOf } from './symbols.ts'

/*
 * Where every wire of a drawing runs.
 *
 * Routed one at a time, two wires often pick the same channel. They then
 * touch at a corner or lie on top of each other, and the picture suggests a
 * connection that is not there. So each wire tries a few channels and takes
 * the first one that keeps clear of the wires of other nets placed before it.
 * Wires of the same net may overlap freely: they are one node anyway.
 *
 * A wire must not run through a part either. When every simple channel does,
 * the wire is sent around the parts by a search of the grid (`mazeRoute`).
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

/** One number for a grid point: looking up a number is far quicker than a text. */
const at = (x: number, y: number): number => (x + 1048576) * 2097152 + (y + 1048576)

/**
 * The grid points the parts of a drawing cover, pins included. A wire has
 * no business there, except at its own two ends. Text labels and frames
 * are only drawing, so wires may pass them.
 */
function partCells(doc: CircuitDoc): Set<number> {
  const cells = new Set<number>()
  for (const component of Object.values(doc.components)) {
    if (isAnnotation(component.type)) continue
    const box = placeRect(symbolOf(component).bounds, component.pos, component.rotation)
    for (let x = Math.ceil(box.x0); x <= Math.floor(box.x1); x++) {
      for (let y = Math.ceil(box.y0); y <= Math.floor(box.y1); y++) cells.add(at(x, y))
    }
  }
  return cells
}

/** Calls `visit` for every grid point of a path, saying how the path passes it. */
function walk(path: Path, visit: (x: number, y: number, mark: WireMark) => void): void {
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]
    const to = path[i]
    const dx = Math.sign(to.x - from.x)
    const dy = Math.sign(to.y - from.y)
    const steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    for (let step = i === 1 ? 0 : 1; step <= steps; step++) {
      // Corners and ends are where a second wire would seem to connect.
      const inside = step > 0 && step < steps
      visit(from.x + dx * step, from.y + dy * step, inside ? (dx !== 0 ? 'h' : 'v') : 'x')
    }
  }
}

/** Whether a path runs through a part anywhere between its two ends. */
function hitsPart(path: Path, cells: ReadonlySet<number>): boolean {
  const first = path[0]
  const last = path[path.length - 1]
  let hit = false
  walk(path, (x, y) => {
    if (hit || !cells.has(at(x, y))) return
    if ((x === first.x && y === first.y) || (x === last.x && y === last.y)) return
    hit = true
  })
  return hit
}

const cache = new WeakMap<CircuitDoc, Layout>()

/** Documents are immutable, so a layout is worked out once per document. */
function layoutOf(doc: CircuitDoc): Layout {
  const cached = cache.get(doc)
  if (cached) return cached

  const nets = terminalNets(doc)
  const cells = partCells(doc)
  const placed: { readonly net: string | undefined; readonly path: Path }[] = []
  // What the wires placed so far do at each grid point, net by net.
  const marks = new Map<number, { readonly net: string | undefined; readonly mark: WireMark }[]>()
  const paths = new Map<string, Path>()
  for (const wire of Object.values(doc.wires)) {
    const from = terminalEnd(doc, wire.from)
    const to = terminalEnd(doc, wire.to)
    if (!from || !to) continue
    const net = nets.get(terminalKey(wire.from))
    const isClear = (path: Path): boolean =>
      !placed.some((other) => other.net !== net && pathsClash(path, other.path))

    // First choice: a simple channel that touches no other net and no part.
    const candidates = SHIFTS.map((shift) => routeWire(from, to, shift))
    let path = candidates.find((candidate) => isClear(candidate) && !hitsPart(candidate, cells))
    // Second: a way around whatever is in the way.
    path ??= mazeRoute(from, to, {
      blocked: (x, y) => cells.has(at(x, y)),
      wire(x, y) {
        let found: WireMark | undefined
        for (const other of marks.get(at(x, y)) ?? []) {
          if (other.net === net) continue
          if (other.mark === 'x' || (found !== undefined && found !== other.mark)) return 'x'
          found = other.mark
        }
        return found
      },
    })
    // With no way around in reach, the natural route is as good as any.
    path ??= candidates.find(isClear) ?? candidates[0]

    placed.push({ net, path })
    paths.set(wire.id, path)
    walk(path, (x, y, mark) => {
      const list = marks.get(at(x, y))
      if (list) list.push({ net, mark })
      else marks.set(at(x, y), [{ net, mark }])
    })
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

/**
 * The straight stretch of a path that passes through `pos`, its two ends in
 * the order of the path. Undefined when `pos` is not on the path.
 */
export function runAt(path: readonly Point[], pos: Point): readonly [Point, Point] | undefined {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    if (!onSegment(pos, a, path[i])) continue
    const level = a.y === path[i].y
    const inLine = (p: Point): boolean => (level ? p.y === a.y : p.x === a.x)
    let start = i - 1
    let end = i
    while (start > 0 && inLine(path[start - 1])) start--
    while (end < path.length - 1 && inLine(path[end + 1])) end++
    return [path[start], path[end]]
  }
  return undefined
}

/**
 * The points a drag at `pos` moves to bend a wire that runs along `path`:
 * both ends of the straight stretch there, or one point when they meet.
 * `level` is true when the stretch runs across. A wire leaves a pin
 * straight for one step, so a corner right at the pin would hook back:
 * the stretch starts one step in from a pin.
 */
export function bendPoints(
  wire: DocWire,
  path: readonly Point[],
  pos: Point,
): { readonly at: Point[]; readonly level: boolean } | undefined {
  const run = runAt(path, pos)
  if (!run) return undefined
  let [first, last] = run
  const level = first.y === last.y
  const step = (from: Point, to: Point): Point =>
    level
      ? { x: from.x + Math.sign(to.x - from.x), y: from.y }
      : { x: from.x, y: from.y + Math.sign(to.y - from.y) }
  const length = Math.abs(last.x - first.x) + Math.abs(last.y - first.y)
  if (length > 2 && wire.from.kind === 'pin' && samePoint(first, path[0])) {
    first = step(first, last)
  }
  if (length > 2 && wire.to.kind === 'pin' && samePoint(last, path[path.length - 1])) {
    last = step(last, first)
  }
  return { at: samePoint(first, last) ? [first] : [first, last], level }
}

/** The path a wire takes across the grid, or undefined if an end is missing. */
export function wirePath(doc: CircuitDoc, wire: DocWire): Path | undefined {
  return wirePaths(doc).get(wire.id)
}
