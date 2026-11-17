import { describe, expect, it } from 'vitest'
import type { Params } from '../component.ts'
import { resolveParams } from '../component.ts'
import { formatSignal, parseSignal } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { decoder, demultiplexer, multiplexer } from './select.ts'

function run(
  def: typeof multiplexer,
  given: Record<string, number>,
  inputs: Record<string, string>,
  radix = 2,
): Record<string, string> {
  const params: Params = resolveParams(def, given)
  const values: Record<string, Signal> = {}
  for (const port of def.ports(params)) {
    if (port.direction !== 'in') continue
    values[port.name] = parseSignal(inputs[port.name] ?? 'Z'.repeat(port.width), radix)
  }
  const result = def.evaluate(values, params, undefined, { radix, woke: false })
  const outputs: Record<string, string> = {}
  for (const [name, signal] of Object.entries(result.outputs)) outputs[name] = formatSignal(signal)
  return outputs
}

describe('multiplexer', () => {
  it('follows the input its select names', () => {
    expect(run(multiplexer, {}, { in0: '0', in1: '1', sel: '0' }).out).toBe('0')
    expect(run(multiplexer, {}, { in0: '0', in1: '1', sel: '1' }).out).toBe('1')
  })

  it('chooses among as many inputs as the radix has values, with one select digit', () => {
    const inputs = { in0: '2', in1: '0', in2: '1' }
    expect(run(multiplexer, { inputs: 3 }, { ...inputs, sel: '0' }, 3).out).toBe('2')
    expect(run(multiplexer, { inputs: 3 }, { ...inputs, sel: '1' }, 3).out).toBe('0')
    expect(run(multiplexer, { inputs: 3 }, { ...inputs, sel: '2' }, 3).out).toBe('1')
  })

  it('reads a select of several digits as one number', () => {
    const inputs = { in0: '0', in1: '0', in2: '1', in3: '0' }
    expect(run(multiplexer, { inputs: 4, select: 2 }, { ...inputs, sel: '10' }).out).toBe('1')
    expect(run(multiplexer, { inputs: 4, select: 2 }, { ...inputs, sel: '11' }).out).toBe('0')
  })

  it('passes a whole bus', () => {
    const given = { width: 4 }
    expect(run(multiplexer, given, { in0: '1010', in1: '0111', sel: '1' }).out).toBe('0111')
  })

  it('gives X for a number with no input behind it', () => {
    expect(run(multiplexer, { inputs: 2 }, { in0: '0', in1: '1', sel: '2' }, 3).out).toBe('X')
  })

  it('is unknown when the select is, except where the inputs agree', () => {
    expect(run(multiplexer, {}, { in0: '0', in1: '1', sel: 'X' }).out).toBe('X')
    expect(run(multiplexer, {}, { in0: '1', in1: '1', sel: 'Z' }).out).toBe('1')
    const given = { width: 3 }
    expect(run(multiplexer, given, { in0: '101', in1: '111', sel: 'X' }).out).toBe('1X1')
  })

  it('reads a floating input as unknown', () => {
    expect(run(multiplexer, {}, { in1: '1', sel: '0' }).out).toBe('X')
  })
})

describe('demultiplexer', () => {
  it('sends its input to the output the select names and 0 to the others', () => {
    expect(run(demultiplexer, {}, { in: '1', sel: '1' })).toEqual({ out0: '0', out1: '1' })
    expect(run(demultiplexer, { outputs: 3 }, { in: '2', sel: '0' }, 3)).toEqual({
      out0: '2',
      out1: '0',
      out2: '0',
    })
  })

  it('sends a bus', () => {
    const outputs = run(demultiplexer, { width: 2 }, { in: '10', sel: '0' })
    expect(outputs).toEqual({ out0: '10', out1: '00' })
  })

  it('gives X everywhere when the select is unknown', () => {
    expect(run(demultiplexer, {}, { in: '1', sel: 'X' })).toEqual({ out0: 'X', out1: 'X' })
  })

  it('sends nothing for a number with no output behind it', () => {
    expect(run(demultiplexer, {}, { in: '1', sel: '2' }, 3)).toEqual({ out0: '0', out1: '0' })
  })
})

describe('decoder', () => {
  it('lights the output its select names with the top value', () => {
    expect(run(decoder, {}, { sel: '1' })).toEqual({ out0: '0', out1: '1' })
    expect(run(decoder, { outputs: 3 }, { sel: '1' }, 3)).toEqual({ out0: '0', out1: '2', out2: '0' })
  })

  it('decodes a select of several digits', () => {
    const outputs = run(decoder, { outputs: 4, select: 2 }, { sel: '10' })
    expect(outputs).toEqual({ out0: '0', out1: '0', out2: '1', out3: '0' })
  })

  it('gives X when the select is unknown or floating', () => {
    expect(run(decoder, {}, { sel: 'X' })).toEqual({ out0: 'X', out1: 'X' })
    expect(run(decoder, {}, {})).toEqual({ out0: 'X', out1: 'X' })
  })
})
