import { describe, expect, it } from 'vitest'
import { X } from '../core/index.ts'
import { addComponent, emptyDoc } from './document.ts'
import { Recorder, scopeSignals } from './scope.ts'

describe('scopeSignals', () => {
  it('lists the clocks, then the switches, then the outputs, top to bottom', () => {
    let doc = addComponent(emptyDoc(), 'output', { x: 20, y: 0 }, { label: 'Sum' }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 6 }, { label: 'B' }).doc
    doc = addComponent(doc, 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'and', { x: 10, y: 0 }).doc
    doc = addComponent(doc, 'clock', { x: 0, y: 12 }).doc
    expect(scopeSignals(doc).map((signal) => `${signal.kind} ${signal.name} ${signal.key}`)).toEqual([
      'clock Clock c5',
      'input in1 c3',
      'input B c2',
      'output Sum c1',
    ])
  })

  it('reads a source at its output and a lamp at its input', () => {
    let doc = addComponent(emptyDoc(), 'input', { x: 0, y: 0 }).doc
    doc = addComponent(doc, 'output', { x: 8, y: 0 }).doc
    expect(scopeSignals(doc).map((signal) => signal.pin)).toEqual([
      { kind: 'pin', component: 'c1', port: 'out' },
      { kind: 'pin', component: 'c2', port: 'in' },
    ])
  })

  it('numbers the clocks when there are several', () => {
    let doc = addComponent(emptyDoc(), 'clock', { x: 0, y: 4 }).doc
    doc = addComponent(doc, 'clock', { x: 0, y: 0 }).doc
    expect(scopeSignals(doc).map((signal) => `${signal.name} ${signal.key}`)).toEqual([
      'Clock 1 c2',
      'Clock 2 c1',
    ])
  })

  it('gives the same list for the same drawing', () => {
    const doc = addComponent(emptyDoc(), 'clock', { x: 0, y: 0 }).doc
    expect(scopeSignals(doc)).toBe(scopeSignals(doc))
  })
})

describe('Recorder', () => {
  const at = (values: Readonly<Record<string, number>>) => new Map(Object.entries(values))

  it('keeps one stretch for each value a signal held', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: X }))
    recorder.sample(1, at({ a: 0 }))
    recorder.sample(2, at({ a: 0 }))
    recorder.sample(3, at({ a: 1 }))
    recorder.sample(5, at({ a: 1 }))
    expect(recorder.spans('a', 0, 5)).toEqual([
      { from: 0, to: 1, digit: X },
      { from: 1, to: 3, digit: 0 },
      { from: 3, to: 5, digit: 1 },
    ])
    expect(recorder.time).toBe(5)
  })

  it('cuts the stretches to the window asked for', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(10, at({ a: 1 }))
    recorder.sample(20, at({ a: 1 }))
    expect(recorder.spans('a', 4, 14)).toEqual([
      { from: 4, to: 10, digit: 0 },
      { from: 10, to: 14, digit: 1 },
    ])
    expect(recorder.spans('a', 12, 20)).toEqual([{ from: 12, to: 20, digit: 1 }])
  })

  it('lets a second look within the same tick replace the first', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(4, at({ a: 1 }))
    recorder.sample(4, at({ a: 0 }))
    recorder.sample(6, at({ a: 0 }))
    expect(recorder.spans('a', 0, 6)).toEqual([{ from: 0, to: 6, digit: 0 }])
  })

  it('starts a signal where it was first seen, and forgets one that is gone', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(3, at({ a: 0, b: 1 }))
    recorder.sample(6, at({ b: 1 }))
    expect(recorder.spans('b', 0, 6)).toEqual([{ from: 3, to: 6, digit: 1 }])
    expect(recorder.spans('a', 0, 6)).toEqual([])
  })

  it('drops what is older than it was told to keep', () => {
    const recorder = new Recorder(10)
    for (let time = 0; time <= 40; time++) recorder.sample(time, at({ a: time % 2 }))
    const spans = recorder.spans('a', 0, 40)
    expect(spans[0].from).toBeGreaterThanOrEqual(29)
    expect(recorder.spans('a', 30, 40)).toHaveLength(10)
  })

  it('starts over when time goes back to the beginning', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(50, at({ a: 1 }))
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(2, at({ a: 0 }))
    expect(recorder.spans('a', 0, 2)).toEqual([{ from: 0, to: 2, digit: 0 }])
  })
})

describe('Recorder.rewind', () => {
  const at = (values: Readonly<Record<string, number>>) => new Map(Object.entries(values))

  it('forgets what came after the tick it goes back to', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(4, at({ a: 1 }))
    recorder.sample(8, at({ a: 0, b: 1 }))
    recorder.sample(9, at({ a: 0, b: 1 }))
    recorder.rewind(6)
    expect(recorder.time).toBe(6)
    expect(recorder.spans('a', 0, 6)).toEqual([
      { from: 0, to: 4, digit: 0 },
      { from: 4, to: 6, digit: 1 },
    ])
    expect(recorder.spans('b', 0, 9)).toEqual([])
    // Going on from there does not start the record over.
    recorder.sample(7, at({ a: 1 }))
    expect(recorder.spans('a', 0, 7)).toEqual([
      { from: 0, to: 4, digit: 0 },
      { from: 4, to: 7, digit: 1 },
    ])
  })

  it('does nothing when asked to go forwards', () => {
    const recorder = new Recorder()
    recorder.sample(0, at({ a: 0 }))
    recorder.sample(3, at({ a: 1 }))
    recorder.rewind(10)
    expect(recorder.time).toBe(3)
    expect(recorder.spans('a', 0, 3)).toEqual([{ from: 0, to: 3, digit: 0 }])
  })
})
