import type { ComponentDef, ParamSpec, Params } from '../component.ts'
import { MAX_RADIX, X, filled } from '../signal.ts'
import type { Digit, Signal } from '../signal.ts'
import { either, flag, taken } from './register.ts'
import { clockLevel } from './sequential.ts'
import type { ClockLevel } from './sequential.ts'

/*
 * Memory with an address: a ROM, which only answers, and a RAM, which also
 * takes a word on the rising edge of its clock. Both hold at most
 * `MAX_WORDS` words of at most `MAX_WORD_WIDTH` digits, at any radix.
 *
 * The contents are the parameters `m0` to `m255`, one word each, written
 * for the largest radix: digit i of a word counts 16 ** i. So the contents
 * stay when the radix changes, and a digit the radix has no room for reads
 * as X, as in a table gate. A RAM starts from the same contents, and goes
 * back to them on a restart.
 *
 * A word at an address the radix reaches but the memory does not hold (at
 * radix 16 with three address digits, 256 and up) reads as X, and a write
 * there is lost.
 */

/** The most words one memory holds. */
export const MAX_WORDS = 256

/** The widest word, in digits: 16 ** 8 still counts exactly. */
export const MAX_WORD_WIDTH = 8

/** The most address digits: at radix 2, 8 of them reach every word. */
export const MAX_ADDRESS = 8

/** The parameter that holds the word at `address`. */
export function memoryCell(address: number): string {
  return `m${address}`
}

/** How many words a memory holds at a radix: one for each address, up to `MAX_WORDS`. */
export function wordCount(addressDigits: number, radix: number): number {
  return Math.min(radix ** addressDigits, MAX_WORDS)
}

/** A word as its parameter keeps it. Digits that are not values count as 0. */
export function packWord(word: Signal): number {
  let value = 0
  for (let index = word.length - 1; index >= 0; index--) {
    const digit = word[index]
    value = value * MAX_RADIX + (digit >= 0 && digit < MAX_RADIX ? digit : 0)
  }
  return value
}

/** The word a parameter keeps, `width` digits wide; a digit past the radix reads as X. */
export function unpackWord(value: number, width: number, radix: number): Signal {
  const word: Digit[] = []
  let rest = value
  for (let index = 0; index < width; index++) {
    const digit = rest % MAX_RADIX
    word.push(digit < radix ? digit : X)
    rest = Math.floor(rest / MAX_RADIX)
  }
  return word
}

/** The address an input names, or undefined when one of its digits is not a value. */
export function addressOf(signal: Signal, radix: number): number | undefined {
  let address = 0
  for (let index = signal.length - 1; index >= 0; index--) {
    const digit = signal[index]
    if (digit < 0 || digit >= radix) return undefined
    address = address * radix + digit
  }
  return address
}

/** The contents a memory starts from, word by word, as the largest radix writes them. */
export function initialWords(params: Params): Signal[] {
  return Array.from({ length: MAX_WORDS }, (_, address) =>
    unpackWord(params[memoryCell(address)], params.width, MAX_RADIX),
  )
}

const params: Record<string, ParamSpec> = {
  address: { default: 4, min: 1, max: MAX_ADDRESS },
  width: { default: 4, min: 1, max: MAX_WORD_WIDTH },
}
const cellParam: ParamSpec = { default: 0, min: 0, max: MAX_RADIX ** MAX_WORD_WIDTH - 1 }
for (let address = 0; address < MAX_WORDS; address++) params[memoryCell(address)] = cellParam

/** A word read at a radix: a digit it has no room for is X. */
function readable(word: Signal, radix: number): Signal {
  return word.map((digit) => (digit >= 0 && digit < radix ? digit : X))
}

/** A ROM: `q` is the word at the address on `a`. */
export const rom: ComponentDef = {
  type: 'rom',
  params,
  ports({ address, width }) {
    return [
      { name: 'a', direction: 'in', width: address },
      { name: 'q', direction: 'out', width },
    ]
  },
  evaluate(inputs, params, _state, { radix }) {
    const at = addressOf(inputs.a, radix)
    const q =
      at === undefined || at >= wordCount(params.address, radix)
        ? filled(params.width, X)
        : unpackWord(params[memoryCell(at)], params.width, radix)
    return { outputs: { q } }
  },
}

export interface RamState {
  readonly words: readonly Signal[]
  /** Where the clock stood at the last evaluation, to tell an edge. */
  readonly clock: ClockLevel
  /** The last address that was known, for the inspector. */
  readonly at: number
  /**
   * The radix the words were last read at. The contents start as the
   * largest radix writes them, and the first evaluation reads them at the
   * radix of the circuit, so a digit it has no room for becomes X.
   */
  readonly radix: number
}

/**
 * A RAM: `q` is the word at the address on `a`, and on the rising edge of
 * `clk` the word on `d` is written there, if `we` is on. `we` left
 * unattached counts as off. An unknown `we` or address at the edge writes
 * nothing and makes `q` unknown where the two words differ.
 */
export const ram: ComponentDef<RamState> = {
  type: 'ram',
  params,
  ports({ address, width }) {
    return [
      { name: 'a', direction: 'in', width: address },
      { name: 'd', direction: 'in', width },
      { name: 'we', direction: 'in', width: 1 },
      { name: 'clk', direction: 'in', width: 1 },
      { name: 'q', direction: 'out', width },
    ]
  },
  initialState(params) {
    return { words: initialWords(params), clock: 'unknown', at: 0, radix: MAX_RADIX }
  },
  stored: (state) => state.words[state.at],
  memory: (state) => state.words,
  evaluate(inputs, params, state, { radix }) {
    const clock = clockLevel(inputs.clk[0], radix)
    const edge = state.clock === 'low' && clock === 'high'
    const writing = flag(inputs.we[0], radix, false)
    const known = addressOf(inputs.a, radix)
    const at = known !== undefined && known < wordCount(params.address, radix) ? known : undefined
    const data = taken(inputs.d, radix)
    let words = state.radix === radix ? state.words : state.words.map((word) => readable(word, radix))
    const unsure = edge && writing !== false && (writing === undefined || known === undefined)
    if (edge && writing === true && at !== undefined) {
      words = words.map((word, address) => (address === at ? data : word))
    }
    const shown = at === undefined ? filled(params.width, X) : words[at]
    const q = unsure ? either(shown, data) : shown
    return { outputs: { q }, state: { words, clock, at: at ?? state.at, radix } }
  },
}
