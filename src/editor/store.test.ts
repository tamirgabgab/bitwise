import { beforeEach, describe, expect, it } from 'vitest'
import type { Terminal, WireEnd } from './document.ts'
import { resetEditor, useEditor } from './store.ts'

const editor = () => useEditor.getState()
const at = (component: string, port: string): WireEnd => {
  const terminal: Terminal = { kind: 'pin', component, port }
  return { kind: 'terminal', terminal }
}

/** Input c1 wired to NOT gate c2 by wire w3. */
function inverter(): void {
  editor().addComponent('input', { x: 0, y: 0 })
  editor().addComponent('not', { x: 10, y: 0 })
  editor().connect(at('c1', 'out'), at('c2', 'in'))
}

beforeEach(() => resetEditor())

describe('adding and wiring', () => {
  it('selects a newly added part', () => {
    editor().addComponent('and', { x: 2, y: 2 })
    expect([...editor().selection]).toEqual(['c1'])
    editor().addComponent('or', { x: 9, y: 2 })
    expect([...editor().selection]).toEqual(['c2'])
  })

  it('nudges a part that would land exactly on another', () => {
    editor().addComponent('and', { x: 2, y: 2 })
    editor().addComponent('and', { x: 2, y: 2 })
    editor().addComponent('and', { x: 2, y: 2 })
    const positions = Object.values(editor().doc.components).map((component) => component.pos)
    expect(positions).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ])
  })

  it('reports whether a wire could be made, and records only real ones', () => {
    inverter()
    const steps = editor().past.length
    expect(editor().connect(at('c1', 'out'), at('c2', 'in'))).toBe(false)
    expect(editor().connect(at('c1', 'out'), at('c1', 'out'))).toBe(false)
    expect(editor().past.length).toBe(steps)
    expect(Object.keys(editor().doc.wires)).toEqual(['w3'])
  })
})

describe('undo and redo', () => {
  it('steps back and forth through every edit', () => {
    inverter()
    const full = editor().doc
    editor().undo()
    expect(editor().doc.wires).toEqual({})
    editor().undo()
    expect(Object.keys(editor().doc.components)).toEqual(['c1'])
    editor().redo()
    editor().redo()
    expect(editor().doc).toBe(full)
    editor().redo()
    expect(editor().doc).toBe(full)
  })

  it('forgets the redo steps after a new edit', () => {
    inverter()
    editor().undo()
    editor().addComponent('or', { x: 20, y: 0 })
    expect(editor().future).toEqual([])
    editor().redo()
    expect(editor().doc.wires).toEqual({})
  })

  it('drops selected items that an undo removed', () => {
    inverter()
    editor().setSelection(['c1', 'c2', 'w3'])
    editor().undo()
    expect([...editor().selection].sort()).toEqual(['c1', 'c2'])
    editor().undo()
    expect([...editor().selection]).toEqual(['c1'])
  })

  it('does nothing when there is nothing to undo', () => {
    const before = editor().doc
    editor().undo()
    expect(editor().doc).toBe(before)
  })

  it('does not record an edit that changes nothing', () => {
    inverter()
    const steps = editor().past.length
    editor().setSelection([])
    editor().deleteSelection()
    editor().rotateSelection()
    editor().moveSelection(3, 3)
    editor().setSelection(['c1'])
    editor().moveSelection(0, 0)
    expect(editor().past.length).toBe(steps)
  })
})

describe('selection edits', () => {
  it('moves, rotates and deletes what is selected', () => {
    inverter()
    editor().setSelection(['c2'])
    editor().moveSelection(1, 2)
    editor().rotateSelection()
    expect(editor().doc.components.c2).toMatchObject({ pos: { x: 11, y: 2 }, rotation: 1 })

    editor().deleteSelection()
    expect(Object.keys(editor().doc.components)).toEqual(['c1'])
    expect(editor().doc.wires).toEqual({})
    expect(editor().selection.size).toBe(0)

    editor().undo()
    expect(Object.keys(editor().doc.wires)).toEqual(['w3'])
  })

  it('ignores ids that are not in the drawing', () => {
    inverter()
    editor().setSelection(['c1', 'ghost'])
    expect([...editor().selection]).toEqual(['c1'])
  })

  it('toggles one item at a time', () => {
    inverter()
    editor().setSelection(['c1'])
    editor().toggleSelected('c2')
    expect([...editor().selection].sort()).toEqual(['c1', 'c2'])
    editor().toggleSelected('c1')
    expect([...editor().selection]).toEqual(['c2'])
  })

  it('selects everything', () => {
    inverter()
    editor().selectAll()
    expect([...editor().selection].sort()).toEqual(['c1', 'c2', 'w3'])
  })
})

describe('clipboard', () => {
  it('pastes a copy next to the original, wires included, and selects it', () => {
    inverter()
    editor().selectAll()
    editor().copy()
    editor().paste()
    const { doc, selection } = editor()
    expect([...selection].sort()).toEqual(['c4', 'c5'])
    expect(doc.components.c4.pos).toEqual({ x: 2, y: 2 })
    expect(doc.components.c5.pos).toEqual({ x: 12, y: 2 })
    expect(Object.keys(doc.wires)).toHaveLength(2)
  })

  it('staggers repeated pastes so they do not pile up', () => {
    inverter()
    editor().setSelection(['c1'])
    editor().copy()
    editor().paste()
    editor().paste()
    const positions = Object.values(editor().doc.components)
      .filter((component) => component.type === 'input')
      .map((component) => component.pos)
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 4, y: 4 },
    ])
  })

  it('cuts: the selection goes to the clipboard and out of the drawing', () => {
    inverter()
    editor().setSelection(['c2'])
    editor().cut()
    expect(Object.keys(editor().doc.components)).toEqual(['c1'])
    editor().paste()
    expect(Object.values(editor().doc.components).map((component) => component.type)).toEqual([
      'input',
      'not',
    ])
  })

  it('keeps the clipboard when nothing copyable is selected', () => {
    inverter()
    editor().setSelection(['c1'])
    editor().copy()
    const clipboard = editor().clipboard
    editor().setSelection(['w3'])
    editor().copy()
    expect(editor().clipboard).toBe(clipboard)
  })
})

describe('view', () => {
  it('zooms around a screen point and stays within limits', () => {
    editor().setView({ panX: 100, panY: 100, zoom: 1 })
    editor().zoomAt(2, 100, 100)
    expect(editor().view).toEqual({ panX: 100, panY: 100, zoom: 2 })
    editor().zoomAt(1000, 0, 0)
    expect(editor().view.zoom).toBe(4)
    editor().zoomAt(0.000001, 0, 0)
    expect(editor().view.zoom).toBe(0.25)
  })
})
