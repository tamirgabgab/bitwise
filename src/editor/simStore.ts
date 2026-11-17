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
  /** How many clocks the open circuit has, the ones inside its parts too. */
  readonly clocks: number
  /** True when a circuit without a clock keeps changing and never rests. */
  readonly oscillating: boolean
  /** Whether the timing diagram is on screen. */
  readonly scopeOpen: boolean

  setRunning(running: boolean): void
  setSpeed(speed: SimSpeed): void
  setScopeOpen(open: boolean): void
}

export const useSim = create<SimState>()((set) => ({
  running: true,
  speed: DEFAULT_SPEED,
  time: 0,
  stable: true,
  conflicts: 0,
  revision: 0,
  pokes: 0,
  clocks: 0,
  oscillating: false,
  scopeOpen: false,

  setRunning(running) {
    set({ running })
  },
  setSpeed(speed) {
    set({ speed })
  },
  setScopeOpen(scopeOpen) {
    set({ scopeOpen })
  },
}))
