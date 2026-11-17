import { beforeEach, describe, expect, it } from 'vitest'
import type { Terminal, WireEnd } from './document.ts'
import {
  criticalMarks,
  currentScope,
  isWatched,
  stepSimulation,
  toggleWatch,
  unwatchRow,
} from './session.ts'
import { useSim } from './simStore.ts'
import { resetEditor, useEditor } from './store.ts'

const editor = () => useEditor.getState()
const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })
const at = (component: string, port: string): WireEnd => ({
  kind: 'terminal',
  terminal: pin(component, port),
})

/** Input c1 wired to NOT gate c2, whose output goes to output c4. */
function inverter(): void {
  editor().addComponent('input', { x: 0, y: 0 })
  editor().addComponent('not', { x: 10, y: 0 })
  editor().connect(at('c1', 'out'), at('c2', 'in'))
  editor().addComponent('output', { x: 20, y: 0 })
  editor().connect(at('c2', 'out'), at('c4', 'in'))
}

beforeEach(() => resetEditor())

describe('wires followed in the timing diagram', () => {
  it('adds a row for a wire and takes it away again', () => {
    inverter()
    const before = currentScope().signals.length
    expect(toggleWatch(pin('c1', 'out'))).toBe(true)
    const rows = currentScope().signals
    expect(rows).toHaveLength(before + 1)
    expect(rows[rows.length - 1].kind).toBe('wire')
    // Any terminal on the same wire finds the same row.
    expect(isWatched(pin('c2', 'in'))).toBe(true)
    expect(useSim.getState().watched).toHaveLength(1)
    expect(toggleWatch(pin('c2', 'in'))).toBe(false)
    expect(currentScope().signals).toHaveLength(before)
  })

  it('records what the wire carries', () => {
    inverter()
    toggleWatch(pin('c2', 'out'))
    for (let i = 0; i < 4; i++) stepSimulation()
    const scope = currentScope()
    const row = scope.signals[scope.signals.length - 1]
    expect(scope.recorder.spans(row.key, 0, scope.time + 1).length).toBeGreaterThan(0)
  })

  it('takes a row away by its key', () => {
    inverter()
    toggleWatch(pin('c1', 'out'))
    const row = currentScope().signals.at(-1)!
    unwatchRow(row.key)
    expect(isWatched(pin('c1', 'out'))).toBe(false)
  })

  it('forgets a wire whose part is deleted', () => {
    inverter()
    toggleWatch(pin('c2', 'out'))
    editor().setSelection(['c2', 'c4'])
    editor().deleteSelection()
    expect(useSim.getState().watched).toHaveLength(0)
  })
})

describe('the longest path on the canvas', () => {
  it('marks the gates on it and the wires into and out of them', () => {
    inverter()
    const marks = criticalMarks()
    expect([...marks.parts]).toEqual(['c2'])
    expect(marks.wires.size).toBe(2)
  })

  it('is worked out again after an edit', () => {
    inverter()
    const before = criticalMarks()
    editor().setSelection(['c4'])
    editor().deleteSelection()
    const after = criticalMarks()
    expect(after).not.toBe(before)
    expect(after.wires.size).toBe(1)
  })

  it('stops being marked when the circuit gets a loop', () => {
    inverter()
    useSim.getState().setCriticalShown(true)
    editor().addComponent('not', { x: 10, y: 10 })
    const loop = Object.keys(editor().doc.components).find((id) => !['c1', 'c2', 'c4'].includes(id))
    editor().connect(at(loop as string, 'out'), at(loop as string, 'in'))
    expect(useSim.getState().depth).toBeUndefined()
    expect(useSim.getState().criticalShown).toBe(false)
  })
})
