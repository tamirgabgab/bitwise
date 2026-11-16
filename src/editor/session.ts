import { SimBridge } from './simBridge.ts'
import { SimRunner } from './simRunner.ts'
import { useSim } from './simStore.ts'
import { useEditor } from './store.ts'

/**
 * The simulator behind the drawing on screen. It follows every edit, so the
 * circuit exists in the engine at all times, as it does in CedarLogic.
 */
export const simBridge = new SimBridge()

const runner = new SimRunner(simBridge.sim)

/** Tells the app shell and the canvas that the simulator moved. */
function publish(): void {
  const sim = simBridge.sim
  useSim.setState({
    time: sim.time,
    stable: sim.pendingEvents === 0,
    conflicts: sim.conflicts,
    revision: useSim.getState().revision + 1,
  })
}

simBridge.sim.setRadix(useEditor.getState().settings.radix)
simBridge.sync(useEditor.getState().doc)
publish()

useEditor.subscribe((state, previous) => {
  let changed = false
  if (state.settings.radix !== previous.settings.radix) {
    simBridge.sim.setRadix(state.settings.radix)
    changed = true
  }
  if (state.doc !== previous.doc) {
    simBridge.sync(state.doc)
    changed = true
  }
  if (changed) publish()
})

/** Clicks a switch on to its next value, or back to its previous one. */
export function pokeInput(docId: string, step: number): void {
  if (simBridge.cycleInput(docId, step)) publish()
}

/** Presses a push button or lets go of it. */
export function holdButton(docId: string, pressed: boolean): void {
  if (simBridge.setButton(docId, pressed)) publish()
}

/** Advances a paused simulation by one tick. */
export function stepSimulation(): void {
  runner.step()
  publish()
}

/** Starts the circuit over from time 0, as if switched off and on. */
export function restartSimulation(): void {
  simBridge.sim.restart()
  publish()
}

if (typeof requestAnimationFrame === 'function') {
  let last = performance.now()
  const frame = (now: number): void => {
    // A tab left in the background must not come back with minutes to catch up.
    const seconds = Math.min((now - last) / 1000, 0.1)
    last = now
    const { running, speed } = useSim.getState()
    if (running && runner.advance(seconds, speed)) publish()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
