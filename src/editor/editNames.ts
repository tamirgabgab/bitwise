import { FRAME_TYPE } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'

/*
 * Names for the steps of undo. The history keeps only the drawings, so the
 * name of an edit is read off the difference between the drawing before it
 * and the one after: "Add AND", "Connect wire", "Move 3 items".
 */

/** What a part is called in a name, such as "AND" or "D flip-flop". */
export type PartNamer = (part: DocComponent) => string

interface Diff<T> {
  readonly added: T[]
  readonly removed: T[]
  readonly changed: { readonly before: T; readonly after: T }[]
}

function diff<T>(before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>): Diff<T> {
  const added: T[] = []
  const removed: T[] = []
  const changed: { before: T; after: T }[] = []
  for (const [id, item] of Object.entries(after)) {
    const old = before[id]
    if (old === undefined) added.push(item)
    else if (old !== item) changed.push({ before: old, after: item })
  }
  for (const [id, item] of Object.entries(before)) {
    if (!(id in after)) removed.push(item)
  }
  return { added, removed, changed }
}

/** "AND" for one part, "3 parts" for more. */
function parts(list: readonly DocComponent[], nameOf: PartNamer): string {
  return list.length === 1 ? nameOf(list[0]) : `${list.length} parts`
}

function count(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`
}

const samePlace = (a: DocComponent, b: DocComponent): boolean =>
  a.pos.x === b.pos.x && a.pos.y === b.pos.y && a.rotation === b.rotation

/** The name of the edit that turned `before` into `after`. */
export function describeEdit(before: CircuitDoc, after: CircuitDoc, nameOf: PartNamer): string {
  const components = diff(before.components, after.components)
  const wires = diff(before.wires, after.wires)
  const junctions = diff(before.junctions, after.junctions)

  const moved = components.changed.filter(({ before: a, after: b }) => !samePlace(a, b))
  const turned = moved.filter(({ before: a, after: b }) => a.rotation !== b.rotation)
  const edited = components.changed.filter(({ before: a, after: b }) => samePlace(a, b))
  const movedJunctions = junctions.changed.length

  // A part dropped onto a wire: the wire is cut and the part goes in between.
  if (
    wires.removed.length === 1 &&
    wires.added.length === 2 &&
    components.removed.length === 0 &&
    components.added.length + moved.length === 1
  ) {
    return `Insert ${nameOf(components.added[0] ?? moved[0].after)} into a wire`
  }

  if (components.added.length > 0) {
    if (components.removed.length === 0) return `Add ${parts(components.added, nameOf)}`
    return `Replace ${parts(components.removed, nameOf)} with ${parts(components.added, nameOf)}`
  }

  const removedItems = components.removed.length + wires.removed.length + junctions.removed.length
  if (removedItems > 0 && components.changed.length === 0 && wires.added.length === 0) {
    if (components.removed.length === 1 && removedItems - wires.removed.length === 1) {
      return `Delete ${nameOf(components.removed[0])}`
    }
    if (components.removed.length === 0 && junctions.removed.length === 0) {
      return `Delete ${count(wires.removed.length, 'wire', 'wires')}`
    }
    return `Delete ${removedItems} items`
  }

  if (
    wires.changed.length > 0 &&
    wires.added.length + wires.removed.length + components.changed.length + movedJunctions === 0 &&
    wires.changed.every(({ before: a, after: b }) => a.from === b.from && a.to === b.to)
  ) {
    return 'Change how a bus is written'
  }

  if (components.removed.length === 0 && components.changed.length === 0) {
    // Only wires and junctions changed. A new wire may cut others in two,
    // and each cut leaves a junction: one wire more than the junctions added.
    const grown = wires.added.length - wires.removed.length
    if (grown > 0 && grown === junctions.added.length + 1) return 'Connect wire'
    return 'Move wire'
  }

  if (turned.length > 0 && turned.length === components.changed.length) {
    return `Rotate ${parts(turned.map(({ after: part }) => part), nameOf)}`
  }
  if (moved.length > 0 && edited.length === 0) {
    // What lies inside a frame moves with it.
    const frames = moved.filter(({ after: part }) => part.type === FRAME_TYPE)
    if (frames.length === 1) return `Move ${nameOf(frames[0].after)}`
    const items = moved.length + movedJunctions
    return items === 1 ? `Move ${nameOf(moved[0].after)}` : `Move ${items} items`
  }
  if (edited.length === 1 && moved.length === 0) {
    const { before: a, after: b } = edited[0]
    if (a.size !== b.size) return `Resize ${nameOf(b)}`
    if (a.machine !== b.machine) return `Edit the machine of ${nameOf(b)}`
    if (a.text !== b.text) return b.type === FRAME_TYPE ? `Rename ${nameOf(b)}` : 'Edit text'
    if (a.label !== b.label) return `Rename ${nameOf(b)}`
    if (a.key !== b.key) return `Change the key of ${nameOf(b)}`
    if (a.delay !== b.delay) return `Change the delay of ${nameOf(b)}`
    return `Change ${nameOf(b)}`
  }
  if (edited.length > 1 && moved.length === 0) return `Change ${edited.length} parts`
  return 'Edit'
}
