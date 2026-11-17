import type { Digit } from '../core/index.ts'
import { terminalKey } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { toProjectData } from './project.ts'
import type { ProjectData } from './project.ts'
import { Recorder, scopeSignals } from './scope.ts'
import type { ScopeSignal } from './scope.ts'
import { SimBridge } from './simBridge.ts'
import { SimRunner } from './simRunner.ts'
import { useSim } from './simStore.ts'
import { useEditor } from './store.ts'
import type { EditorState } from './store.ts'
import type { View } from './view.ts'

/*
 * The simulators behind the project. Each circuit that has been opened has
 * one of its own, so a circuit is found as it was left when the user comes
 * back to its tab. Only the open one runs. Each follows every edit, so the
 * circuit exists in the engine at all times, as it does in CedarLogic.
 */

interface Engine {
  readonly bridge: SimBridge
  readonly runner: SimRunner
  /** What the timing diagram of this circuit has seen so far. */
  readonly recorder: Recorder
}

/** Notes what every row of the timing diagram carries at this moment. */
function record(bridge: SimBridge, recorder: Recorder, doc: CircuitDoc | undefined): void {
  if (!doc) return
  const values = new Map<string, Digit>()
  for (const signal of scopeSignals(doc)) {
    const probe = bridge.probeTerminal(terminalKey(signal.pin))
    if (probe) values.set(signal.key, probe.value[0])
  }
  recorder.sample(bridge.sim.time, values)
}

const engines = new Map<string, Engine>()
/** Switch values a loaded project came with, for circuits not opened yet. */
let waitingInputs: Record<string, Readonly<Record<string, number>>> = {}

function engineOf(id: string, radix: number): Engine {
  let engine = engines.get(id)
  if (!engine) {
    const bridge = new SimBridge()
    bridge.sim.setRadix(radix)
    const recorder = new Recorder()
    // Only the open circuit runs, so its drawing is the one in the store.
    const runner = new SimRunner(bridge.sim, () =>
      record(bridge, recorder, useEditor.getState().circuits[id]?.doc),
    )
    engine = { bridge, runner, recorder }
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
  const { bridge, runner, recorder } = current()
  const sim = bridge.sim
  record(bridge, recorder, useEditor.getState().doc)
  useSim.setState({
    time: sim.time,
    stable: sim.pendingEvents === 0,
    conflicts: sim.conflicts,
    clocks: bridge.clockPins().length,
    oscillating: runner.oscillating,
    revision: useSim.getState().revision + 1,
  })
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
  const { bridge, runner } = engineOf(state.active, state.settings.radix)
  bridge.sync(state.doc, state.circuits)
  runner.nudge()
  const waiting = waitingInputs[state.active]
  if (waiting) {
    delete waitingInputs[state.active]
    for (const [id, digit] of Object.entries(waiting)) bridge.setInput(id, digit)
  }
}

function startProject(state: EditorState): void {
  engines.clear()
  waitingInputs = { ...state.restoredInputs }
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

/** Presses a push button or lets go of it. */
export function holdButton(docId: string, pressed: boolean): void {
  const { bridge, runner } = current()
  if (!bridge.setButton(docId, pressed)) return
  runner.nudge()
  publish()
}

/** Advances a paused simulation by one tick. */
export function stepSimulation(): void {
  current().runner.step()
  publish()
}

/**
 * Advances a paused simulation until a clock next rises and that edge has
 * spread through the circuit.
 */
export function stepToClockEdge(): void {
  const { bridge, runner } = current()
  runner.stepToEdge(bridge.clockPins())
  publish()
}

/** Starts the circuit over from time 0, as if switched off and on. */
export function restartSimulation(): void {
  const { bridge, runner } = current()
  bridge.sim.restart()
  runner.nudge()
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
  const inputs: Record<string, Readonly<Record<string, number>>> = {}
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
