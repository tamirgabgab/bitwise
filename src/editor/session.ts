import { Z, formatSignal } from '../core/index.ts'
import type { CircuitCost, Digit, Probe, Signal } from '../core/index.ts'
import { terminalNets } from './connectivity.ts'
import { terminalEnd, terminalKey } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import type { Point } from './geometry.ts'
import { toProjectData } from './project.ts'
import type { ProjectData } from './project.ts'
import { Recorder, scopeSignals } from './scope.ts'
import type { ScopeSignal, ScopeValue } from './scope.ts'
import { SimBridge } from './simBridge.ts'
import type { NodePin } from './simBridge.ts'
import { SimRunner } from './simRunner.ts'
import { useSim } from './simStore.ts'
import type { BreakHit, BreakWhen } from './simStore.ts'
import type { InputValue } from './steps.ts'
import { useEditor } from './store.ts'
import type { EditorState } from './store.ts'
import type { View } from './view.ts'

/*
 * The simulators behind the project. Each circuit that has been opened has
 * one of its own, so a circuit is found as it was left when the user comes
 * back to its tab. Only the open one runs. Each follows every edit, so the
 * circuit exists in the engine at all times, as it does in CedarLogic.
 */

/** A wire the run stops at. */
interface Breakpoint {
  /** A terminal on the wire. It says which wire is meant after any edit. */
  readonly terminal: Terminal
  readonly when: BreakWhen
  /** What the wire carried at the previous tick. */
  last?: WireReading
}

interface WireReading {
  /** The lowest digit: all of a plain wire. */
  readonly digit: Digit
  readonly conflict: boolean
  /** Every digit, so a change anywhere on a bus is noticed. */
  readonly text: string
}

function wireReading(probe: Probe | undefined): WireReading {
  return {
    digit: probe ? probe.value[0] : Z,
    conflict: probe?.conflict ?? false,
    text: probe ? formatSignal(probe.value) : 'Z',
  }
}

interface Engine {
  readonly bridge: SimBridge
  readonly runner: SimRunner
  /** What the timing diagram of this circuit has seen so far. */
  readonly recorder: Recorder
  /** The breakpoints of this circuit, by `terminalKey`. */
  readonly breaks: Map<string, Breakpoint>
  cost: CircuitCost
}

/**
 * Looks at every breakpoint after a tick. Returns the first one whose wire
 * just did what it waits for.
 */
function checkBreaks(engine: Pick<Engine, 'bridge' | 'breaks'>): BreakHit | null {
  let hit: BreakHit | null = null
  for (const [key, point] of engine.breaks) {
    const now = wireReading(engine.bridge.probeTerminal(key))
    const before = point.last
    point.last = now
    if (!before || hit) continue
    const { when } = point
    const fired =
      when === 'change'
        ? before.text !== now.text || before.conflict !== now.conflict
        : when === 'conflict'
          ? now.conflict && !before.conflict
          : now.digit === when && before.digit !== when
    if (fired) hit = { key, digit: now.digit, conflict: now.conflict }
  }
  return hit
}

/** Notes what every row of the timing diagram carries at this moment. */
function record(bridge: SimBridge, recorder: Recorder, doc: CircuitDoc | undefined): void {
  if (!doc) return
  const values = new Map<string, ScopeValue>()
  for (const signal of scopeSignals(doc)) {
    const probe = bridge.probeTerminal(terminalKey(signal.pin))
    // A bus goes into the record as its digits written out.
    if (probe) values.set(signal.key, probe.value.length > 1 ? formatSignal(probe.value) : probe.value[0])
  }
  recorder.sample(bridge.sim.time, values)
}

const engines = new Map<string, Engine>()
/** The circuit whose breakpoints the chrome was last told about. */
let shownCircuit = ''
/** The push buttons each held-down key is keeping pressed. */
const heldKeys = new Map<string, string[]>()
/** Switch values a loaded project came with, for circuits not opened yet. */
let waitingInputs: Record<string, Readonly<Record<string, InputValue>>> = {}

function engineOf(id: string, radix: number): Engine {
  let engine = engines.get(id)
  if (!engine) {
    const bridge = new SimBridge()
    bridge.sim.setRadix(radix)
    const recorder = new Recorder()
    const breaks = new Map<string, Breakpoint>()
    // Only the open circuit runs, so its drawing is the one in the store.
    const runner = new SimRunner(bridge.sim, () => {
      record(bridge, recorder, useEditor.getState().circuits[id]?.doc)
      const hit = checkBreaks({ bridge, breaks })
      if (hit) useSim.setState({ running: false, breakHit: hit })
      return hit !== null
    })
    engine = { bridge, runner, recorder, breaks, cost: { gates: 0, depth: 0 } }
    engines.set(id, engine)
  }
  return engine
}

function current(): Engine {
  const state = useEditor.getState()
  return engineOf(state.active, state.settings.radix)
}

/** The simulator bridge of the circuit that is open. */
export function currentBridge(): SimBridge {
  return current().bridge
}

/** Tells the app shell and the canvas that the simulator moved. */
function publish(): void {
  const { bridge, runner, recorder, cost } = current()
  const sim = bridge.sim
  record(bridge, recorder, useEditor.getState().doc)
  const shown = useSim.getState()
  useSim.setState({
    time: sim.time,
    stable: sim.pendingEvents === 0,
    conflicts: sim.conflicts,
    clocks: bridge.clockPins().length,
    oscillating: runner.oscillating,
    canStepBack: runner.canStepBack,
    ...(shown.gates === cost.gates && shown.depth === cost.depth ? {} : cost),
    revision: shown.revision + 1,
  })
}

/** Tells the chrome which wires of the open circuit have a breakpoint. */
function publishBreaks(): void {
  const breakpoints: Record<string, BreakWhen> = {}
  for (const [key, point] of current().breaks) breakpoints[key] = point.when
  useSim.setState({ breakpoints })
}

/** The rows of the open circuit's timing diagram and the record behind them. */
export function currentScope(): {
  readonly signals: readonly ScopeSignal[]
  readonly recorder: Recorder
  readonly time: number
  readonly radix: number
} {
  const { bridge, recorder } = current()
  return {
    signals: scopeSignals(useEditor.getState().doc),
    recorder,
    time: bridge.sim.time,
    radix: bridge.sim.radix,
  }
}

/** Brings the open circuit's simulator in step with its drawing. */
function syncActive(state: EditorState): void {
  const engine = engineOf(state.active, state.settings.radix)
  const { bridge, runner, breaks } = engine
  bridge.sync(state.doc, state.circuits)
  engine.cost = bridge.cost()
  runner.nudge()
  // A breakpoint goes when the last terminal that said where it was goes.
  let dropped = false
  for (const [key, point] of breaks) {
    if (terminalEnd(state.doc, point.terminal)) continue
    breaks.delete(key)
    dropped = true
  }
  if (dropped || state.active !== shownCircuit) {
    shownCircuit = state.active
    publishBreaks()
  }
  const waiting = waitingInputs[state.active]
  if (waiting) {
    delete waitingInputs[state.active]
    for (const [id, value] of Object.entries(waiting)) bridge.setInput(id, value)
  }
}

function startProject(state: EditorState): void {
  engines.clear()
  heldKeys.clear()
  shownCircuit = ''
  waitingInputs = { ...state.restoredInputs }
  useSim.setState({ breakHit: null })
}

startProject(useEditor.getState())
syncActive(useEditor.getState())
publish()

useEditor.subscribe((state, previous) => {
  let changed = false
  if (state.epoch !== previous.epoch) {
    startProject(state)
    changed = true
  }
  if (state.settings.radix !== previous.settings.radix) {
    // A new radix starts every circuit over, the ones not on screen too.
    for (const engine of engines.values()) engine.bridge.sim.setRadix(state.settings.radix)
    waitingInputs = {}
    changed = true
  }
  if (state.circuits !== previous.circuits || state.active !== previous.active) {
    for (const id of engines.keys()) {
      if (!(id in state.circuits)) engines.delete(id)
    }
    changed = true
  }
  if (changed || state.doc !== previous.doc) {
    syncActive(state)
    publish()
  }
})

/** Clicks a switch on to its next value, or back to its previous one. */
export function pokeInput(docId: string, step: number): void {
  const { bridge, runner } = current()
  if (!bridge.cycleInput(docId, step)) return
  runner.nudge()
  useSim.setState({ pokes: useSim.getState().pokes + 1 })
  publish()
}

/**
 * Puts a switch of the open circuit on a value typed by the user. Returns
 * false when the switch cannot be on that value.
 */
export function setSwitch(docId: string, value: InputValue): boolean {
  const { bridge, runner } = current()
  if (!bridge.setInput(docId, value)) return false
  runner.nudge()
  useSim.setState({ pokes: useSim.getState().pokes + 1 })
  publish()
  return true
}

/** What a switch of the open circuit is on right now. */
export function switchValue(docId: string): InputValue | undefined {
  return current().bridge.inputValues()[docId]
}

/** Presses a push button or lets go of it. */
export function holdButton(docId: string, pressed: boolean): void {
  const { bridge, runner } = current()
  if (!bridge.setButton(docId, pressed)) return
  runner.nudge()
  publish()
}

/**
 * Works the switches and push buttons of the open circuit that were given
 * this key: a switch steps on by one, or back with `back`, and a button goes
 * down until the key is let go. Returns false when no part has the key.
 */
export function pressKey(code: string, back: boolean): boolean {
  const { bridge, runner } = current()
  const held: string[] = []
  let found = false
  for (const part of Object.values(useEditor.getState().doc.components)) {
    if (part.key !== code) continue
    if (bridge.cycleInput(part.id, back ? -1 : 1)) found = true
    else if (bridge.setButton(part.id, true)) held.push(part.id)
  }
  if (held.length > 0) heldKeys.set(code, held)
  if (!found && held.length === 0) return false
  runner.nudge()
  useSim.setState({ pokes: useSim.getState().pokes + 1 })
  publish()
  return true
}

/** Lets go of the push buttons a key was holding down. */
export function releaseKey(code: string): void {
  const held = heldKeys.get(code)
  if (!held) return
  heldKeys.delete(code)
  const { bridge, runner } = current()
  for (const id of held) bridge.setButton(id, false)
  runner.nudge()
  publish()
}

/** Lets go of every push button a key is holding, as when the window loses focus. */
export function releaseKeys(): void {
  for (const code of [...heldKeys.keys()]) releaseKey(code)
}

/** The parts of the open circuit that were evaluated at the current tick. */
export function evaluatedParts(): Set<string> {
  return current().bridge.evaluatedParts()
}

/** One pin on a wire, as the probe shows it. */
export interface ProbedPin extends NodePin {
  /** The label of the part, when it is a part of the open circuit. */
  readonly label?: string
  /** The name of the named circuit the pin is inside of, if it is. */
  readonly inside?: string
}

/** What the probe reads on a wire of the open circuit. */
export interface NodeInfo {
  readonly value: Digit
  /** Every digit the wire carries. More than one on a bus. */
  readonly signal: Signal
  readonly conflict: boolean
  /** True when pins of different widths are wired together here. */
  readonly mixed: boolean
  /** The name of a switch or output on the wire, or one made up from its net. */
  readonly name: string
  readonly drivers: readonly ProbedPin[]
  /** How many inputs read the wire. */
  readonly readers: number
}

/** Reads the wire at a terminal of the open circuit. */
export function describeNode(terminal: Terminal): NodeInfo {
  const doc = useEditor.getState().doc
  const reading = current().bridge.describeTerminal(terminalKey(terminal))
  if (!reading) {
    return {
      value: Z,
      signal: [Z],
      conflict: false,
      mixed: false,
      name: 'Not connected',
      drivers: [],
      readers: 0,
    }
  }
  const pins = reading.pins.map((pin): ProbedPin => {
    const [root, ...deeper] = pin.part.split('/')
    const part = doc.components[root]
    if (deeper.length > 0) return { ...pin, ...(part?.sub ? { inside: part.sub.name } : {}) }
    return { ...pin, ...(part?.label ? { label: part.label } : {}) }
  })
  const named = pins.find(
    (pin) => pin.label !== undefined && (pin.type === 'input' || pin.type === 'output'),
  )
  return {
    value: reading.value,
    signal: reading.signal,
    conflict: reading.conflict,
    mixed: reading.mixed,
    name: named?.label ?? (reading.net === undefined ? 'Not connected' : `Net ${reading.net}`),
    drivers: pins.filter((pin) => pin.drives),
    readers: pins.filter((pin) => !pin.drives).length,
  }
}

/** The key of the breakpoint on the wire at `terminal`, if it has one. */
function breakKeyOn(engine: Engine, doc: CircuitDoc, terminal: Terminal): string | undefined {
  const nets = terminalNets(doc)
  const key = terminalKey(terminal)
  const net = nets.get(key) ?? key
  for (const other of engine.breaks.keys()) {
    if ((nets.get(other) ?? other) === net) return other
  }
  return undefined
}

/** What the breakpoint on the wire at `terminal` waits for, if it has one. */
export function breakpointOn(terminal: Terminal): BreakWhen | undefined {
  const engine = current()
  const key = breakKeyOn(engine, useEditor.getState().doc, terminal)
  return key === undefined ? undefined : engine.breaks.get(key)?.when
}

/**
 * Puts a breakpoint on the wire at `terminal`, in place of the one it may
 * have, or takes it away when `when` is null.
 */
export function setBreakpoint(terminal: Terminal, when: BreakWhen | null): void {
  const engine = current()
  const existing = breakKeyOn(engine, useEditor.getState().doc, terminal)
  if (existing !== undefined) engine.breaks.delete(existing)
  if (when !== null) {
    const key = terminalKey(terminal)
    engine.breaks.set(key, {
      terminal,
      when,
      last: wireReading(engine.bridge.probeTerminal(key)),
    })
  }
  publishBreaks()
  useSim.setState({ revision: useSim.getState().revision + 1 })
}

/** Where on the canvas each breakpoint of the open circuit is marked. */
export function breakpointMarks(doc: CircuitDoc): Point[] {
  const marks: Point[] = []
  for (const point of current().breaks.values()) {
    const end = terminalEnd(doc, point.terminal)
    if (end) marks.push(end.pos)
  }
  return marks
}

/** Advances a paused simulation by one tick. */
export function stepSimulation(): void {
  useSim.setState({ breakHit: null })
  current().runner.step()
  publish()
}

/** Takes a paused simulation one tick back, if it remembers that far. */
export function stepBack(): void {
  const { bridge, runner, recorder, breaks } = current()
  if (!runner.stepBack()) {
    publish()
    return
  }
  recorder.rewind(bridge.sim.time)
  for (const point of breaks.values()) delete point.last
  useSim.setState({ breakHit: null, pokes: useSim.getState().pokes + 1 })
  publish()
}

/**
 * Advances a paused simulation until a clock next rises and that edge has
 * spread through the circuit.
 */
export function stepToClockEdge(): void {
  const { bridge, runner } = current()
  useSim.setState({ breakHit: null })
  runner.stepToEdge(bridge.clockPins())
  publish()
}

/** Starts the circuit over from time 0, as if switched off and on. */
export function restartSimulation(): void {
  const { bridge, runner } = current()
  bridge.sim.restart()
  runner.forget()
  runner.nudge()
  for (const point of current().breaks.values()) delete point.last
  useSim.setState({ breakHit: null })
  useSim.setState({ pokes: useSim.getState().pokes + 1 })
  publish()
}

/**
 * The whole project as plain data, ready to be written to a file: every
 * circuit, the settings, where each canvas was looking and what every
 * switch was on.
 */
export function projectSnapshot(): ProjectData {
  const state = useEditor.getState()
  const views: Record<string, View> = { [state.active]: state.view }
  const inputs: Record<string, Readonly<Record<string, InputValue>>> = {}
  for (const id of state.order) {
    const parked = state.parked[id]
    if (parked) views[id] = parked.view
    const engine = engines.get(id)
    inputs[id] = engine ? engine.bridge.inputValues() : (waitingInputs[id] ?? {})
  }
  return toProjectData(state, { views, inputs })
}

if (typeof requestAnimationFrame === 'function') {
  let last = performance.now()
  const frame = (now: number): void => {
    // A tab left in the background must not come back with minutes to catch up.
    const seconds = Math.min((now - last) / 1000, 0.1)
    last = now
    const { running, speed } = useSim.getState()
    if (running && current().runner.advance(seconds, speed)) publish()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/**
 * Shows a presentation step of the open circuit: its switches go to the
 * values the step keeps. A step past either end shows the nearest one.
 */
export function showStep(index: number): void {
  const editor = useEditor.getState()
  const steps = editor.circuits[editor.active].steps ?? []
  if (steps.length === 0) return
  const at = Math.max(0, Math.min(steps.length - 1, index))
  const { bridge, runner } = current()
  for (const [id, value] of Object.entries(steps[at].inputs)) bridge.setInput(id, value)
  editor.setStepIndex(at)
  runner.nudge()
  useSim.setState({ breakHit: null, pokes: useSim.getState().pokes + 1 })
  publish()
}

/** Keeps the switches as they are now as a new presentation step. */
export function addStepHere(): void {
  useEditor.getState().addStep(current().bridge.inputValues())
}

/** Puts the switches as they are now into the step on show. */
export function updateStepHere(): void {
  const editor = useEditor.getState()
  editor.setStepInputs(editor.stepIndex, current().bridge.inputValues())
}
