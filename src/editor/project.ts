import {
  MAX_RADIX,
  MIN_RADIX,
  builtinComponents,
  defaultPresetId,
  findPreset,
  presetAvailable,
  resolveParams,
} from '../core/index.ts'
import { MAX_LABEL, SUB_TYPE, deleteItems, isSwitchKey, takesKey } from './document.ts'
import type { CircuitDoc, DocComponent, DocJunction, DocWire, Terminal } from './document.ts'
import type { Point, Rotation } from './geometry.ts'
import {
  cleanCircuitName,
  contains,
  reconcileAll,
  repairDoc,
} from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'
import { DEFAULT_PALETTE } from './valueStyle.ts'
import { MAX_ZOOM, MIN_ZOOM } from './view.ts'
import type { View } from './view.ts'

/*
 * A whole project as plain data: what is written to a file and read back.
 * The shapes here are the file format, so `src/io` describes the same ones;
 * the two layers do not import each other and meet in `src/ui`.
 */

/**
 * What belongs to the project as a whole rather than to one part: the radix
 * its wires work in, the gates it is built from, and how values are shown.
 */
export interface ProjectSettings {
  /** How many values a wire can carry: 2 for ordinary binary logic. */
  readonly radix: number
  /** Id of the gate kit (see `GATE_PRESETS`) the palette offers. */
  readonly preset: string
  /** Offer every gate, whatever the kit. */
  readonly sandbox: boolean
  /** Wire colors for the values 0 to 9. */
  readonly palette: readonly string[]
  /** At radix 2, use the classic off and on colors instead of the palette. */
  readonly classicColors: boolean
  /** Write each output's value next to its pin. */
  readonly showDigits: boolean
  /** Write the values of an odd radix around zero: -1, 0, +1. */
  readonly balanced: boolean
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  radix: 2,
  preset: defaultPresetId(2),
  sandbox: false,
  palette: DEFAULT_PALETTE,
  classicColors: true,
  showDigits: false,
  balanced: false,
}

export interface ComponentData {
  readonly id: string
  readonly type: string
  readonly params: Readonly<Record<string, number>>
  readonly delay: number
  readonly pos: Point
  readonly rotation: number
  readonly label?: string
  /** The keyboard key that works a switch or a push button. */
  readonly key?: string
  /** On a part that stands for a named circuit: the id of that circuit. */
  readonly circuit?: string
}

export interface CircuitData {
  readonly id: string
  readonly name: string
  readonly nextId: number
  readonly components: readonly ComponentData[]
  readonly junctions: readonly DocJunction[]
  readonly wires: readonly DocWire[]
  /** Where the canvas was looking at this circuit. */
  readonly view?: View
  /** The value each switch was on, by part id. */
  readonly inputs?: Readonly<Record<string, number>>
}

export interface ProjectData {
  readonly settings: ProjectSettings
  readonly circuits: readonly CircuitData[]
  /** Id of the circuit that was open. */
  readonly active: string
}

/** A project as the editor holds it. */
export interface Project {
  readonly circuits: Circuits
  /** The circuit ids, in the order of their tabs. */
  readonly order: readonly string[]
  readonly active: string
  readonly settings: ProjectSettings
}

export interface LoadedProject extends Project {
  readonly views: Readonly<Record<string, View>>
  readonly inputs: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** The number the next new circuit gets in its id. */
  readonly nextCircuit: number
}

function docToData(doc: CircuitDoc): Pick<CircuitData, 'nextId' | 'components' | 'junctions' | 'wires'> {
  return {
    nextId: doc.nextId,
    components: Object.values(doc.components).map((component): ComponentData => ({
      id: component.id,
      type: component.type,
      params: component.params,
      delay: component.delay,
      pos: component.pos,
      rotation: component.rotation,
      ...(component.label ? { label: component.label } : {}),
      ...(component.key ? { key: component.key } : {}),
      ...(component.sub ? { circuit: component.sub.circuit } : {}),
    })),
    junctions: Object.values(doc.junctions),
    wires: Object.values(doc.wires),
  }
}

/** Writes a project out as plain data. */
export function toProjectData(
  project: Project,
  extras: {
    readonly views?: Readonly<Record<string, View>>
    readonly inputs?: Readonly<Record<string, Readonly<Record<string, number>>>>
  } = {},
): ProjectData {
  return {
    settings: project.settings,
    active: project.active,
    circuits: project.order.map((id): CircuitData => {
      const circuit = project.circuits[id]
      const view = extras.views?.[id]
      const inputs = extras.inputs?.[id]
      return {
        id,
        name: circuit.name,
        ...docToData(circuit.doc),
        ...(view ? { view } : {}),
        ...(inputs && Object.keys(inputs).length > 0 ? { inputs } : {}),
      }
    }),
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function pointOf(value: unknown): Point | undefined {
  if (!isObject(value)) return undefined
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  return { x: Math.round(x), y: Math.round(y) }
}

function terminalOf(value: unknown): Terminal | undefined {
  if (!isObject(value)) return undefined
  if (value.kind === 'pin' && typeof value.component === 'string' && typeof value.port === 'string') {
    return { kind: 'pin', component: value.component, port: value.port }
  }
  if (value.kind === 'junction' && typeof value.junction === 'string') {
    return { kind: 'junction', junction: value.junction }
  }
  return undefined
}

function componentOf(data: ComponentData): DocComponent | undefined {
  const pos = pointOf(data.pos)
  if (typeof data.id !== 'string' || data.id === '' || !pos) return undefined
  const rotation = ([0, 1, 2, 3].includes(data.rotation) ? data.rotation : 0) as Rotation
  const delay = Number.isInteger(data.delay) && data.delay >= 1 ? data.delay : 1
  const label = typeof data.label === 'string' ? data.label.trim().slice(0, MAX_LABEL) : ''
  const named = label === '' ? {} : { label }
  const keyed = takesKey(data.type) && isSwitchKey(data.key) ? { key: data.key } : {}

  if (data.type === SUB_TYPE) {
    if (typeof data.circuit !== 'string') return undefined
    // The name and the pins are filled in once every circuit is known.
    const sub = { circuit: data.circuit, name: '', inputs: [], outputs: [] }
    return { id: data.id, type: SUB_TYPE, params: {}, delay: 1, pos, rotation, sub }
  }
  if (!builtinComponents.has(data.type)) return undefined
  try {
    const params = resolveParams(builtinComponents.get(data.type), data.params)
    return { id: data.id, type: data.type, params, delay, pos, rotation, ...named, ...keyed }
  } catch {
    return undefined
  }
}

/** Reads one drawing. Anything that makes no sense is left out. */
function docFromData(data: CircuitData): CircuitDoc {
  const components: Record<string, DocComponent> = {}
  const junctions: Record<string, DocJunction> = {}
  const wires: Record<string, DocWire> = {}
  let highest = 0
  const count = (id: string): void => {
    const number = Number(id.slice(1))
    if (Number.isInteger(number)) highest = Math.max(highest, number)
  }

  for (const item of Array.isArray(data.components) ? data.components : []) {
    const component = isObject(item) ? componentOf(item as unknown as ComponentData) : undefined
    if (!component) continue
    components[component.id] = component
    count(component.id)
  }
  for (const item of Array.isArray(data.junctions) ? data.junctions : []) {
    const pos = isObject(item) ? pointOf(item.pos) : undefined
    if (!isObject(item) || typeof item.id !== 'string' || !pos || item.id in components) continue
    junctions[item.id] = { id: item.id, pos }
    count(item.id)
  }
  for (const item of Array.isArray(data.wires) ? data.wires : []) {
    if (!isObject(item) || typeof item.id !== 'string') continue
    const from = terminalOf(item.from)
    const to = terminalOf(item.to)
    if (!from || !to || item.id in components || item.id in junctions) continue
    wires[item.id] = { id: item.id, from, to }
    count(item.id)
  }
  const nextId = Number.isInteger(data.nextId) ? Math.max(data.nextId, highest + 1) : highest + 1
  return { components, junctions, wires, nextId }
}

/** Settings that are safe to use, whatever came in. */
export function cleanSettings(value: unknown): ProjectSettings {
  const given = isObject(value) ? value : {}
  const radix =
    typeof given.radix === 'number' &&
    Number.isInteger(given.radix) &&
    given.radix >= MIN_RADIX &&
    given.radix <= MAX_RADIX
      ? given.radix
      : DEFAULT_SETTINGS.radix
  const kit = typeof given.preset === 'string' ? findPreset(given.preset) : undefined
  const preset = kit && presetAvailable(kit, radix) ? kit.id : defaultPresetId(radix)
  const colors = given.palette
  const palette =
    Array.isArray(colors) &&
    colors.length === DEFAULT_PALETTE.length &&
    colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      ? (colors as string[])
      : DEFAULT_PALETTE
  const flag = (name: string, fallback: boolean): boolean => {
    const stored = given[name]
    return typeof stored === 'boolean' ? stored : fallback
  }
  return {
    radix,
    preset,
    palette,
    sandbox: flag('sandbox', DEFAULT_SETTINGS.sandbox),
    classicColors: flag('classicColors', DEFAULT_SETTINGS.classicColors),
    showDigits: flag('showDigits', radix > 2),
    balanced: flag('balanced', DEFAULT_SETTINGS.balanced),
  }
}

function viewOf(value: unknown): View | undefined {
  if (!isObject(value)) return undefined
  const { panX, panY, zoom } = value
  if (typeof panX !== 'number' || typeof panY !== 'number' || typeof zoom !== 'number') {
    return undefined
  }
  if (![panX, panY, zoom].every(Number.isFinite)) return undefined
  return { panX, panY, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }
}

function inputsOf(value: unknown, doc: CircuitDoc, radix: number): Record<string, number> {
  const inputs: Record<string, number> = {}
  if (!isObject(value)) return inputs
  for (const [id, digit] of Object.entries(value)) {
    if (doc.components[id]?.type !== 'input') continue
    if (typeof digit === 'number' && Number.isInteger(digit) && digit >= 0 && digit < radix) {
      inputs[id] = digit
    }
  }
  return inputs
}

/** A project with one empty circuit. */
export function emptyProject(): LoadedProject {
  const doc: CircuitDoc = { components: {}, junctions: {}, wires: {}, nextId: 1 }
  return {
    circuits: { k1: { id: 'k1', name: 'Main', doc } },
    order: ['k1'],
    active: 'k1',
    settings: DEFAULT_SETTINGS,
    views: {},
    inputs: {},
    nextCircuit: 2,
  }
}

/**
 * Reads a project from plain data. The data may come from a file someone
 * edited by hand, so whatever makes no sense is dropped rather than trusted:
 * unknown parts, wires to pins that do not exist, a circuit inside itself.
 */
export function fromProjectData(data: ProjectData): LoadedProject {
  const settings = cleanSettings(data.settings)
  let circuits: Record<string, Circuit> = {}
  const order: string[] = []
  const given = new Map<string, CircuitData>()
  let highest = 0

  for (const item of Array.isArray(data.circuits) ? data.circuits : []) {
    if (!isObject(item) || typeof item.id !== 'string' || item.id === '' || item.id in circuits) {
      continue
    }
    const name = cleanCircuitName(typeof item.name === 'string' ? item.name : '')
    circuits[item.id] = {
      id: item.id,
      name: name ?? `Circuit ${order.length + 1}`,
      doc: docFromData(item as unknown as CircuitData),
    }
    order.push(item.id)
    given.set(item.id, item as unknown as CircuitData)
    const number = /^k(\d+)$/.exec(item.id)
    if (number) highest = Math.max(highest, Number(number[1]))
  }
  if (order.length === 0) return { ...emptyProject(), settings }

  // Cut every use that would put a circuit inside itself.
  for (const id of order) {
    for (const component of Object.values(circuits[id].doc.components)) {
      const target = component.sub?.circuit
      if (target === undefined) continue
      if (target in circuits && !contains(circuits, target, id)) continue
      const circuit = circuits[id]
      circuits = { ...circuits, [id]: { ...circuit, doc: deleteItems(circuit.doc, [component.id]) } }
    }
  }
  circuits = { ...reconcileAll(circuits) }
  for (const id of order) {
    const circuit = circuits[id]
    const doc = repairDoc(circuit.doc)
    if (doc !== circuit.doc) circuits[id] = { ...circuit, doc }
  }

  const views: Record<string, View> = {}
  const inputs: Record<string, Record<string, number>> = {}
  for (const id of order) {
    const item = given.get(id)
    const view = viewOf(item?.view)
    if (view) views[id] = view
    inputs[id] = inputsOf(item?.inputs, circuits[id].doc, settings.radix)
  }
  return {
    circuits,
    order,
    active: typeof data.active === 'string' && data.active in circuits ? data.active : order[0],
    settings,
    views,
    inputs,
    nextCircuit: highest + 1,
  }
}
