import { builtinComponents } from '../core/index.ts'
import { partGraph } from './cone.ts'
import { terminalNets } from './connectivity.ts'
import { NET_TYPE, isAnnotation, terminalEnd, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent, Terminal } from './document.ts'
import type { PartNamer } from './editNames.ts'
import type { Point } from './geometry.ts'
import type { LiveValues } from './liveValues.ts'
import { symbolOf } from './symbols.ts'

/*
 * The problems panel: what in a drawing is likely a mistake, each with the
 * parts or wires to select and a point to show. Most of it is read off the
 * drawing alone; conflicts and mixed widths come from the running circuit.
 */

/** The sorts of problem, in the order the panel lists them. */
export type ProblemKind = 'conflict' | 'mixed' | 'floating' | 'undriven' | 'loop' | 'unused'

export interface Problem {
  readonly kind: ProblemKind
  /** What is wrong, in a sentence. */
  readonly text: string
  /** The parts and wires to select when the problem is picked. */
  readonly ids: readonly string[]
  /** Where on the canvas to look. */
  readonly at: Point
}

const ORDER: readonly ProblemKind[] = ['conflict', 'mixed', 'floating', 'undriven', 'loop', 'unused']

/**
 * Inputs that may be left unattached: each has a value of its own then
 * (`cin` and `bin` 0, `en` on, `load`, `set` and `reset` off).
 */
const OPTIONAL_INPUTS: ReadonlySet<string> = new Set(['cin', 'bin', 'en', 'load', 'set', 'reset'])

/** The parts of a drawing that are in the circuit: no notes, frames or net labels. */
function circuitParts(doc: CircuitDoc): DocComponent[] {
  return Object.values(doc.components).filter(
    (part) => !isAnnotation(part.type) && part.type !== NET_TYPE,
  )
}

/** A part that keeps a value, so a loop through it is a memory and not a race. */
function remembers(part: DocComponent): boolean {
  return builtinComponents.has(part.type) && builtinComponents.get(part.type).stored !== undefined
}

/** What a pin is called: its port, or for a named circuit the label inside. */
function pinLabel(part: DocComponent, port: string): string {
  return part.sub?.inputs.find((pin) => pin.port === port)?.label ?? port
}

const pinOf = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

function placeOf(doc: CircuitDoc, terminal: Terminal, part: DocComponent): Point {
  return terminalEnd(doc, terminal)?.pos ?? part.pos
}

/**
 * The loops of a drawing that run through no part with a memory: each
 * group of parts that feed one another, by Tarjan's strongly connected
 * components. A part that reads its own output is a loop of one.
 */
function loopsOf(doc: CircuitDoc, parts: readonly DocComponent[]): string[][] {
  const graph = partGraph(doc)
  const inLoop = new Set(parts.filter((part) => !remembers(part)).map((part) => part.id))
  const next = (id: string): string[] => {
    const found: string[] = []
    for (const net of graph.outs.get(id) ?? []) {
      for (const reader of graph.readers.get(net) ?? []) if (inLoop.has(reader)) found.push(reader)
    }
    return found
  }
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const loops: string[][] = []
  let counter = 0
  const visit = (id: string): void => {
    index.set(id, counter)
    low.set(id, counter)
    counter++
    stack.push(id)
    onStack.add(id)
    for (const other of next(id)) {
      if (!index.has(other)) {
        visit(other)
        low.set(id, Math.min(low.get(id)!, low.get(other)!))
      } else if (onStack.has(other)) {
        low.set(id, Math.min(low.get(id)!, index.get(other)!))
      }
    }
    if (low.get(id) !== index.get(id)) return
    const group: string[] = []
    let member: string
    do {
      member = stack.pop()!
      onStack.delete(member)
      group.push(member)
    } while (member !== id)
    if (group.length > 1 || next(id).includes(id)) loops.push(group.reverse())
  }
  for (const id of inLoop) if (!index.has(id)) visit(id)
  return loops
}

const staticOf = new WeakMap<CircuitDoc, readonly Problem[]>()

/**
 * The problems that can be read off the drawing itself: inputs left
 * unattached, wires nothing drives, loops with no memory in them, and parts
 * whose outputs go nowhere. Kept per drawing.
 */
export function drawingProblems(doc: CircuitDoc, nameOf: PartNamer): readonly Problem[] {
  const cached = staticOf.get(doc)
  if (cached) return cached
  const problems: Problem[] = []
  const nets = terminalNets(doc)
  const graph = partGraph(doc)
  const parts = circuitParts(doc)

  for (const part of parts) {
    const pins = symbolOf(part).pins
    for (const pin of pins) {
      if (pin.direction !== 'in' || OPTIONAL_INPUTS.has(pin.name)) continue
      const terminal = pinOf(part.id, pin.name)
      if (nets.has(terminalKey(terminal))) continue
      problems.push({
        kind: 'floating',
        text: `Input ${pinLabel(part, pin.name)} of ${nameOf(part)} is not connected`,
        ids: [part.id],
        at: placeOf(doc, terminal, part),
      })
    }
    const outputs = pins.filter((pin) => pin.direction === 'out')
    if (
      outputs.length > 0 &&
      outputs.every((pin) => !nets.has(terminalKey(pinOf(part.id, pin.name))))
    ) {
      problems.push({
        kind: 'unused',
        text: `${nameOf(part)} drives nothing`,
        ids: [part.id],
        at: part.pos,
      })
    }
  }

  // A wire into an input with nothing on it that drives: it floats.
  const reported = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    const net = nets.get(terminalKey(wire.from))
    if (net === undefined || reported.has(net)) continue
    reported.add(net)
    const readers = (graph.readers.get(net) ?? []).filter((id) => {
      const part = doc.components[id]
      return part !== undefined && part.type !== NET_TYPE
    })
    if (readers.length === 0 || (graph.drivers.get(net) ?? []).length > 0) continue
    const wires = Object.values(doc.wires)
      .filter((other) => nets.get(terminalKey(other.from)) === net)
      .map((other) => other.id)
    problems.push({
      kind: 'undriven',
      text: `Nothing drives the wire into ${nameOf(doc.components[readers[0]])}`,
      ids: wires,
      at: terminalEnd(doc, wire.from)?.pos ?? doc.components[readers[0]].pos,
    })
  }

  for (const loop of loopsOf(doc, parts)) {
    const names = loop.map((id) => nameOf(doc.components[id]))
    const listed = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
    problems.push({
      kind: 'loop',
      text: `A loop with no memory runs through ${listed}: it may hold a value or oscillate`,
      ids: loop,
      at: doc.components[loop[0]].pos,
    })
  }

  const sorted = sortProblems(problems)
  staticOf.set(doc, sorted)
  return sorted
}

function sortProblems(problems: readonly Problem[]): Problem[] {
  return [...problems].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

/**
 * Every problem of the drawing as the circuit runs now: those of
 * `drawingProblems`, and each wire in conflict or joining pins of
 * different widths, one entry per net.
 */
export function circuitProblems(
  doc: CircuitDoc,
  live: LiveValues,
  nameOf: PartNamer,
): Problem[] {
  const problems = [...drawingProblems(doc, nameOf)]
  const nets = terminalNets(doc)
  const seen = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    const net = nets.get(terminalKey(wire.from)) ?? wire.id
    if (seen.has(net)) continue
    const value = live.at(wire.from)
    if (!value.conflict && !value.mixed) continue
    seen.add(net)
    const wires = Object.values(doc.wires)
      .filter((other) => (nets.get(terminalKey(other.from)) ?? other.id) === net)
      .map((other) => other.id)
    const at = terminalEnd(doc, wire.from)?.pos ?? { x: 0, y: 0 }
    problems.push(
      value.mixed
        ? { kind: 'mixed', text: 'Pins of different widths are wired together', ids: wires, at }
        : { kind: 'conflict', text: 'Two outputs drive a wire to different values', ids: wires, at },
    )
  }
  return sortProblems(problems)
}
