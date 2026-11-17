import { create } from 'zustand'
import type { Terminal } from './document.ts'

/** Where the pointer rests on a wire, for the probe that reads it. */
export interface ProbeAt {
  /** The pointer, in pixels from the top left of the canvas. */
  readonly x: number
  readonly y: number
  /** A terminal on the wire under the pointer. */
  readonly terminal: Terminal
}

/** The wire the pointer is on. The canvas writes it, the probe bubble reads it. */
export const useProbe = create<{ readonly at: ProbeAt | null }>()(() => ({ at: null }))
