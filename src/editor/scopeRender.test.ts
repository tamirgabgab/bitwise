import { describe, expect, it } from 'vitest'
import { Recorder } from './scope.ts'
import {
  DEFAULT_SCOPE_VIEW,
  SCOPE_NAMES,
  SCOPE_ZOOMS,
  scopeHeight,
  scopeRowAt,
  scopeStart,
  scopeTickAt,
  scopeTicks,
  scopeZoom,
  scopePan,
} from './scopeRender.ts'

const width = SCOPE_NAMES + 6 + 400

describe('scope layout', () => {
  it('fits fewer ticks when zoomed in', () => {
    expect(scopeTicks(width, 4)).toBe(100)
    expect(scopeTicks(width, 8)).toBe(50)
  })

  it('gives rows more height above radix 2', () => {
    expect(scopeHeight(3, 3)).toBeGreaterThan(scopeHeight(3, 2))
  })

  it('grows from the left, then follows the clock', () => {
    const view = DEFAULT_SCOPE_VIEW
    expect(scopeStart(40, width, view)).toBe(0)
    expect(scopeStart(500, width, view)).toBe(400)
  })

  it('keeps its place while frozen', () => {
    const frozen = { ...DEFAULT_SCOPE_VIEW, end: 300 }
    expect(scopeStart(900, width, frozen)).toBe(200)
  })

  it('reads the tick and the row under the pointer', () => {
    const view = DEFAULT_SCOPE_VIEW
    expect(scopeTickAt(SCOPE_NAMES - 1, 500, width, view)).toBeNull()
    expect(scopeTickAt(SCOPE_NAMES + 40, 500, width, view)).toBe(410)
    // Never past the clock.
    expect(scopeTickAt(width, 50, width, view)).toBe(50)
    expect(scopeRowAt(5, 3, 2)).toBeNull()
    expect(scopeRowAt(20 + 31, 3, 2)).toBe(1)
    expect(scopeRowAt(20 + 3 * 30 + 1, 3, 2)).toBeNull()
  })

  it('steps through the zoom levels and stops at the ends', () => {
    expect(scopeZoom(4, 1)).toBe(8)
    expect(scopeZoom(4, -1)).toBe(2)
    expect(scopeZoom(SCOPE_ZOOMS[0], -1)).toBe(SCOPE_ZOOMS[0])
    const last = SCOPE_ZOOMS[SCOPE_ZOOMS.length - 1]
    expect(scopeZoom(last, 1)).toBe(last)
  })
})

describe('Recorder.valueAt', () => {
  it('reads what a row held at a tick', () => {
    const recorder = new Recorder()
    recorder.sample(2, new Map([['a', 0]]))
    recorder.sample(5, new Map([['a', 1]]))
    recorder.sample(7, new Map([['a', 2]]))
    recorder.sample(9, new Map([['a', 2]]))
    expect(recorder.valueAt('a', 1)).toBeUndefined()
    expect(recorder.valueAt('a', 3)).toBe(0)
    expect(recorder.valueAt('a', 5)).toBe(1)
    expect(recorder.valueAt('a', 6)).toBe(1)
    expect(recorder.valueAt('a', 20)).toBe(2)
    expect(recorder.valueAt('b', 3)).toBeUndefined()
  })
})

describe('scopePan', () => {
  it('moves through time an eighth of the view at a time, and follows the run at the end', () => {
    expect(scopePan(null, 1000, 80, -1)).toBe(990)
    expect(scopePan(990, 1000, 80, 1)).toBeNull()
    // Not before the first screenful of the record.
    expect(scopePan(85, 1000, 80, -1)).toBe(80)
    expect(scopePan(null, 50, 80, -1)).toBeNull()
  })
})
