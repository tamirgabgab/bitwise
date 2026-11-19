import { builtinComponents } from '../core/index.ts'
import { language, msg, t } from '../i18n/index.ts'
import { partGraph } from './cone.ts'
import { NET_TYPE, SUB_TYPE, isAnnotation } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'
import type { PartNamer } from './editNames.ts'
import { drawingProblems } from './problems.ts'

/*
 * A circuit told in words, for a screen reader and for anyone who wants it
 * as text: what it is made of, what each output depends on, and whether
 * anything looks wrong. "Main has 2 switches (A, B), 1 output (S) and
 * 1 gate: 1 XOR. S depends on A and B, through 1 XOR."
 */

/** Parts the user sets: the way into a circuit. */
const SOURCES: ReadonlySet<string> = new Set(['input', 'button', 'clock', 'cycle'])

/** Two to nine in words, as a sentence says them. */
const NUMBER_WORDS = [
  msg('two'),
  msg('three'),
  msg('four'),
  msg('five'),
  msg('six'),
  msg('seven'),
  msg('eight'),
  msg('nine'),
]

/** How a kind of thing is counted: a message for one, and one with `{count}` for more. */
interface Noun {
  readonly one: string
  readonly many: string
}

/**
 * "one switch", "three switches", "12 switches": small counts in words. The
 * messages of `noun` may have places of their own, filled from `values`.
 */
function count(n: number, noun: Noun, values: Readonly<Record<string, string>> = {}): string {
  if (n === 1) return t(noun.one, values)
  const said = n >= 2 && n - 2 < NUMBER_WORDS.length ? t(NUMBER_WORDS[n - 2]) : String(n)
  return t(noun.many, { ...values, count: said })
}

const SWITCHES: Noun = { one: msg('one switch'), many: msg('{count} switches') }
const BUTTONS: Noun = { one: msg('one push button'), many: msg('{count} push buttons') }
const CLOCKS: Noun = { one: msg('one clock'), many: msg('{count} clocks') }
const OUTPUTS: Noun = { one: msg('one output'), many: msg('{count} outputs') }
const GATES: Noun = { one: msg('one gate: {parts}'), many: msg('{count} gates: {parts}') }
const MEMORY: Noun = {
  one: msg('one part that keeps a value: {parts}'),
  many: msg('{count} parts that keep a value: {parts}'),
}
const NAMED: Noun = {
  one: msg('one named circuit: {parts}'),
  many: msg('{count} named circuits: {parts}'),
}
const PROBLEMS: Noun = {
  one: msg('It has one possible problem: {problem}.'),
  many: msg('It has {count} possible problems: {problem}, and more.'),
}

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return t('{list} and {last}', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] })
}

function byPlace(a: DocComponent, b: DocComponent): number {
  return a.pos.y - b.pos.y || a.pos.x - b.pos.x
}

/** "XORs", "Half adders", "MUXes": how a part's name is counted, `{name}` being the name. */
function plural(name: string): Noun {
  return {
    one: msg('one {name}'),
    many: /(s|x|z|ch|sh)$/i.test(name) ? msg('{count} {name}es') : msg('{count} {name}s'),
  }
}

/** "two XORs and one AND": how many of each kind, the most common first. */
function tally(parts: readonly DocComponent[], nameOf: PartNamer): string {
  const counts = new Map<string, number>()
  for (const part of parts) counts.set(nameOf(part), (counts.get(nameOf(part)) ?? 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return listWords(sorted.map(([name, n]) => count(n, plural(name), { name })))
}

const describedOf = new WeakMap<CircuitDoc, Map<string, string>>()

/**
 * The words for one circuit, `name` being what it is called. Sentences, in
 * the language of the interface. Kept per drawing, name and language.
 */
export function describeCircuit(doc: CircuitDoc, name: string, nameOf: PartNamer): string {
  let known = describedOf.get(doc)
  const key = `${language()}:${name}`
  const cached = known?.get(key)
  if (cached !== undefined) return cached
  const text = sentences(doc, name, nameOf).join(' ')
  if (!known) {
    known = new Map()
    describedOf.set(doc, known)
  }
  known.set(key, text)
  return text
}

function sentences(doc: CircuitDoc, name: string, nameOf: PartNamer): string[] {
  const parts = Object.values(doc.components)
    .filter((part) => !isAnnotation(part.type) && part.type !== NET_TYPE)
    .sort(byPlace)
  if (parts.length === 0) return [t('{name} is empty.', { name })]

  const switches = parts.filter((part) => part.type === 'input')
  const buttons = parts.filter((part) => part.type === 'button')
  const clocks = parts.filter((part) => part.type === 'clock' || part.type === 'cycle')
  const outputs = parts.filter((part) => part.type === 'output')
  const memory = parts.filter(
    (part) =>
      builtinComponents.has(part.type) && builtinComponents.get(part.type).stored !== undefined,
  )
  const named = parts.filter((part) => part.type === SUB_TYPE)
  const gates = parts.filter(
    (part) =>
      !SOURCES.has(part.type) &&
      part.type !== 'output' &&
      part.type !== SUB_TYPE &&
      !memory.includes(part),
  )

  const labelled = (list: readonly DocComponent[]): string => {
    const labels = list.map((part) => part.label).filter((label): label is string => !!label)
    return labels.length === list.length && labels.length > 0 ? ` (${labels.join(', ')})` : ''
  }
  const pieces: string[] = []
  if (switches.length > 0) pieces.push(count(switches.length, SWITCHES) + labelled(switches))
  if (buttons.length > 0) pieces.push(count(buttons.length, BUTTONS) + labelled(buttons))
  if (clocks.length > 0) pieces.push(count(clocks.length, CLOCKS))
  if (outputs.length > 0) pieces.push(count(outputs.length, OUTPUTS) + labelled(outputs))
  if (gates.length > 0) pieces.push(count(gates.length, GATES, { parts: tally(gates, nameOf) }))
  if (memory.length > 0) pieces.push(count(memory.length, MEMORY, { parts: tally(memory, nameOf) }))
  if (named.length > 0) pieces.push(count(named.length, NAMED, { parts: tally(named, nameOf) }))
  const said = [t('{name} has {parts}.', { name, parts: listWords(pieces) })]

  // What each output depends on: the switches, buttons and clocks it is
  // reached from, walking back from part to part.
  const graph = partGraph(doc)
  const callOf = (part: DocComponent): string => part.label ?? nameOf(part)
  for (const output of outputs) {
    const seenNets = new Set<string>()
    const seenParts = new Set<string>([output.id])
    const queue = [...(graph.ins.get(output.id) ?? [])]
    const sources: DocComponent[] = []
    const through: DocComponent[] = []
    while (queue.length > 0) {
      const net = queue.pop()!
      if (seenNets.has(net)) continue
      seenNets.add(net)
      for (const id of graph.drivers.get(net) ?? []) {
        if (seenParts.has(id)) continue
        seenParts.add(id)
        const part = doc.components[id]
        if (!part) continue
        if (SOURCES.has(part.type)) {
          sources.push(part)
          continue
        }
        through.push(part)
        queue.push(...(graph.ins.get(id) ?? []))
      }
    }
    const who = callOf(output)
    if (sources.length === 0 && through.length === 0) {
      said.push(t('{part} is not driven by anything.', { part: who }))
      continue
    }
    sources.sort(byPlace)
    // An output with neither a source nor a part before it was told above.
    const names = listWords(sources.map(callOf))
    if (through.length === 0) {
      said.push(t('{part} depends on {sources} directly.', { part: who, sources: names }))
    } else if (sources.length === 0) {
      said.push(
        t('{part} depends on no switch, through {parts}.', { part: who, parts: tally(through, nameOf) }),
      )
    } else {
      said.push(
        t('{part} depends on {sources}, through {parts}.', {
          part: who,
          sources: names,
          parts: tally(through, nameOf),
        }),
      )
    }
  }
  if (outputs.length === 0) said.push(t('It has no output to show a result.'))

  const problems = drawingProblems(doc, nameOf)
  if (problems.length > 0) {
    const first = problems[0].text
    const problem = `${first[0].toLowerCase()}${first.slice(1)}`
    said.push(count(problems.length, PROBLEMS, { problem }))
  }
  return said
}
