import { describe, expect, it } from 'vitest'
import { Simulator } from '../simulator.ts'
import type { ComponentId } from '../simulator.ts'
import { X, formatSignal, parseSignal } from '../signal.ts'
import {
  MAX_WORDS,
  addressOf,
  memoryCell,
  packWord,
  unpackWord,
  wordCount,
} from './memory.ts'

/** A memory part with a switch on every input, by port name. */
function bench(type: 'rom' | 'ram', params: Record<string, number>, radix = 2) {
  const sim = new Simulator(undefined, radix)
  const part = sim.addComponent(type, { params })
  const sources = new Map<string, ComponentId>()
  const drive = (port: string, text: string): void => {
    let source = sources.get(port)
    if (source === undefined) {
      source = sim.addComponent('input', { params: { width: text.length } })
      sim.connect({ component: source, port: 'out' }, { component: part, port })
      sources.set(port, source)
    }
    sim.setState(source, parseSignal(text, radix))
    sim.settle()
  }
  const read = (): string => formatSignal(sim.readPin({ component: part, port: 'q' }))
  const top = (radix - 1).toString(16).toUpperCase()
  const tick = (): void => {
    drive('clk', '0')
    drive('clk', top)
  }
  if (type === 'ram') drive('clk', '0')
  return { sim, part, drive, read, tick, top }
}

/** The parameter that keeps `text`, written most significant first in hex. */
const word = (text: string): number => packWord(parseSignal(text, 16))

describe('the words of a memory', () => {
  it('are kept as numbers written for radix 16, and read back at any radix', () => {
    expect(word('A1')).toBe(0xa1)
    expect(unpackWord(0xa1, 2, 16)).toEqual([1, 10])
    expect(unpackWord(0xa1, 2, 2)).toEqual([1, X])
    expect(unpackWord(0x21, 3, 3)).toEqual([1, 2, 0])
    expect(packWord([1, X, 2])).toBe(0x201)
  })

  it('are as many as the address reaches, up to 256', () => {
    expect(wordCount(4, 2)).toBe(16)
    expect(wordCount(2, 16)).toBe(256)
    expect(wordCount(3, 16)).toBe(MAX_WORDS)
    expect(wordCount(5, 3)).toBe(243)
  })

  it('are found by an address of known digits only', () => {
    expect(addressOf(parseSignal('101', 2), 2)).toBe(5)
    expect(addressOf(parseSignal('21', 3), 3)).toBe(7)
    expect(addressOf(parseSignal('1X', 2), 2)).toBeUndefined()
    expect(addressOf(parseSignal('2', 3), 2)).toBeUndefined()
  })
})

describe('rom', () => {
  it('gives the word at the address', () => {
    const { drive, read } = bench('rom', { address: 2, width: 4, [memoryCell(1)]: word('1001'), [memoryCell(3)]: word('1111') })
    drive('a', '00')
    expect(read()).toBe('0000')
    drive('a', '01')
    expect(read()).toBe('1001')
    drive('a', '11')
    expect(read()).toBe('1111')
  })

  it('gives X for an unknown address, and past the words it holds', () => {
    const { drive, read } = bench('rom', { address: 3, width: 2 }, 16)
    drive('a', 'X00')
    expect(read()).toBe('XX')
    drive('a', '100')
    expect(read()).toBe('XX')
    drive('a', '0FF')
    expect(read()).toBe('00')
  })

  it('keeps its words through a change of radix', () => {
    const contents = { address: 1, width: 2, [memoryCell(1)]: word('21') }
    const binary = bench('rom', contents, 2)
    binary.drive('a', '1')
    expect(binary.read()).toBe('X1')
    const ternary = bench('rom', contents, 3)
    ternary.drive('a', '1')
    expect(ternary.read()).toBe('21')
  })
})

describe('ram', () => {
  it('starts from its contents and writes on the rising edge while WE is on', () => {
    const { drive, read, tick } = bench('ram', { address: 2, width: 4, [memoryCell(2)]: word('0101') })
    drive('a', '10')
    expect(read()).toBe('0101')
    drive('d', '1110')
    tick()
    expect(read()).toBe('0101')
    drive('we', '1')
    expect(read()).toBe('0101')
    tick()
    expect(read()).toBe('1110')
    drive('a', '00')
    expect(read()).toBe('0000')
    drive('a', '10')
    expect(read()).toBe('1110')
  })

  it('writes nothing for an unknown WE or address, and keeps what it holds', () => {
    const { drive, read, tick } = bench('ram', { address: 1, width: 2 })
    drive('a', '1')
    drive('d', '11')
    drive('we', 'X')
    tick()
    expect(read()).toBe('XX')
    drive('we', '0')
    expect(read()).toBe('00')
    drive('we', '1')
    drive('a', 'X')
    tick()
    expect(read()).toBe('XX')
    drive('we', '0')
    drive('a', '1')
    expect(read()).toBe('00')
  })

  it('goes back to its contents on a restart, and shows them all', () => {
    const { sim, part, drive, read, tick } = bench('ram', { address: 1, width: 1, [memoryCell(0)]: word('1') })
    drive('a', '0')
    drive('d', '0')
    drive('we', '1')
    tick()
    expect(read()).toBe('0')
    expect(sim.getMemory(part)?.slice(0, 2)).toEqual([[0], [0]])
    sim.restart()
    sim.settle()
    expect(read()).toBe('1')
    expect(sim.getStored(part)).toEqual([1])
  })

  it('works at radix 3: the clock rises past the middle and WE is on at the top value', () => {
    const { drive, read, tick } = bench('ram', { address: 1, width: 2 }, 3)
    drive('a', '2')
    drive('d', '21')
    drive('we', '1')
    tick()
    expect(read()).toBe('00')
    drive('we', '2')
    tick()
    expect(read()).toBe('21')
  })
})
