import { describe, expect, it } from 'vitest'
import { builtinComponents } from '../core/index.ts'
import { isAnnotation } from '../editor/index.ts'
import {
  RECENT_LIMIT,
  matchRank,
  matchesQuery,
  paletteSections,
  recentIn,
  searchSections,
  withRecent,
} from './paletteModel.ts'

const CLASSIC = { radix: 2, preset: 'classic', sandbox: false }

describe('paletteSections', () => {
  it('starts with the gates of the chosen kit, under its name', () => {
    const [gates] = paletteSections(CLASSIC)
    expect(gates.id).toBe('gates')
    expect(gates.title).toBe('Classic Boolean')
    expect(gates.types).toContain('and')
  })

  it('shows every gate in the sandbox', () => {
    const [gates] = paletteSections({ radix: 3, preset: 'kleene', sandbox: true })
    expect(gates.title).toBe('All gates')
    expect(gates.types).toContain('mul')
    expect(gates.types).not.toContain('xor')
  })

  it('offers only parts that exist, each in one section', () => {
    const types = paletteSections(CLASSIC).flatMap((section) => section.types)
    expect(new Set(types).size).toBe(types.length)
    for (const type of types) {
      if (!isAnnotation(type)) expect(builtinComponents.has(type)).toBe(true)
    }
  })
})

describe('matchesQuery', () => {
  it('wants every word, in any order and any case', () => {
    expect(matchesQuery('flip JK', 'JK flip-flop')).toBe(true)
    expect(matchesQuery('jk latch', 'JK flip-flop')).toBe(false)
  })

  it('takes a blank query for a match', () => {
    expect(matchesQuery('  ', 'anything')).toBe(true)
  })
})

describe('matchRank', () => {
  it('puts a title that starts with the query first', () => {
    expect(matchRank('add', 'Adder')).toBe(0)
    expect(matchRank('circuit', 'Open circuit')).toBe(1)
    expect(matchRank('dd', 'Adder')).toBe(2)
  })
})

describe('searchSections', () => {
  const sections = paletteSections(CLASSIC)

  it('keeps everything for a blank query', () => {
    expect(searchSections(sections, '', 2)).toEqual(sections)
  })

  it('finds a part by its name and drops the empty sections', () => {
    const found = searchSections(sections, 'counter', 2)
    expect(found.map((section) => section.id)).toEqual(['large'])
    expect(found[0].types).toEqual(['counter'])
  })

  it('finds parts by what they do', () => {
    const types = searchSections(sections, 'carry', 2).flatMap((section) => section.types)
    expect(types).toContain('adder')
  })

  it('finds a whole section by its title', () => {
    const found = searchSections(sections, 'buses', 2)
    expect(found.find((section) => section.id === 'buses')?.types).toEqual(['split', 'merge'])
  })

  it('finds nothing for a word no part knows', () => {
    expect(searchSections(sections, 'zzzz', 2)).toEqual([])
  })
})

describe('recent parts', () => {
  it('puts the part used last at the front, once', () => {
    expect(withRecent(['and', 'or'], 'or')).toEqual(['or', 'and'])
    expect(withRecent([], 'not')).toEqual(['not'])
  })

  it('forgets the oldest past the limit', () => {
    let recent: string[] = []
    for (const type of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) recent = withRecent(recent, type)
    expect(recent).toHaveLength(RECENT_LIMIT)
    expect(recent[0]).toBe('g')
    expect(recent).not.toContain('a')
  })

  it('offers only the remembered parts the palette shows now', () => {
    const sections = paletteSections({ radix: 3, preset: 'kleene', sandbox: false })
    expect(recentIn(['xor', 'counter', 'gone'], sections)).toEqual(['counter'])
  })
})
