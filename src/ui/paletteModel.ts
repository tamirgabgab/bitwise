import { findPreset, sandboxGates } from '../core/index.ts'
import { msg, t } from '../i18n/index.ts'
import { partWords } from './parts.ts'

/*
 * What the parts palette offers, as plain data: the sections, the search
 * over them and the list of parts used last. The palette and the command
 * search both read it.
 */

/** One titled group of parts in the palette. */
export interface PaletteSection {
  /** Stays the same whatever the title says, so it can be remembered. */
  readonly id: string
  /** In English; shown through `t`. */
  readonly title: string
  readonly types: readonly string[]
}

const FIXED_SECTIONS: readonly PaletteSection[] = [
  { id: 'io', title: msg('Inputs and outputs'), types: ['input', 'button', 'output', 'display'] },
  { id: 'sequential', title: msg('Sequential'), types: ['clock', 'cycle', 'sr', 'dff', 'tff', 'jkff', 'fsm'] },
  { id: 'bits', title: msg('Digits and bits'), types: ['tobits', 'frombits'] },
  { id: 'buses', title: msg('Buses'), types: ['split', 'merge'] },
  { id: 'wiring', title: msg('Wiring'), types: ['net'] },
  {
    id: 'large',
    title: msg('Larger parts'),
    types: ['mux', 'demux', 'decoder', 'adder', 'subtractor', 'multiplier', 'alu', 'shifter', 'compare', 'register', 'counter', 'rom', 'ram'],
  },
  { id: 'notes', title: msg('Notes'), types: ['text', 'frame'] },
]

/** The settings that decide which gates the palette shows. */
export interface PaletteSettings {
  readonly radix: number
  readonly preset: string
  readonly sandbox: boolean
}

/** Every section of built-in parts, the gates of the chosen kit first. */
export function paletteSections(settings: PaletteSettings): PaletteSection[] {
  const preset = findPreset(settings.preset)
  const gates: PaletteSection = {
    id: 'gates',
    title: settings.sandbox ? msg('All gates') : (preset?.name ?? msg('Gates')),
    // A table gate is any gate the kit lacks, so every kit offers it.
    types: [...(settings.sandbox ? sandboxGates(settings.radix) : (preset?.gates ?? [])), 'table'],
  }
  return [gates, ...FIXED_SECTIONS]
}

/** The words of a search, in lower case. */
function wordsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** True when every word of the query is somewhere in the text. */
export function matchesQuery(query: string, text: string): boolean {
  const hay = text.toLowerCase()
  return wordsOf(query).every((word) => hay.includes(word))
}

/**
 * How well a title answers a query: 0 when it starts with it, 1 when one of
 * its words does, 2 when the query is only somewhere inside or in the other
 * text. Lower is better. Call only for a match.
 */
export function matchRank(query: string, title: string): number {
  const [first] = wordsOf(query)
  if (first === undefined) return 0
  const name = title.toLowerCase()
  if (name.startsWith(first)) return 0
  // Letters of any script, so a title in Hebrew splits into its words too.
  return name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(first)) ? 1 : 2
}

/** The title of a section in the language of the interface and in English. */
function sectionWords(section: PaletteSection): string {
  const shown = t(section.title)
  return shown === section.title ? shown : `${shown} ${section.title}`
}

/**
 * The sections with only the parts a search finds, by name, by type or by
 * what the part does, in the language of the interface or in English.
 * Sections left empty are dropped. A blank query keeps everything.
 */
export function searchSections(
  sections: readonly PaletteSection[],
  query: string,
  radix: number,
): PaletteSection[] {
  if (wordsOf(query).length === 0) return [...sections]
  const found: PaletteSection[] = []
  for (const section of sections) {
    const types = section.types.filter((type) =>
      matchesQuery(query, `${partWords(type, radix)} ${type} ${sectionWords(section)}`),
    )
    if (types.length > 0) found.push({ ...section, types })
  }
  return found
}

/** How many parts the palette remembers as used last. */
export const RECENT_LIMIT = 6

/** The list of parts used last, with `type` now at the front. */
export function withRecent(recent: readonly string[], type: string): string[] {
  return [type, ...recent.filter((item) => item !== type)].slice(0, RECENT_LIMIT)
}

/** The remembered parts that the palette offers right now, in order. */
export function recentIn(recent: readonly string[], sections: readonly PaletteSection[]): string[] {
  const offered = new Set(sections.flatMap((section) => section.types))
  return recent.filter((type) => offered.has(type))
}
