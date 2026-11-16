import { SUB_TYPE, deleteItems, terminalEnd } from './document.ts'
import type { CircuitDoc, DocComponent, SubPin, SubRef, Terminal } from './document.ts'

/*
 * Named circuits. A project holds several drawings, each with a name, and any
 * of them can be used as a part of another. Such a part keeps a `SubRef`: the
 * name and the pins of the circuit it stands for. The functions here work out
 * that reference and keep the copies inside the drawings up to date.
 */

/** One drawing of a project. */
export interface Circuit {
  readonly id: string
  readonly name: string
  readonly doc: CircuitDoc
}

export type Circuits = Readonly<Record<string, Circuit>>

/** The longest name a circuit can have. */
export const MAX_CIRCUIT_NAME = 24

/** A name made fit to show: trimmed, cut to length, undefined when blank. */
export function cleanCircuitName(name: string): string | undefined {
  const text = name.trim().replace(/\s+/g, ' ').slice(0, MAX_CIRCUIT_NAME)
  return text === '' ? undefined : text
}

function idNumber(id: string): number {
  return Number(id.slice(1)) || 0
}

/** Top to bottom, then left to right: the order the pins get on the part. */
function byPlace(a: DocComponent, b: DocComponent): number {
  return a.pos.y - b.pos.y || a.pos.x - b.pos.x || idNumber(a.id) - idNumber(b.id)
}

interface Pins {
  readonly inputs: readonly SubPin[]
  readonly outputs: readonly SubPin[]
}

const pinsOf = new WeakMap<CircuitDoc, Pins>()

/**
 * The pins a drawing has when it is used as a part: one input for every
 * switch in it and one output for every output part, named by their labels.
 */
export function interfaceOf(doc: CircuitDoc): Pins {
  let pins = pinsOf.get(doc)
  if (!pins) {
    const side = (type: string, fallback: string): SubPin[] =>
      Object.values(doc.components)
        .filter((component) => component.type === type)
        .sort(byPlace)
        .map((component, index) => ({
          port: component.id,
          label: component.label ?? `${fallback}${index + 1}`,
        }))
    pins = { inputs: side('input', 'in'), outputs: side('output', 'out') }
    pinsOf.set(doc, pins)
  }
  return pins
}

const refOf = new WeakMap<Circuit, SubRef>()

/** What a part standing for `circuit` has to know about it. */
export function subRefOf(circuit: Circuit): SubRef {
  let ref = refOf.get(circuit)
  if (!ref) {
    ref = { circuit: circuit.id, name: circuit.name, ...interfaceOf(circuit.doc) }
    refOf.set(circuit, ref)
  }
  return ref
}

function samePins(a: readonly SubPin[], b: readonly SubPin[]): boolean {
  return a.length === b.length && a.every((pin, i) => pin.port === b[i].port && pin.label === b[i].label)
}

function sameRef(a: SubRef, b: SubRef): boolean {
  return (
    a === b ||
    (a.circuit === b.circuit &&
      a.name === b.name &&
      samePins(a.inputs, b.inputs) &&
      samePins(a.outputs, b.outputs))
  )
}

/**
 * Brings the named-circuit parts of one drawing up to date: each takes the
 * current name and pins of its circuit, wires on pins that are gone are
 * removed, and so is a part whose circuit no longer exists. Returns the same
 * document when it was already up to date.
 */
export function reconcileDoc(doc: CircuitDoc, circuits: Circuits): CircuitDoc {
  let components = doc.components
  const doomed: string[] = []
  for (const component of Object.values(doc.components)) {
    if (component.type !== SUB_TYPE) continue
    const circuit = component.sub ? circuits[component.sub.circuit] : undefined
    if (!circuit) {
      doomed.push(component.id)
      continue
    }
    const ref = subRefOf(circuit)
    if (component.sub && sameRef(component.sub, ref)) continue
    if (components === doc.components) components = { ...components }
    ;(components as Record<string, DocComponent>)[component.id] = { ...component, sub: ref }
  }
  if (components === doc.components && doomed.length === 0) return doc

  const next: CircuitDoc = components === doc.components ? doc : { ...doc, components }
  // A wire whose pin went away has an end with no position any more.
  const gone = (terminal: Terminal): boolean =>
    terminal.kind === 'pin' &&
    next.components[terminal.component]?.type === SUB_TYPE &&
    terminalEnd(next, terminal) === undefined
  for (const wire of Object.values(next.wires)) {
    if (gone(wire.from) || gone(wire.to)) doomed.push(wire.id)
  }
  return doomed.length > 0 ? deleteItems(next, doomed) : next
}

/**
 * Reconciles every drawing of a project. One pass is enough: reconciling a
 * drawing never changes its own switches and outputs, so never its pins.
 */
export function reconcileAll(circuits: Circuits): Circuits {
  let next = circuits
  for (const circuit of Object.values(circuits)) {
    const doc = reconcileDoc(circuit.doc, circuits)
    if (doc === circuit.doc) continue
    if (next === circuits) next = { ...circuits }
    ;(next as Record<string, Circuit>)[circuit.id] = { ...circuit, doc }
  }
  return next
}

/** Removes every wire that ends on something the drawing does not have. */
export function repairDoc(doc: CircuitDoc): CircuitDoc {
  const broken = Object.values(doc.wires)
    .filter((wire) => !terminalEnd(doc, wire.from) || !terminalEnd(doc, wire.to))
    .map((wire) => wire.id)
  return broken.length > 0 ? deleteItems(doc, broken) : doc
}

/** The circuits a drawing uses directly as parts. */
function usedBy(doc: CircuitDoc): Set<string> {
  const used = new Set<string>()
  for (const component of Object.values(doc.components)) {
    if (component.sub) used.add(component.sub.circuit)
  }
  return used
}

/** True if `host` is `target`, or has it inside at any depth. */
export function contains(circuits: Circuits, host: string, target: string): boolean {
  const seen = new Set<string>()
  const visit = (id: string): boolean => {
    if (id === target) return true
    if (seen.has(id)) return false
    seen.add(id)
    const circuit = circuits[id]
    if (!circuit) return false
    for (const used of usedBy(circuit.doc)) {
      if (visit(used)) return true
    }
    return false
  }
  return visit(host)
}

/**
 * Whether `target` may be used as a part inside `host`. A circuit cannot
 * contain itself, directly or through other circuits.
 */
export function canPlace(circuits: Circuits, host: string, target: string): boolean {
  return target in circuits && host in circuits && !contains(circuits, target, host)
}

/** The circuits that use `id` directly as a part. */
export function usersOf(circuits: Circuits, id: string): string[] {
  return Object.values(circuits)
    .filter((circuit) => circuit.id !== id && usedBy(circuit.doc).has(id))
    .map((circuit) => circuit.id)
}
