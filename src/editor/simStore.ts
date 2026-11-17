import { create } from 'zustand'
import { DEFAULT_SPEED } from './simRunner.ts'
import type { SimSpeed } from './simRunner.ts'

/**
 * When a breakpoint on a wire stops the run: on any change, when the wire
 * goes into conflict, or when it takes one value.
 */
export type BreakWhen = 'change' | 'conflict' | number

/** The breakpoint that stopped the run, and what the wire carried then. */
export interface BreakHit {
  /** `terminalKey` of the terminal the breakpoint sits on. */
  readonly key: string
  readonly digit: number
  readonly conflict: boolean
}

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
  /** How many gates the open circuit has, the ones inside its parts too. */
  readonly gates: number
  /** Its longest path in ticks, or undefined when it has a loop. */
  readonly depth: number | undefined
  /** Whether the canvas marks the longest path. */
  readonly criticalShown: boolean
  /** True when there is an earlier tick to step back to. */
  readonly canStepBack: boolean
  /** The breakpoints of the open circuit, by `terminalKey`. */
  readonly breakpoints: Readonly<Record<string, BreakWhen>>
  /** Set while the run stands still at a breakpoint. */
  readonly breakHit: BreakHit | null
  /**
   * The wires of the open circuit that have a row of their own in the
   * timing diagram, by `terminalKey`.
   */
  readonly watched: readonly string[]

  setRunning(running: boolean): void
  setSpeed(speed: SimSpeed): void
  setScopeOpen(open: boolean): void
  setCriticalShown(shown: boolean): void
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
  gates: 0,
  depth: 0,
  criticalShown: false,
  canStepBack: false,
  breakpoints: {},
  breakHit: null,
  watched: [],

  setRunning(running) {
    set(running ? { running, breakHit: null } : { running })
  },
  setSpeed(speed) {
    set({ speed })
  },
  setCriticalShown(criticalShown) {
    set({ criticalShown })
  },
  setScopeOpen(scopeOpen) {
    set({ scopeOpen })
  },
}))
