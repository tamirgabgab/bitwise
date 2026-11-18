import type { CircuitDoc } from './document.ts'
import { add, rotatePoint } from './geometry.ts'
import type { Point, Rect } from './geometry.ts'
import { componentBounds } from './hitTest.ts'
import { symbolOf } from './symbols.ts'

/*
 * Alignment guides: while parts are dragged, thin lines show where they
 * line up with the parts that stay put. A guide appears when the box of
 * what moves shares an edge or a middle line with another part, and when a
 * pin of a moving part sits on the same row or column as a pin of another,
 * so a wire between them can run straight.
 */

/**
 * One guide line. With `axis` 'x' it is upright, at x = `at`, from y =
 * `from` to y = `to`; with 'y' it lies flat, at y = `at`.
 */
export interface Guide {
  readonly axis: 'x' | 'y'
  readonly at: number
  readonly from: number
  readonly to: number
}

/** Something to line up by: a value on one axis, and the stretch it covers on the other. */
interface Mark {
  readonly at: number
  readonly from: number
  readonly to: number
}

interface Marks {
  /** Upright lines: left edges, middles, right edges and pin columns. */
  readonly x: Mark[]
  /** Flat lines: top edges, middles, bottom edges and pin rows. */
  readonly y: Mark[]
}

function boxMarks(box: Rect, marks: Marks): void {
  for (const x of [box.x0, (box.x0 + box.x1) / 2, box.x1]) marks.x.push({ at: x, from: box.y0, to: box.y1 })
  for (const y of [box.y0, (box.y0 + box.y1) / 2, box.y1]) marks.y.push({ at: y, from: box.x0, to: box.x1 })
}

function pinsOf(doc: CircuitDoc, id: string): Point[] {
  const part = doc.components[id]
  return symbolOf(part).pins.map((pin) => add(part.pos, rotatePoint(pin.pos, part.rotation)))
}

function pinMarks(pins: readonly Point[], marks: Marks): void {
  for (const pin of pins) {
    marks.x.push({ at: pin.x, from: pin.y, to: pin.y })
    marks.y.push({ at: pin.y, from: pin.x, to: pin.x })
  }
}

/** Where the moving marks meet the still ones, one guide per line, spanning all that is on it. */
function match(axis: 'x' | 'y', moving: readonly Mark[], still: readonly Mark[]): Guide[] {
  const byLine = new Map<number, { from: number; to: number; hit: boolean }>()
  for (const mark of moving) {
    const line = byLine.get(mark.at) ?? { from: mark.from, to: mark.to, hit: false }
    line.from = Math.min(line.from, mark.from)
    line.to = Math.max(line.to, mark.to)
    byLine.set(mark.at, line)
  }
  for (const mark of still) {
    const line = byLine.get(mark.at)
    if (!line) continue
    line.hit = true
    line.from = Math.min(line.from, mark.from)
    line.to = Math.max(line.to, mark.to)
  }
  const guides: Guide[] = []
  for (const [at, line] of byLine) {
    if (line.hit) guides.push({ axis, at, from: line.from, to: line.to })
  }
  return guides.sort((a, b) => a.at - b.at)
}

/**
 * The guides for `doc`, a drawing in which the parts in `moving` have just
 * been moved. Box lines are matched with box lines and pins with pins.
 */
export function alignGuides(doc: CircuitDoc, moving: ReadonlySet<string>): Guide[] {
  const movingBoxes: Marks = { x: [], y: [] }
  const movingPins: Marks = { x: [], y: [] }
  const stillBoxes: Marks = { x: [], y: [] }
  const stillPins: Marks = { x: [], y: [] }

  let union: Rect | undefined
  for (const id of Object.keys(doc.components)) {
    const box = componentBounds(doc, id)!
    if (moving.has(id)) {
      union = union
        ? {
            x0: Math.min(union.x0, box.x0),
            y0: Math.min(union.y0, box.y0),
            x1: Math.max(union.x1, box.x1),
            y1: Math.max(union.y1, box.y1),
          }
        : box
      pinMarks(pinsOf(doc, id), movingPins)
    } else {
      boxMarks(box, stillBoxes)
      pinMarks(pinsOf(doc, id), stillPins)
    }
  }
  if (!union) return []
  boxMarks(union, movingBoxes)

  const guides = [
    ...match('x', movingBoxes.x, stillBoxes.x),
    ...match('y', movingBoxes.y, stillBoxes.y),
    ...match('x', movingPins.x, stillPins.x),
    ...match('y', movingPins.y, stillPins.y),
  ]
  // A line found both ways is drawn once, as long as both.
  const merged = new Map<string, Guide>()
  for (const guide of guides) {
    const key = `${guide.axis}:${guide.at}`
    const known = merged.get(key)
    merged.set(
      key,
      known
        ? { ...known, from: Math.min(known.from, guide.from), to: Math.max(known.to, guide.to) }
        : guide,
    )
  }
  return [...merged.values()]
}
