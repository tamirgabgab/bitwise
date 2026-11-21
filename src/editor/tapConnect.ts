import { create } from 'zustand'
import { isAnnotation, sameTerminal, terminalEnd } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { Point } from './geometry.ts'
import { symbolOf } from './symbols.ts'
import { pinWidth } from './widths.ts'

/*
 * Connecting by taps, for when a wire is hard to drag: a pin, then another
 * pin; or a part, then another part, where the first output that fits goes
 * to the first free input. Tapping two pins that a wire already joins takes
 * that wire away. When more than one output could go, the user picks one.
 */

/** A wire to be made: from a pin to another. */
export interface Link {
  readonly from: Terminal
  readonly to: Terminal
}

/** What the next tap connects to: a pin or a whole part. */
export type Armed =
  | { readonly kind: 'pin'; readonly terminal: Extract<Terminal, { kind: 'pin' }> }
  | { readonly kind: 'part'; readonly id: string }

interface TapConnectState {
  /** The end chosen first, waiting for the second tap. */
  readonly armed: Armed | null
  /** Ways to connect the user has to pick from, when there was more than one. */
  readonly choices: readonly Link[] | null
  /** Set when the second tap found nothing to connect to. */
  readonly nothing: boolean
  arm(armed: Armed): void
  offer(choices: readonly Link[]): void
  failed(): void
  cancel(): void
}

export const useTapConnect = create<TapConnectState>((set) => ({
  armed: null,
  choices: null,
  nothing: false,
  arm: (armed) => set({ armed, choices: null, nothing: false }),
  offer: (choices) => set({ armed: null, choices, nothing: false }),
  failed: () => set({ armed: null, choices: null, nothing: true }),
  cancel: () => set({ armed: null, choices: null, nothing: false }),
}))

type Pin = Extract<Terminal, { kind: 'pin' }>

/** The pins of a part that go one way, in the order its symbol has them. */
function pinsOf(doc: CircuitDoc, id: string, direction: 'in' | 'out'): Pin[] {
  const part = doc.components[id]
  if (!part || isAnnotation(part.type)) return []
  return symbolOf(part)
    .pins.filter((pin) => pin.direction === direction)
    .map((pin) => ({ kind: 'pin', component: id, port: pin.name }))
}

/** Which way a pin of the drawing goes, if it exists. */
export function pinDirection(doc: CircuitDoc, pin: Pin): 'in' | 'out' | undefined {
  const part = doc.components[pin.component]
  return part ? symbolOf(part).pins.find((each) => each.name === pin.port)?.direction : undefined
}

/** Whether any wire reaches a terminal. */
export function attached(doc: CircuitDoc, terminal: Terminal): boolean {
  return Object.values(doc.wires).some(
    (wire) => sameTerminal(wire.from, terminal) || sameTerminal(wire.to, terminal),
  )
}

/** The wire that joins two terminals directly, if there is one. */
export function wireBetween(doc: CircuitDoc, a: Terminal, b: Terminal): string | undefined {
  return Object.values(doc.wires).find(
    (wire) =>
      (sameTerminal(wire.from, a) && sameTerminal(wire.to, b)) ||
      (sameTerminal(wire.from, b) && sameTerminal(wire.to, a)),
  )?.id
}

/** Whether two pins carry the same number of digits, as far as the drawing knows. */
function fits(doc: CircuitDoc, a: Pin, b: Pin): boolean {
  const left = pinWidth(doc, a)
  const right = pinWidth(doc, b)
  return left === undefined || right === undefined || left === right
}

/** The first input of a part that nothing reaches yet and that fits `output`. */
function freeInput(doc: CircuitDoc, part: string, output: Pin): Pin | undefined {
  return pinsOf(doc, part, 'in').find((input) => !attached(doc, input) && fits(doc, output, input))
}

/**
 * The ways to join a pin to another part. An output goes to the part's
 * first free input; an input takes any output of the part that fits.
 */
export function linksFromPin(doc: CircuitDoc, pin: Pin, part: string): Link[] {
  if (pin.component === part) return []
  const direction = pinDirection(doc, pin)
  if (direction === 'out') {
    const input = freeInput(doc, part, pin)
    return input ? [{ from: pin, to: input }] : []
  }
  if (direction === 'in') {
    return pinsOf(doc, part, 'out')
      .filter((output) => fits(doc, output, pin))
      .map((output) => ({ from: output, to: pin }))
  }
  return []
}

/**
 * The ways to join two parts: each output of the first, to the first free
 * input of the second that fits it. When the first has no way to the
 * second, the other way round, for parts tapped in the wrong order.
 */
export function linksBetweenParts(doc: CircuitDoc, first: string, second: string): Link[] {
  if (first === second) return []
  const forward = (from: string, to: string): Link[] =>
    pinsOf(doc, from, 'out').flatMap((output) => {
      const input = freeInput(doc, to, output)
      return input ? [{ from: output, to: input }] : []
    })
  const links = forward(first, second)
  return links.length > 0 ? links : forward(second, first)
}

/**
 * The pin nearest `p` within `reach` grid units, for a finger: it covers far
 * more than a pin, so a pin is found a little way off.
 */
export function pinNear(doc: CircuitDoc, p: Point, reach: number): { terminal: Pin; pos: Point } | undefined {
  let best: { terminal: Pin; pos: Point } | undefined
  let bestDistance = reach
  for (const part of Object.values(doc.components)) {
    if (isAnnotation(part.type)) continue
    for (const pin of symbolOf(part).pins) {
      const terminal: Pin = { kind: 'pin', component: part.id, port: pin.name }
      const end = terminalEnd(doc, terminal)
      if (!end) continue
      const away = Math.hypot(end.pos.x - p.x, end.pos.y - p.y)
      if (away <= bestDistance) {
        best = { terminal, pos: end.pos }
        bestDistance = away
      }
    }
  }
  return best
}
