import { toProjectData } from './project.ts'
import type { ProjectData } from './project.ts'
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
}

const engines = new Map<string, Engine>()
/** Switch values a loaded project came with, for circuits not opened yet. */
let waitingInputs: Record<string, Readonly<Record<string, number>>> = {}

function engineOf(id: string, radix: number): Engine {
  let engine = engines.get(id)
  if (!engine) {
    const bridge = new SimBridge()
    bridge.sim.setRadix(radix)
    engine = { bridge, runner: new SimRunner(bridge.sim) }
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
  const sim = current().bridge.sim
  useSim.setState({
    time: sim.time,
    stable: sim.pendingEvents === 0,
    conflicts: sim.conflicts,
    revision: useSim.getState().revision + 1,
  })
}

/** Brings the open circuit's simulator in step with its drawing. */
function syncActive(state: EditorState): void {
  const { bridge } = engineOf(state.active, state.settings.radix)
  bridge.sync(state.doc, state.circuits)
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
  if (!current().bridge.cycleInput(docId, step)) return
  useSim.setState({ pokes: useSim.getState().pokes + 1 })
  publish()
}

/** Presses a push button or lets go of it. */
export function holdButton(docId: string, pressed: boolean): void {
  if (current().bridge.setButton(docId, pressed)) publish()
}

/** Advances a paused simulation by one tick. */
export function stepSimulation(): void {
  current().runner.step()
  publish()
}

/** Starts the circuit over from time 0, as if switched off and on. */
export function restartSimulation(): void {
  current().bridge.sim.restart()
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
