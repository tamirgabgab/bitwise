import { describe, expect, it } from 'vitest'
import { X, Z } from '../core/index.ts'
import { Recorder } from './scope.ts'
import type { ScopeSignal, ScopeValue } from './scope.ts'
import { scopeSvg, scopeVcd } from './scopeExport.ts'
import { DEFAULT_SCOPE_VIEW } from './scopeRender.ts'
import type { ScopeScene } from './scopeRender.ts'
import type { CanvasTheme } from './theme.ts'
import { makeValueStyle } from './valueStyle.ts'
import { DEFAULT_SETTINGS } from './project.ts'

const signal = (key: string, name: string, kind: ScopeSignal['kind'] = 'input'): ScopeSignal => ({
  key,
  name,
  kind,
  pin: { kind: 'pin', component: key, port: 'out' },
})

function sceneOf(radix: number, samples: [number, Record<string, ScopeValue>][], signals: ScopeSignal[]): ScopeScene {
  const recorder = new Recorder()
  let time = 0
  for (const [tick, values] of samples) {
    recorder.sample(tick, new Map(Object.entries(values)))
    time = tick
  }
  return { signals, recorder, time, radix }
}

const DATE = new Date('2026-11-19T12:00:00Z')

describe('the timing diagram as a VCD file', () => {
  it('writes the header, the first values and each change', () => {
    const scene = sceneOf(
      2,
      [
        [0, { c1: 0, c2: X }],
        [3, { c1: 1, c2: 0 }],
        [5, { c1: 0, c2: 0 }],
        [9, { c1: 0, c2: 0 }],
      ],
      [signal('c1', 'Clock', 'clock'), signal('c2', 'Q 0', 'output')],
    )
    expect(scopeVcd(scene, 'Four-bit counter', DATE)).toBe(
      [
        '$date 2026-11-19T12:00:00.000Z $end',
        '$version Bitwise $end',
        '$comment One tick of the simulation is written as 1 ns. $end',
        '$timescale 1ns $end',
        '$scope module Fourbit_counter $end',
        '$var wire 1 ! Clock $end',
        '$var wire 1 " Q_0 $end',
        '$upscope $end',
        '$enddefinitions $end',
        '#0',
        '$dumpvars',
        '0!',
        'x"',
        '$end',
        '#3',
        '1!',
        '0"',
        '#5',
        '0!',
        '#9',
        '',
      ].join('\n'),
    )
  })

  it('writes a bus as a vector, the most significant bit first', () => {
    const scene = sceneOf(
      2,
      [
        [2, { b: '0110' }],
        [4, { b: '1X0Z' }],
      ],
      [signal('b', 'Sum')],
    )
    const vcd = scopeVcd(scene, 'adder', DATE) as string
    expect(vcd).toContain('$var wire 4 ! Sum [3:0] $end')
    expect(vcd).toContain('#2\n$dumpvars\nb0110 !\n$end')
    expect(vcd).toContain('#4\nb1x0z !')
  })

  it('gives a row that starts late x until then, and names rows apart', () => {
    const scene = sceneOf(
      2,
      [
        [0, { a: 1 }],
        [6, { a: 1, b: Z }],
      ],
      [signal('a', 'in'), signal('b', 'in')],
    )
    const vcd = scopeVcd(scene, 'x', DATE) as string
    expect(vcd).toContain('$var wire 1 ! in $end\n$var wire 1 " in_2 $end')
    expect(vcd).toContain('$dumpvars\n1!\nx"\n$end\n#6\nz"')
  })

  it('refuses a radix other than 2, and an empty record', () => {
    expect(scopeVcd(sceneOf(3, [[0, { a: 2 }]], [signal('a', 'a')]), 'x')).toMatchObject({ problem: expect.stringMatching(/radix 3/) })
    expect(scopeVcd(sceneOf(2, [], [signal('a', 'a')]), 'x')).toMatchObject({ problem: expect.any(String) })
  })

  it('gives each of many rows a code of its own', () => {
    const signals = Array.from({ length: 200 }, (_, index) => signal(`s${index}`, `s${index}`))
    const values = Object.fromEntries(signals.map((item) => [item.key, 0]))
    const vcd = scopeVcd(sceneOf(2, [[0, values]], signals), 'x') as string
    const codes = [...vcd.matchAll(/^\$var wire 1 (\S+) /gm)].map((match) => match[1])
    expect(new Set(codes).size).toBe(200)
    expect(codes.every((code) => /^[!-~]+$/.test(code))).toBe(true)
  })
})

describe('the timing diagram as an SVG picture', () => {
  it('draws the rows and the markers, with the names made safe', () => {
    const theme: CanvasTheme = {
      background: '#fff',
      gridDot: '#ccc',
      ink: '#111',
      partFill: '#fff',
      wire: '#666',
      accent: '#f90',
      accentSoft: '#fec',
      signalLow: '#000',
      signalHigh: '#0a0',
      signalHiz: '#999',
      signalUnknown: '#c00',
    }
    const scene = sceneOf(
      2,
      [
        [0, { a: 0 }],
        [10, { a: 1 }],
        [20, { a: 1 }],
      ],
      [signal('a', 'A & <B>')],
    )
    const svg = scopeSvg(scene, { ...DEFAULT_SCOPE_VIEW, markers: { a: 5, b: 15 } }, 400, theme, makeValueStyle(DEFAULT_SETTINGS, theme))
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="400"')).toBe(true)
    expect(svg).toContain('A &amp; &lt;B&gt;')
    expect(svg).toContain('>A</text>')
    expect(svg).toContain('>B</text>')
  })
})
