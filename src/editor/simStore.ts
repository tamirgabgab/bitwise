import { create } from 'zustand'
import { DEFAULT_SPEED } from './simRunner.ts'
import type { SimSpeed } from './simRunner.ts'

/** What the app shell shows and controls about the running simulation. */
export interface SimState {
  readonly running: boolean
  readonly speed: SimSpeed
  /** The simulator's clock, in ticks. */
  readonly time: number
  /** True when no change is waiting to happen. */
  readonly stable: boolean
  /** Nets that two outputs are fighting over. */
  readonly conflicts: number
  /** Goes up whenever values may have changed, so the canvas repaints. */
  readonly revision: number
  /** Goes up whenever a switch is put on another value. */
  readonly pokes: number

  setRunning(running: boolean): void
  setSpeed(speed: SimSpeed): void
}

export const useSim = create<SimState>()((set) => ({
  running: true,
  speed: DEFAULT_SPEED,
  time: 0,
  stable: true,
  conflicts: 0,
  revision: 0,
  pokes: 0,

  setRunning(running) {
    set({ running })
  },
  setSpeed(speed) {
    set({ speed })
  },
}))
