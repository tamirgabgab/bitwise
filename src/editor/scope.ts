import type { Digit } from '../core/index.ts'
import type { CircuitDoc, DocComponent, Terminal } from './document.ts'
import { interfaceOf } from './subcircuit.ts'

/*
 * The timing diagram: which wires of a drawing it follows, and a record of
 * what each one carried over the last ticks.
 */

/** One row of the timing diagram. */
export interface ScopeSignal {
  /** The id of the part the row belongs to. */
  readonly key: string
  readonly name: string
  readonly kind: 'clock' | 'input' | 'output'
  /** The pin to read for this row. */
  readonly pin: Terminal
}

function idNumber(id: string): number {
  return Number(id.slice(1)) || 0
}

function byPlace(a: DocComponent, b: DocComponent): number {
  return a.pos.y - b.pos.y || a.pos.x - b.pos.x || idNumber(a.id) - idNumber(b.id)
}

const signalsOf = new WeakMap<CircuitDoc, readonly ScopeSignal[]>()

/**
 * The rows a drawing gets: its clocks and cycling switches, then its
 * switches, then its outputs, each group from top to bottom. A switch or an output goes by its label,
 * the same name it has as a pin of the circuit.
 */
export function scopeSignals(doc: CircuitDoc): readonly ScopeSignal[] {
  let signals = signalsOf.get(doc)
  if (!signals) {
    const ofType = (type: string): DocComponent[] =>
      Object.values(doc.components)
        .filter((component) => component.type === type)
        .sort(byPlace)
    const clocks = ofType('clock')
    const cycles = ofType('cycle')
    const pins = interfaceOf(doc)
    const row = (
      kind: ScopeSignal['kind'],
      component: string,
      port: string,
      name: string,
    ): ScopeSignal => ({ key: component, name, kind, pin: { kind: 'pin', component, port } })
    signals = [
      ...clocks.map((clock, index) =>
        row('clock', clock.id, 'out', clocks.length === 1 ? 'Clock' : `Clock ${index + 1}`),
      ),
      ...cycles.map((cycle, index) =>
        row('clock', cycle.id, 'out', cycles.length === 1 ? 'Cycle' : `Cycle ${index + 1}`),
      ),
      ...pins.inputs.map((pin) => row('input', pin.port, 'out', pin.label)),
      ...pins.outputs.map((pin) => row('output', pin.port, 'in', pin.label)),
    ]
    signalsOf.set(doc, signals)
  }
  return signals
}

/** A stretch of time over which a signal kept one value. */
export interface Span {
  readonly from: number
  readonly to: number
  readonly digit: Digit
}

interface Track {
  /** The ticks at which the value changed, oldest first. */
  readonly times: number[]
  /** The value from each of those ticks on. */
  readonly digits: Digit[]
}

/** How many ticks back the record goes unless told otherwise. */
export const SCOPE_HISTORY = 2000

/**
 * Remembers what each signal carried over the last ticks. Only the changes
 * are kept, so a signal that sits still costs nothing.
 */
export class Recorder {
  private readonly keep: number
  private readonly tracks = new Map<string, Track>()
  private last = -1

  constructor(keep = SCOPE_HISTORY) {
    this.keep = keep
  }

  /** The tick of the latest sample, or -1 before the first. */
  get time(): number {
    return this.last
  }

  clear(): void {
    this.tracks.clear()
    this.last = -1
  }

  /**
   * Forgets everything after `time`, for when the circuit steps back to it.
   */
  rewind(time: number): void {
    if (time >= this.last) return
    this.last = time
    for (const [key, track] of this.tracks) {
      while (track.times.length > 0 && track.times[track.times.length - 1] > time) {
        track.times.pop()
        track.digits.pop()
      }
      if (track.times.length === 0) this.tracks.delete(key)
    }
  }

  /**
   * Notes the value of every signal at `time`. A signal left out of `values`
   * is forgotten. Time going backwards means the circuit started over, and
   * the record starts over with it.
   */
  sample(time: number, values: ReadonlyMap<string, Digit>): void {
    if (time < this.last) this.clear()
    this.last = time
    for (const key of this.tracks.keys()) {
      if (!values.has(key)) this.tracks.delete(key)
    }
    for (const [key, digit] of values) {
      let track = this.tracks.get(key)
      if (!track) {
        track = { times: [], digits: [] }
        this.tracks.set(key, track)
      }
      const { times, digits } = track
      const end = times.length - 1
      if (end >= 0 && times[end] === time) {
        // A second look within the same tick replaces the first.
        digits[end] = digit
        if (end > 0 && digits[end - 1] === digit) {
          times.pop()
          digits.pop()
        }
      } else if (end < 0 || digits[end] !== digit) {
        times.push(time)
        digits.push(digit)
      }
      // Drop what is too old to show, keeping the value that was in effect.
      while (times.length > 1 && times[1] <= time - this.keep) {
        times.shift()
        digits.shift()
      }
    }
  }

  /**
   * What a signal carried between two ticks, as stretches of one value each.
   * The time before the signal was first seen is left out.
   */
  spans(key: string, from: number, to: number): Span[] {
    const track = this.tracks.get(key)
    if (!track) return []
    const spans: Span[] = []
    for (let i = 0; i < track.times.length; i++) {
      const start = Math.max(track.times[i], from)
      const end = Math.min(track.times[i + 1] ?? to, to)
      if (start < end) spans.push({ from: start, to: end, digit: track.digits[i] })
    }
    return spans
  }
}
