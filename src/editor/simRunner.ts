import type { Simulator } from '../core/index.ts'

/** Ticks per second, or 'max' to let every change settle at once. */
export type SimSpeed = number | 'max'

export const SIM_SPEEDS: readonly SimSpeed[] = [1, 5, 25, 100, 'max']
export const DEFAULT_SPEED: SimSpeed = 100

/** The most ticks one frame may simulate, so an oscillator cannot stall the page. */
const TICK_BUDGET = 2000

/**
 * Turns passing wall-clock time into simulator ticks.
 *
 * Time only moves while something is waiting to happen. A circuit at rest
 * costs nothing, and the tick counter then reads as "ticks of activity".
 */
export class SimRunner {
  private readonly sim: Simulator
  /** Fraction of a tick left over from earlier frames. */
  private carry = 0

  constructor(sim: Simulator) {
    this.sim = sim
  }

  /**
   * Lets `seconds` of real time pass at the given speed. Returns true if the
   * simulator moved, which means the picture may have changed.
   */
  advance(seconds: number, speed: SimSpeed): boolean {
    const sim = this.sim
    if (sim.pendingEvents === 0) {
      this.carry = 0
      return false
    }
    if (speed === 'max') {
      sim.settle(TICK_BUDGET)
      return true
    }
    this.carry += seconds * speed
    const ticks = Math.min(Math.floor(this.carry), TICK_BUDGET)
    if (ticks < 1) return false
    this.carry = ticks === TICK_BUDGET ? 0 : this.carry - ticks
    sim.run(ticks)
    return true
  }

  /** Moves on by exactly one tick, for stepping through a paused circuit. */
  step(): void {
    this.carry = 0
    this.sim.step()
  }
}
