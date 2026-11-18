import {
  MAX_RADIX,
  MIN_RADIX,
  builtinComponents,
  defaultPresetId,
  findPreset,
  presetAvailable,
  resolveParams,
} from '../core/index.ts'

/*
 * The project file: a whole project as JSON. `parseProject` checks a text
 * before the editor sees it, so a broken or foreign file gives a message the
 * user can act on instead of a half-loaded drawing.
 */

/** Marks a JSON document as a Cedar Logic project. */
export const FILE_FORMAT = 'cedar-logic'

/**
 * Version written into every saved project file. Bump it on any breaking
 * change to the format and add a migration for the previous version to
 * `MIGRATIONS`.
 */
export const FILE_FORMAT_VERSION = 1

/** The type of a part that stands for another circuit of the project. */
const CIRCUIT_PART = 'circuit'
/** The type of a part that is only writing on the canvas. */
const TEXT_PART = 'text'
const FRAME_PART = 'frame'
const NET_PART = 'net'

export interface FilePoint {
  readonly x: number
  readonly y: number
}

export type FileTerminal =
  | { readonly kind: 'pin'; readonly component: string; readonly port: string }
  | { readonly kind: 'junction'; readonly junction: string }

export interface FileComponent {
  readonly id: string
  readonly type: string
  readonly params: Readonly<Record<string, number>>
  readonly delay: number
  readonly pos: FilePoint
  /** Quarter turns clockwise, 0 to 3. */
  readonly rotation: number
  readonly label?: string
  /** The keyboard key that works a switch or a push button, as a key code. */
  readonly key?: string
  /** On a part of type "circuit": the id of the circuit it stands for. */
  readonly circuit?: string
  /** On a part of type "text": the writing of the label. On a "frame": its title. */
  readonly text?: string
  /** On a part of type "frame": its width and height. */
  readonly size?: FilePoint
}

export interface FileJunction {
  readonly id: string
  readonly pos: FilePoint
}

export interface FileWire {
  readonly id: string
  readonly from: FileTerminal
  readonly to: FileTerminal
  /** How a bus on the wire is written, when not as its digits. */
  readonly format?: 'decimal' | 'balanced' | 'hex'
}

const WIRE_FORMATS: readonly string[] = ['decimal', 'balanced', 'hex']

export interface FileView {
  readonly panX: number
  readonly panY: number
  readonly zoom: number
}

export interface FileCircuit {
  readonly id: string
  readonly name: string
  /** Counter behind the ids of the parts, junctions and wires. */
  readonly nextId: number
  readonly components: readonly FileComponent[]
  readonly junctions: readonly FileJunction[]
  readonly wires: readonly FileWire[]
  readonly view?: FileView
  /** The value each switch was on, by part id. */
  readonly inputs?: Readonly<Record<string, FileInput>>
  /** The presentation steps: a note and the switch values to show with it. */
  readonly steps?: readonly FileStep[]
}

/**
 * What a switch is on: a digit, or for a switch on a bus its digits as
 * text, the most significant first.
 */
export type FileInput = number | string

export interface FileStep {
  readonly note: string
  readonly inputs: Readonly<Record<string, FileInput>>
}

function isFileInput(value: unknown): value is FileInput {
  if (typeof value === 'string') return /^[0-9A-F]{2,64}$/.test(value)
  return isWhole(value) && value >= 0 && value < MAX_RADIX
}

export interface FileSettings {
  readonly radix: number
  readonly preset: string
  readonly sandbox: boolean
  readonly palette: readonly string[]
  readonly classicColors: boolean
  readonly showDigits: boolean
  readonly balanced: boolean
}

export interface ProjectFile {
  readonly settings: FileSettings
  readonly circuits: readonly FileCircuit[]
  /** Id of the circuit that was open. */
  readonly active: string
}

/** Why a text could not be read as a project. The message is for the user. */
export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFileError'
  }
}

type Json = Record<string, unknown>

/**
 * Upgrades of older formats, by the version they start from: entry 1 turns a
 * version 1 document into version 2, and so on. Empty while there is only
 * one version.
 */
const MIGRATIONS: Readonly<Record<number, (data: Json) => Json>> = {}

const PALETTE_SIZE = 10
/**
 * The colors a file without a palette of its own gets: black, blue, red,
 * green, yellow, purple, orange, turquoise, pink, white. The editor starts a
 * new project with the same ones; a test in `src/ui` holds the two together.
 */
const FALLBACK_PALETTE: readonly string[] = [
  '#14181b',
  '#2f6fed',
  '#e03131',
  '#1f9d55',
  '#e8b400',
  '#9141d9',
  '#f2710c',
  '#12b5cb',
  '#e64d9a',
  '#ffffff',
]

function fail(message: string): never {
  throw new ProjectFileError(message)
}

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

function listOf(value: unknown, what: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${what} must be a list.`)
  return value
}

function pointOf(value: unknown, what: string): FilePoint {
  if (
    !isObject(value) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y)
  ) {
    fail(`${what} has no valid position.`)
  }
  return { x: value.x, y: value.y }
}

function idOf(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') fail(`${what} has no id.`)
  return value
}

function settingsOf(value: unknown): FileSettings {
  const given = isObject(value) ? value : {}
  let radix = 2
  if (given.radix !== undefined) {
    if (!isWhole(given.radix) || given.radix < MIN_RADIX || given.radix > MAX_RADIX) {
      fail(`The radix must be a whole number from ${MIN_RADIX} to ${MAX_RADIX}.`)
    }
    radix = given.radix
  }
  const kit = typeof given.preset === 'string' ? findPreset(given.preset) : undefined
  const colors = given.palette
  const palette =
    Array.isArray(colors) &&
    colors.length === PALETTE_SIZE &&
    colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      ? (colors as string[])
      : FALLBACK_PALETTE
  const flag = (name: string, fallback: boolean): boolean => {
    const stored = given[name]
    return typeof stored === 'boolean' ? stored : fallback
  }
  return {
    radix,
    preset: kit && presetAvailable(kit, radix) ? kit.id : defaultPresetId(radix),
    sandbox: flag('sandbox', false),
    palette,
    classicColors: flag('classicColors', true),
    showDigits: flag('showDigits', radix > 2),
    balanced: flag('balanced', false),
  }
}

function componentOf(value: unknown, where: string, circuitIds: ReadonlySet<string>): FileComponent {
  if (!isObject(value)) fail(`${where}: a part is not an object.`)
  const id = idOf(value.id, `${where}: a part`)
  const what = `${where}: part ${id}`
  const pos = pointOf(value.pos, what)
  const rotation = value.rotation ?? 0
  if (!isWhole(rotation) || rotation < 0 || rotation > 3) fail(`${what} has an invalid rotation.`)
  const delay = value.delay ?? 1
  if (!isWhole(delay) || delay < 1) fail(`${what} must have a delay of at least 1.`)
  if (value.label !== undefined && typeof value.label !== 'string') {
    fail(`${what} has a label that is not text.`)
  }
  const label = typeof value.label === 'string' && value.label.trim() !== '' ? value.label : undefined
  const named = label === undefined ? {} : { label }
  const key = value.key
  if (key !== undefined) {
    const fits =
      typeof key === 'string' && /^(Key[A-Z]|Digit[0-9])$/.test(key) && key !== 'KeyR'
    if (!fits || (value.type !== 'input' && value.type !== 'button')) {
      fail(`${what} has a keyboard key it cannot have.`)
    }
  }
  const keyed = typeof key === 'string' ? { key } : {}

  if (value.type === CIRCUIT_PART) {
    if (typeof value.circuit !== 'string' || !circuitIds.has(value.circuit)) {
      fail(`${what} stands for a circuit that is not in the file.`)
    }
    return { id, type: CIRCUIT_PART, params: {}, delay: 1, pos, rotation, circuit: value.circuit }
  }
  if (value.type === TEXT_PART) {
    if (typeof value.text !== 'string' || value.text.trim() === '') {
      fail(`${what} is a text label with nothing written on it.`)
    }
    return { id, type: TEXT_PART, params: {}, delay: 1, pos, rotation: 0, text: value.text }
  }
  if (value.type === NET_PART) {
    if (label === undefined) fail(`${what} is a net label with no name.`)
    return { id, type: NET_PART, params: {}, delay: 1, pos, rotation, label }
  }
  if (value.type === FRAME_PART) {
    if (typeof value.text !== 'string' || value.text.trim() === '') fail(`${what} is a frame with no title.`)
    const size = pointOf(value.size, what)
    if (size.x <= 0 || size.y <= 0) fail(`${what} is a frame with no size.`)
    return { id, type: FRAME_PART, params: {}, delay: 1, pos, rotation: 0, text: value.text, size }
  }
  if (typeof value.type !== 'string' || !builtinComponents.has(value.type)) {
    fail(`${what} has the unknown type "${String(value.type)}".`)
  }
  const given = value.params ?? {}
  if (!isObject(given) || !Object.values(given).every((item) => typeof item === 'number')) {
    fail(`${what} has parameters that are not numbers.`)
  }
  let params: Readonly<Record<string, number>>
  try {
    params = resolveParams(builtinComponents.get(value.type), given as Record<string, number>)
  } catch (error) {
    fail(`${what}: ${error instanceof Error ? error.message : 'invalid parameters'}.`)
  }
  return { id, type: value.type, params, delay, pos, rotation, ...named, ...keyed }
}

function terminalOf(
  value: unknown,
  what: string,
  parts: ReadonlySet<string>,
  junctions: ReadonlySet<string>,
): FileTerminal {
  if (isObject(value) && value.kind === 'pin') {
    if (typeof value.component !== 'string' || !parts.has(value.component)) {
      fail(`${what} ends on a part that is not in the circuit.`)
    }
    if (typeof value.port !== 'string' || value.port === '') fail(`${what} ends on no pin.`)
    return { kind: 'pin', component: value.component, port: value.port }
  }
  if (isObject(value) && value.kind === 'junction') {
    if (typeof value.junction !== 'string' || !junctions.has(value.junction)) {
      fail(`${what} ends on a junction that is not in the circuit.`)
    }
    return { kind: 'junction', junction: value.junction }
  }
  return fail(`${what} has an end that is neither a pin nor a junction.`)
}

function viewOf(value: unknown): FileView | undefined {
  if (!isObject(value)) return undefined
  const { panX, panY, zoom } = value
  if (typeof panX !== 'number' || typeof panY !== 'number' || typeof zoom !== 'number') {
    return undefined
  }
  if (![panX, panY, zoom].every(Number.isFinite) || zoom <= 0) return undefined
  return { panX, panY, zoom }
}

function circuitOf(value: Json, id: string, circuitIds: ReadonlySet<string>): FileCircuit {
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (name === '') fail(`Circuit ${id} has no name.`)
  const where = `Circuit "${name}"`

  const taken = new Set<string>()
  const claim = (itemId: string): void => {
    if (taken.has(itemId)) fail(`${where}: the id ${itemId} is used twice.`)
    taken.add(itemId)
  }

  const components = listOf(value.components, `${where}: the parts`).map((item) =>
    componentOf(item, where, circuitIds),
  )
  for (const component of components) claim(component.id)
  const parts = new Set(taken)

  const junctions = listOf(value.junctions, `${where}: the junctions`).map((item): FileJunction => {
    if (!isObject(item)) fail(`${where}: a junction is not an object.`)
    const junctionId = idOf(item.id, `${where}: a junction`)
    return { id: junctionId, pos: pointOf(item.pos, `${where}: junction ${junctionId}`) }
  })
  for (const junction of junctions) claim(junction.id)
  const junctionIds = new Set(junctions.map((junction) => junction.id))

  const wires = listOf(value.wires, `${where}: the wires`).map((item): FileWire => {
    if (!isObject(item)) fail(`${where}: a wire is not an object.`)
    const wireId = idOf(item.id, `${where}: a wire`)
    const what = `${where}: wire ${wireId}`
    if (item.format !== undefined && !WIRE_FORMATS.includes(item.format as string)) {
      fail(`${what} is written in a way this app does not know.`)
    }
    return {
      id: wireId,
      from: terminalOf(item.from, what, parts, junctionIds),
      to: terminalOf(item.to, what, parts, junctionIds),
      ...(item.format === undefined ? {} : { format: item.format as FileWire['format'] }),
    }
  })
  for (const wire of wires) claim(wire.id)

  let highest = 0
  for (const itemId of taken) {
    const number = Number(itemId.slice(1))
    if (Number.isInteger(number)) highest = Math.max(highest, number)
  }
  const nextId = isWhole(value.nextId) ? Math.max(value.nextId, highest + 1) : highest + 1

  const inputs: Record<string, FileInput> = {}
  if (isObject(value.inputs)) {
    for (const [partId, digit] of Object.entries(value.inputs)) {
      if (parts.has(partId) && isFileInput(digit)) inputs[partId] = digit
    }
  }
  const steps: FileStep[] = []
  if (value.steps !== undefined) {
    for (const item of listOf(value.steps, `${where}: the steps`)) {
      if (!isObject(item)) fail(`${where}: a step is not an object.`)
      if (item.note !== undefined && typeof item.note !== 'string') {
        fail(`${where}: a step has a note that is not text.`)
      }
      const shown: Record<string, FileInput> = {}
      if (isObject(item.inputs)) {
        for (const [partId, digit] of Object.entries(item.inputs)) {
          if (parts.has(partId) && isFileInput(digit)) shown[partId] = digit
        }
      }
      steps.push({ note: item.note ?? '', inputs: shown })
    }
  }
  const view = viewOf(value.view)
  return {
    id,
    name,
    nextId,
    components,
    junctions,
    wires,
    ...(view ? { view } : {}),
    ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
    ...(steps.length > 0 ? { steps } : {}),
  }
}

/** Fails if a circuit has itself inside, directly or through others. */
function checkNesting(circuits: readonly FileCircuit[]): void {
  const uses = new Map<string, string[]>()
  const names = new Map<string, string>()
  for (const circuit of circuits) {
    names.set(circuit.id, circuit.name)
    uses.set(
      circuit.id,
      circuit.components.flatMap((part) => (part.circuit === undefined ? [] : [part.circuit])),
    )
  }
  const done = new Set<string>()
  const open = new Set<string>()
  const visit = (id: string): void => {
    if (done.has(id)) return
    if (open.has(id)) fail(`Circuit "${names.get(id)}" contains itself.`)
    open.add(id)
    for (const used of uses.get(id) ?? []) visit(used)
    open.delete(id)
    done.add(id)
  }
  for (const circuit of circuits) visit(circuit.id)
}

/**
 * Reads a project from the text of a file. Throws a `ProjectFileError`, with
 * a message meant for the user, when the text is not a project this version
 * can open.
 */
export function parseProject(text: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    fail('This is not a Cedar Logic project: the file is not valid JSON.')
  }
  if (!isObject(data) || data.format !== FILE_FORMAT) {
    fail('This is not a Cedar Logic project file.')
  }
  const version = data.version
  if (!isWhole(version) || version < 1) fail('The project file has no valid format version.')
  if (version > FILE_FORMAT_VERSION) {
    fail(
      `This project was saved by a newer version of Cedar Logic (file format ${version}). ` +
        'Update the app to open it.',
    )
  }
  let current: Json = data
  for (let from = version; from < FILE_FORMAT_VERSION; from++) {
    const migrate = MIGRATIONS[from]
    if (!migrate) fail(`File format ${from} can no longer be opened.`)
    current = migrate(current)
  }

  const items = listOf(current.circuits, 'The circuits')
  if (items.length === 0) fail('The project file has no circuits.')
  const ids = new Set<string>()
  for (const item of items) {
    if (!isObject(item)) fail('A circuit is not an object.')
    const id = idOf(item.id, 'A circuit')
    if (ids.has(id)) fail(`The circuit id ${id} is used twice.`)
    ids.add(id)
  }
  const circuits = items.map((item) => circuitOf(item as Json, (item as Json).id as string, ids))
  checkNesting(circuits)

  return {
    settings: settingsOf(current.settings),
    circuits,
    active:
      typeof current.active === 'string' && ids.has(current.active)
        ? current.active
        : circuits[0].id,
  }
}

/** Writes a project as the text of a file. */
export function serializeProject(project: ProjectFile, pretty = false): string {
  const document = {
    format: FILE_FORMAT,
    version: FILE_FORMAT_VERSION,
    settings: project.settings,
    active: project.active,
    circuits: project.circuits,
  }
  return JSON.stringify(document, null, pretty ? 2 : undefined)
}
