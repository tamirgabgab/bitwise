import { clockLevel } from '../core/index.ts'
import type { PinRef, SimSnapshot, Simulator } from '../core/index.ts'

/** Ticks per second, or 'max' to let every change settle at once. */
export type SimSpeed = number | 'max'

export const SIM_SPEEDS: readonly SimSpeed[] = [1, 5, 25, 100, 'max']
export const DEFAULT_SPEED: SimSpeed = 100

/** The most ticks one frame may simulate, so an oscillator cannot stall the page. */
const TICK_BUDGET = 2000

/** The most ticks a step to the next clock edge may take before giving up. */
const EDGE_BUDGET = 2500

/**
 * A circuit without a clock that is still changing after this many ticks is
 * taken to be going round in circles.
 */
export const OSCILLATION_TICKS = 200

/** How many ticks back `stepBack` can go. */
export const HISTORY_TICKS = 256

/**
 * Turns passing wall-clock time into simulator ticks.
 *
 * Time only moves while something is waiting to happen. A circuit at rest
 * costs nothing, and the tick counter then reads as "ticks of activity". A
 * circuit with a clock in it is never at rest.
 */
export class SimRunner {
  private readonly sim: Simulator
  private readonly onTick: (() => boolean | void) | undefined
  /** The circuit as it was before each of the last ticks, oldest first. */
  private history: SimSnapshot[] = []
  /** Fraction of a tick left over from earlier frames. */
  private carry = 0
  /** The tick at which the circuit was last at rest, or last given a push. */
  private quietAt = 0

  /**
   * `onTick` is called after every single tick, for whoever keeps a record.
   * When it returns true the run stops right there, as at a breakpoint.
   */
  constructor(sim: Simulator, onTick?: () => boolean | void) {
    this.sim = sim
    this.onTick = onTick
  }

  /**
   * Lets `seconds` of real time pass at the given speed. Returns true if the
   * simulator moved, which means the picture may have changed.
   */
  advance(seconds: number, speed: SimSpeed): boolean {
    const sim = this.sim
    if (sim.pendingEvents === 0) {
      this.carry = 0
      this.quietAt = sim.time
      return false
    }
    if (speed === 'max') {
      for (let i = 0; i < TICK_BUDGET && sim.pendingEvents > 0; i++) {
        if (this.tick()) break
      }
      return true
    }
    this.carry += seconds * speed
    const ticks = Math.min(Math.floor(this.carry), TICK_BUDGET)
    if (ticks < 1) return false
    this.carry = ticks === TICK_BUDGET ? 0 : this.carry - ticks
    for (let i = 0; i < ticks; i++) {
      if (this.tick()) {
        this.carry = 0
        break
      }
    }
    return true
  }

  /** Moves on by exactly one tick, for stepping through a paused circuit. */
  step(): void {
    this.carry = 0
    this.tick()
  }

  /**
   * Moves on until one of the given clock pins rises, and then until that
   * edge has spread through the circuit. Returns false if no clock rose
   * within a reasonable time.
   */
  stepToEdge(clocks: readonly PinRef[]): boolean {
    const sim = this.sim
    this.carry = 0
    const levels = (): string[] =>
      clocks.map((pin) => clockLevel(sim.readPin(pin)[0], sim.radix))
    let before = levels()
    let spent = 0
    let rose = false
    while (!rose && spent < EDGE_BUDGET) {
      if (this.tick()) return false
      spent++
      const after = levels()
      rose = after.some((level, index) => level === 'high' && before[index] === 'low')
      before = after
    }
    if (!rose) return false
    // What is left in the queue once only wake-ups remain is the next half
    // of the clock, which belongs to the next step.
    while (sim.pendingEvents > sim.pendingWakes && spent < EDGE_BUDGET) {
      if (this.tick()) break
      spent++
    }
    return true
  }

  /** True when there is an earlier tick to go back to. */
  get canStepBack(): boolean {
    const last = this.history[this.history.length - 1]
    return last !== undefined && this.sim.restorable(last)
  }

  /**
   * Goes back to how the circuit was before its latest tick. Returns false
   * when there is nothing to go back to: at most `HISTORY_TICKS` ticks are
   * kept, and none from before the circuit was last edited.
   */
  stepBack(): boolean {
    this.carry = 0
    const last = this.history.pop()
    if (last === undefined) return false
    if (!this.sim.restore(last)) {
      this.history = []
      return false
    }
    this.quietAt = Math.min(this.quietAt, this.sim.time)
    return true
  }

  /** Drops the history, for when the circuit starts over. */
  forget(): void {
    this.history = []
  }

  /**
   * Says that the circuit was just given a reason to change: an edit, a
   * switch, a restart. The count towards "oscillating" starts again.
   */
  nudge(): void {
    this.quietAt = this.sim.time
  }

  /**
   * True when the circuit has no clock and has still not come to rest long
   * after it was last touched: a loop that feeds itself, like an inverter
   * wired to its own input.
   */
  get oscillating(): boolean {
    const sim = this.sim
    return (
      sim.pendingWakes === 0 &&
      sim.pendingEvents > 0 &&
      sim.time - this.quietAt >= OSCILLATION_TICKS
    )
  }

  /** Moves on one tick. Returns true if the listener asked to stop. */
  private tick(): boolean {
    const history = this.history
    history.push(this.sim.snapshot())
    if (history.length > HISTORY_TICKS) history.shift()
    this.sim.run(1)
    return this.onTick?.() === true
  }
}
