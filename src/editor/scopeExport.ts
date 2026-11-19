import { X, Z } from '../core/index.ts'
import type { ScopeSignal, ScopeValue } from './scope.ts'
import type { ScopeScene, ScopeView } from './scopeRender.ts'
import { renderScope, scopeHeight } from './scopeRender.ts'
import { SvgContext } from './svgContext.ts'
import type { CanvasTheme } from './theme.ts'
import type { ValueStyle } from './valueStyle.ts'

/*
 * The timing diagram taken out of the app: as a picture, the way it looks
 * now, or as a Value Change Dump (IEEE 1364), which GTKWave and other
 * waveform viewers open, with every change the record still holds.
 */

/**
 * The timing diagram as an SVG picture: the ticks on screen, at the zoom on
 * screen, with the markers but without the pointer's cursor. `width` is the
 * width of the diagram in CSS pixels.
 */
export function scopeSvg(
  scene: ScopeScene,
  view: ScopeView,
  width: number,
  theme: CanvasTheme,
  style: ValueStyle,
): string {
  const height = scopeHeight(scene.signals.length, scene.radix)
  const ctx = new SvgContext()
  renderScope(ctx as unknown as CanvasRenderingContext2D, width, height, 1, theme, scene, { ...view, cursor: null }, style)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">\n${ctx.body}\n</svg>\n`
  )
}

/** A short code for each signal, as VCD names them: printable characters, base 94. */
function vcdCode(index: number): string {
  let code = ''
  let rest = index
  do {
    code = String.fromCharCode(33 + (rest % 94)) + code
    rest = Math.floor(rest / 94) - 1
  } while (rest >= 0)
  return code
}

/** A name a VCD reader takes: no spaces, nothing but letters, digits and underscores. */
function vcdName(name: string, used: Set<string>): string {
  let base = name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '')
  if (!/^[A-Za-z_]/.test(base)) base = `s_${base}`
  let unique = base
  for (let number = 2; used.has(unique); number++) unique = `${base}_${number}`
  used.add(unique)
  return unique
}

/** A value as VCD writes it at radix 2: one bit, or `b` and the bits of a bus. */
function vcdValue(value: ScopeValue | undefined, width: number): string {
  const bit = (digit: ScopeValue | undefined): string =>
    digit === 0 || digit === '0' ? '0' : digit === 1 || digit === '1' ? '1' : digit === Z || digit === 'Z' ? 'z' : 'x'
  if (width === 1) return bit(typeof value === 'string' ? value[value.length - 1] : value)
  if (typeof value !== 'string') return `b${'x'.repeat(width)} `
  return `b${Array.from(value, bit).join('')} `
}

/** The width of a row: a bus is kept as its digits written out. */
function widthOf(scene: ScopeScene, signal: ScopeSignal, from: number): number {
  for (const span of scene.recorder.spans(signal.key, from, scene.time + 1)) {
    if (typeof span.digit === 'string') return span.digit.length
  }
  return 1
}

/**
 * The record of the timing diagram as a Value Change Dump, one tick to a
 * nanosecond. Only at radix 2: VCD knows no values but 0, 1, x and z.
 * `circuit` names the scope the signals sit in.
 */
export function scopeVcd(scene: ScopeScene, circuit: string, date = new Date()): string | { readonly problem: string } {
  if (scene.radix !== 2) {
    return { problem: `VCD holds only 0, 1, X and Z, so it is written at radix 2. This project is at radix ${scene.radix}.` }
  }
  const { recorder, signals, time } = scene
  // The record starts where the earliest row was first seen.
  let start = Number.POSITIVE_INFINITY
  for (const signal of signals) {
    const first = recorder.spans(signal.key, 0, time + 1)[0]
    if (first) start = Math.min(start, first.from)
  }
  if (start === Number.POSITIVE_INFINITY) return { problem: 'The timing diagram has nothing recorded yet.' }

  const used = new Set<string>()
  const rows = signals.map((signal, index) => ({
    signal,
    code: vcdCode(index),
    name: vcdName(signal.name, used),
    width: widthOf(scene, signal, start),
  }))

  const lines: string[] = [
    `$date ${date.toISOString()} $end`,
    '$version Bitwise $end',
    '$comment One tick of the simulation is written as 1 ns. $end',
    '$timescale 1ns $end',
    `$scope module ${vcdName(circuit, new Set())} $end`,
    ...rows.map(({ code, name, width }) =>
      width === 1 ? `$var wire 1 ${code} ${name} $end` : `$var wire ${width} ${code} ${name} [${width - 1}:0] $end`,
    ),
    '$upscope $end',
    '$enddefinitions $end',
  ]

  // Every change of every row, by tick.
  const changes = new Map<number, string[]>()
  const note = (tick: number, line: string): void => {
    let list = changes.get(tick)
    if (!list) changes.set(tick, (list = []))
    list.push(line)
  }
  const initial: string[] = []
  for (const { signal, code, width } of rows) {
    const spans = recorder.spans(signal.key, start, time + 1)
    // A row first seen after the start is unknown until then.
    if (spans.length === 0 || spans[0].from > start) initial.push(vcdValue(X, width) + code)
    for (const span of spans) {
      const line = vcdValue(span.digit, width) + code
      if (span.from === start) initial.push(line)
      else note(span.from, line)
    }
  }
  lines.push(`#${start}`, '$dumpvars', ...initial, '$end')
  for (const tick of [...changes.keys()].sort((a, b) => a - b)) {
    lines.push(`#${tick}`, ...changes.get(tick)!)
  }
  if (!changes.has(time) && time > start) lines.push(`#${time}`)
  return `${lines.join('\n')}\n`
}
