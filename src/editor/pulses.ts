import { terminalKey } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { symbolOf } from './symbols.ts'

/*
 * The brief wave that runs along a wire when its value changes. This file
 * keeps track of which wires changed and when, and works out which way a
 * wire carries its value; the drawing is done in `render.ts`.
 */

/** How long a wave lasts, in milliseconds. */
export const PULSE_TIME = 450

/**
 * A wire that changes again sooner than this after its last change gets no
 * wave. It keeps a clock line from flickering all the time.
 */
export const QUIET_TIME = 600

/** Remembers what every wire carried, and which ones just changed. */
export class WirePulses {
  private readonly seen = new Map<string, string>()
  private readonly changed = new Map<string, number>()
  private readonly started = new Map<string, number>()

  /**
   * Takes note of what the wires carry at time `now`: a text per wire that
   * is different whenever the value is. A wire seen for the first time does
   * not count as changed.
   */
  observe(values: ReadonlyMap<string, string>, now: number): void {
    for (const id of [...this.seen.keys()]) {
      if (values.has(id)) continue
      this.seen.delete(id)
      this.changed.delete(id)
      this.started.delete(id)
    }
    for (const [id, value] of values) {
      const before = this.seen.get(id)
      this.seen.set(id, value)
      if (before === undefined || before === value) continue
      const last = this.changed.get(id)
      this.changed.set(id, now)
      if (last === undefined || now - last >= QUIET_TIME) this.started.set(id, now)
      else this.started.delete(id)
    }
  }

  /** How far the wave on a wire has come, from 0 to 1, or undefined for none. */
  progress(id: string, now: number): number | undefined {
    const start = this.started.get(id)
    if (start === undefined) return undefined
    const t = (now - start) / PULSE_TIME
    if (t >= 1 || t < 0) {
      this.started.delete(id)
      return undefined
    }
    return t
  }

  /** True while some wave is still running. */
  active(now: number): boolean {
    for (const start of this.started.values()) {
      if (now - start < PULSE_TIME) return true
    }
    return false
  }

  /** Forgets everything, as when another circuit comes on screen. */
  reset(): void {
    this.seen.clear()
    this.changed.clear()
    this.started.clear()
  }
}

const directions = new WeakMap<CircuitDoc, ReadonlyMap<string, number>>()

/**
 * Which way each wire carries its value: 1 from its first end to its second,
 * -1 the other way, 0 when that cannot be told (no output drives it, or both
 * ends are as far from one). Found by walking outwards from the output pins.
 */
export function flowDirections(doc: CircuitDoc): ReadonlyMap<string, number> {
  const cached = directions.get(doc)
  if (cached) return cached

  const links = new Map<string, string[]>()
  const link = (a: string, b: string): void => {
    const list = links.get(a)
    if (list) list.push(b)
    else links.set(a, [b])
  }
  for (const wire of Object.values(doc.wires)) {
    const from = terminalKey(wire.from)
    const to = terminalKey(wire.to)
    link(from, to)
    link(to, from)
  }

  const distance = new Map<string, number>()
  let front: string[] = []
  for (const part of Object.values(doc.components)) {
    for (const pin of symbolOf(part).pins) {
      if (pin.direction !== 'out') continue
      const key = terminalKey({ kind: 'pin', component: part.id, port: pin.name })
      if (!links.has(key)) continue
      distance.set(key, 0)
      front.push(key)
    }
  }
  for (let steps = 1; front.length > 0; steps++) {
    const next: string[] = []
    for (const key of front) {
      for (const other of links.get(key) ?? []) {
        if (distance.has(other)) continue
        distance.set(other, steps)
        next.push(other)
      }
    }
    front = next
  }

  const result = new Map<string, number>()
  for (const wire of Object.values(doc.wires)) {
    const from = distance.get(terminalKey(wire.from))
    const to = distance.get(terminalKey(wire.to))
    result.set(wire.id, from === undefined || to === undefined ? 0 : Math.sign(to - from))
  }
  directions.set(doc, result)
  return result
}
