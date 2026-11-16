import { describe, expect, it } from 'vitest'
import { builtinComponents, resolveParams } from '../core/index.ts'
import { rectContainsPoint } from './geometry.ts'
import { SUB_TYPE, inputRows, symbolFor, symbolOf } from './symbols.ts'
import type { SubRef } from './symbols.ts'

/** Every built-in type, and every input count a gate can have. */
function allVariants(): { type: string; params: Readonly<Record<string, number>> }[] {
  const variants: { type: string; params: Readonly<Record<string, number>> }[] = []
  for (const type of builtinComponents.types()) {
    const def = builtinComponents.get(type)
    const inputs = def.params?.inputs
    if (!inputs) {
      variants.push({ type, params: resolveParams(def) })
      continue
    }
    for (let count = inputs.min; count <= inputs.max; count++) {
      variants.push({ type, params: resolveParams(def, { inputs: count }) })
    }
  }
  return variants
}

describe('inputRows', () => {
  it('centres the rows and keeps the middle free for an even count', () => {
    expect(inputRows(1)).toEqual([0])
    expect(inputRows(2)).toEqual([-1, 1])
    expect(inputRows(3)).toEqual([-1, 0, 1])
    expect(inputRows(4)).toEqual([-2, -1, 1, 2])
  })
})

describe('symbolFor', () => {
  it('has exactly the pins the simulator knows, with the same directions', () => {
    for (const { type, params } of allVariants()) {
      const ports = builtinComponents.get(type).ports(params)
      const pins = symbolFor(type, params).pins
      expect(pins.map((pin) => `${pin.name}:${pin.direction}`).sort()).toEqual(
        ports.map((port) => `${port.name}:${port.direction}`).sort(),
      )
    }
  })

  it('puts every pin on its own grid point, inside the bounds', () => {
    for (const { type, params } of allVariants()) {
      const symbol = symbolFor(type, params)
      const taken = new Set<string>()
      for (const pin of symbol.pins) {
        expect(Number.isInteger(pin.pos.x) && Number.isInteger(pin.pos.y)).toBe(true)
        expect(rectContainsPoint(symbol.bounds, pin.pos)).toBe(true)
        expect(Math.abs(pin.dir.x) + Math.abs(pin.dir.y)).toBe(1)
        taken.add(`${pin.pos.x},${pin.pos.y}`)
      }
      expect(taken.size).toBe(symbol.pins.length)
    }
  })

  it('returns the same symbol for the same type and parameters', () => {
    const params = resolveParams(builtinComponents.get('and'))
    expect(symbolFor('and', params)).toBe(symbolFor('and', { ...params }))
    expect(symbolFor('and', params)).not.toBe(symbolFor('nand', params))
  })

  it('gives switches, buttons, constants and lamps a face inside their bounds', () => {
    for (const type of ['input', 'button', 'const', 'output']) {
      const symbol = symbolFor(type, resolveParams(builtinComponents.get(type)))
      const face = symbol.face
      expect(face).toBeDefined()
      if (!face) continue
      const { x0, y0, x1, y1 } = symbol.bounds
      expect(face.pos.x - face.reach).toBeGreaterThanOrEqual(x0)
      expect(face.pos.x + face.reach).toBeLessThanOrEqual(x1)
      expect(face.pos.y - face.reach).toBeGreaterThanOrEqual(y0)
      expect(face.pos.y + face.reach).toBeLessThanOrEqual(y1)
    }
    expect(symbolFor('and', resolveParams(builtinComponents.get('and'))).face).toBeUndefined()
  })

  it('tells a switch from a push button by the shape of its face', () => {
    const face = (type: string) =>
      symbolFor(type, resolveParams(builtinComponents.get(type))).face?.shape
    expect(face('input')).toBe('square')
    expect(face('button')).toBe('round')
  })

  it('writes the setting of a gate on it', () => {
    const label = (type: string, params: Record<string, number>) =>
      symbolFor(type, resolveParams(builtinComponents.get(type), params)).label
    expect(label('shift', { by: 3 })).toMatchObject({ text: '+3' })
    expect(label('is', { match: 2 })).toMatchObject({ text: '=', digit: 2 })
    expect(label('add', {})).toMatchObject({ text: '+' })
    expect(label('mul', {})).toMatchObject({ text: '×' })
    expect(label('and', {})).toBeUndefined()
  })

  it('grows a gate to fit its inputs', () => {
    const def = builtinComponents.get('or')
    const small = symbolFor('or', resolveParams(def, { inputs: 2 }))
    const large = symbolFor('or', resolveParams(def, { inputs: 8 }))
    expect(large.bounds.y1).toBeGreaterThan(small.bounds.y1)
  })
})

describe('symbolOf', () => {
  const sub: SubRef = {
    circuit: 'k2',
    name: 'Full adder',
    inputs: [
      { port: 'c1', label: 'A' },
      { port: 'c2', label: 'B' },
      { port: 'c3', label: 'Carry in' },
    ],
    outputs: [
      { port: 'c7', label: 'S' },
      { port: 'c8', label: 'Cout' },
    ],
  }
  const chip = symbolOf({ type: SUB_TYPE, params: {}, sub })

  it('is the built-in symbol for a built-in part', () => {
    const params = resolveParams(builtinComponents.get('and'))
    expect(symbolOf({ type: 'and', params })).toBe(symbolFor('and', params))
  })

  it('gives a named circuit a pin for each of its inputs and outputs', () => {
    expect(chip.pins.map((pin) => [pin.name, pin.direction])).toEqual([
      ['c1', 'in'],
      ['c2', 'in'],
      ['c3', 'in'],
      ['c7', 'out'],
      ['c8', 'out'],
    ])
  })

  it('puts inputs on the left and outputs on the right, each on a grid point', () => {
    const seen = new Set<string>()
    for (const pin of chip.pins) {
      expect(pin.pos.x).toBe(pin.direction === 'in' ? -5 : 5)
      expect(Number.isInteger(pin.pos.y)).toBe(true)
      expect(rectContainsPoint(chip.bounds, pin.pos)).toBe(true)
      seen.add(`${pin.pos.x},${pin.pos.y}`)
    }
    expect(seen.size).toBe(chip.pins.length)
  })

  it('writes the name of the circuit and of every pin, shortened to fit', () => {
    expect(chip.notes?.map((note) => note.text)).toEqual([
      'Full adder',
      'A',
      'B',
      'Carr…',
      'S',
      'Cout',
    ])
    const long = symbolOf({ type: SUB_TYPE, params: {}, sub: { ...sub, name: 'x'.repeat(24) } })
    expect(long.notes?.[0].text).toBe(`${'x'.repeat(13)}…`)
  })

  it('grows with the number of pins', () => {
    const small = symbolOf({ type: SUB_TYPE, params: {}, sub: { ...sub, inputs: [], outputs: [] } })
    const many = Array.from({ length: 6 }, (_, i) => ({ port: `c${i + 10}`, label: `I${i}` }))
    const large = symbolOf({ type: SUB_TYPE, params: {}, sub: { ...sub, inputs: many } })
    expect(large.bounds.y1).toBeGreaterThan(small.bounds.y1)
    expect(small.pins).toEqual([])
  })

  it('returns the same symbol for the same reference', () => {
    expect(symbolOf({ type: SUB_TYPE, params: {}, sub })).toBe(chip)
  })

  it('still draws a part that has lost its reference', () => {
    expect(symbolOf({ type: SUB_TYPE, params: {} }).pins).toEqual([])
  })
})
