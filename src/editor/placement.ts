import { MAX_WAYS } from '../core/index.ts'

/*
 * What a part starts with when it is placed. Most parts start with their
 * defaults. A part that chooses starts with one way for every value of the
 * radix, so that one select digit reaches them all.
 */

/** The parameter that says how many ways a choosing part has, by type. */
const WAYS: Readonly<Record<string, string>> = {
  mux: 'inputs',
  demux: 'outputs',
  decoder: 'outputs',
}

/** The parameters to place a part of this type with, when not its defaults. */
export function placementParams(type: string, radix: number): Record<string, number> | undefined {
  const name = WAYS[type]
  return name === undefined ? undefined : { [name]: Math.min(MAX_WAYS, Math.max(2, radix)) }
}
