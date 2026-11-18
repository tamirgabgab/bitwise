import { builtinComponents } from '../core/index.ts'
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

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** "one switch", "3 switches": small counts in words, as a sentence says them. */
function count(n: number, one: string, many: string = `${one}s`): string {
  return `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} ${n === 1 ? one : many}`
}

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function byPlace(a: DocComponent, b: DocComponent): number {
  return a.pos.y - b.pos.y || a.pos.x - b.pos.x
}

/** "XORs", "Half adders", "MUXes": the plural of a part's name. */
function plural(name: string): string {
  return /(s|x|z|ch|sh)$/i.test(name) ? `${name}es` : `${name}s`
}

/** "two XORs and one AND": how many of each kind, the most common first. */
function tally(parts: readonly DocComponent[], nameOf: PartNamer): string {
  const counts = new Map<string, number>()
  for (const part of parts) counts.set(nameOf(part), (counts.get(nameOf(part)) ?? 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return listWords(sorted.map(([name, n]) => count(n, name, plural(name))))
}

const describedOf = new WeakMap<CircuitDoc, Map<string, string>>()

/**
 * The words for one circuit, `name` being what it is called. Sentences, in
 * plain English like the rest of the interface. Kept per drawing.
 */
export function describeCircuit(doc: CircuitDoc, name: string, nameOf: PartNamer): string {
  let known = describedOf.get(doc)
  const cached = known?.get(name)
  if (cached !== undefined) return cached
  const text = sentences(doc, name, nameOf).join(' ')
  if (!known) {
    known = new Map()
    describedOf.set(doc, known)
  }
  known.set(name, text)
  return text
}

function sentences(doc: CircuitDoc, name: string, nameOf: PartNamer): string[] {
  const parts = Object.values(doc.components)
    .filter((part) => !isAnnotation(part.type) && part.type !== NET_TYPE)
    .sort(byPlace)
  if (parts.length === 0) return [`${name} is empty.`]

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
  if (switches.length > 0)
    pieces.push(count(switches.length, 'switch', 'switches') + labelled(switches))
  if (buttons.length > 0) pieces.push(count(buttons.length, 'push button') + labelled(buttons))
  if (clocks.length > 0) pieces.push(count(clocks.length, 'clock'))
  if (outputs.length > 0) pieces.push(count(outputs.length, 'output') + labelled(outputs))
  if (gates.length > 0) pieces.push(`${count(gates.length, 'gate')}: ${tally(gates, nameOf)}`)
  if (memory.length > 0) {
    const keep = memory.length === 1 ? 'keeps' : 'keep'
    pieces.push(`${count(memory.length, 'part')} that ${keep} a value: ${tally(memory, nameOf)}`)
  }
  if (named.length > 0)
    pieces.push(`${count(named.length, 'named circuit')}: ${tally(named, nameOf)}`)
  const said = [`${name} has ${listWords(pieces)}.`]

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
      said.push(`${who} is not driven by anything.`)
      continue
    }
    sources.sort(byPlace)
    const from =
      sources.length > 0 ? `depends on ${listWords(sources.map(callOf))}` : 'depends on no switch'
    said.push(
      through.length > 0
        ? `${who} ${from}, through ${tally(through, nameOf)}.`
        : `${who} ${from} directly.`,
    )
  }
  if (outputs.length === 0) said.push('It has no output to show a result.')

  const problems = drawingProblems(doc, nameOf)
  if (problems.length > 0) {
    const first = problems[0].text
    const more = problems.length > 1 ? ', and more' : ''
    said.push(
      `It has ${count(problems.length, 'possible problem')}: ${first[0].toLowerCase()}${first.slice(1)}${more}.`,
    )
  }
  return said
}
