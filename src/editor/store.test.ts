import { beforeEach, describe, expect, it } from 'vitest'
import type { Terminal, WireEnd } from './document.ts'
import { DEFAULT_SETTINGS, resetEditor, useEditor } from './store.ts'

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

describe('part parameters', () => {
  it('changes a parameter as one undoable edit', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    editor().setParams('c1', { inputs: 4 })
    expect(editor().doc.components.c1.params.inputs).toBe(4)
    editor().undo()
    expect(editor().doc.components.c1.params.inputs).toBe(2)
  })

  it('records nothing when the value is the same', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    const past = editor().past.length
    editor().setParams('c1', { inputs: 2 })
    expect(editor().past).toHaveLength(past)
  })
})

describe('project settings', () => {
  it('starts as a binary project with the classic kit and colors', () => {
    expect(editor().settings).toEqual(DEFAULT_SETTINGS)
    expect(editor().settings.radix).toBe(2)
    expect(editor().settings.preset).toBe('classic')
    expect(editor().settings.classicColors).toBe(true)
    expect(editor().settings.showDigits).toBe(false)
  })

  it('moves off the classic kit and turns digits on above radix 2', () => {
    editor().setRadix(3)
    expect(editor().settings.radix).toBe(3)
    expect(editor().settings.preset).toBe('nand')
    expect(editor().settings.showDigits).toBe(true)
  })

  it('keeps a kit that still fits the new radix', () => {
    editor().setRadix(3)
    editor().setPreset('kleene')
    editor().setRadix(4)
    expect(editor().settings.preset).toBe('kleene')
    editor().setRadix(2)
    expect(editor().settings.preset).toBe('kleene')
    expect(editor().settings.showDigits).toBe(false)
  })

  it('drops field arithmetic when the radix stops being prime', () => {
    editor().setRadix(5)
    editor().setPreset('field')
    expect(editor().settings.preset).toBe('field')
    editor().setRadix(6)
    expect(editor().settings.preset).toBe('nand')
  })

  it('refuses a kit that does not fit the radix, and unknown kits', () => {
    editor().setRadix(4)
    editor().setPreset('field')
    editor().setPreset('classic')
    editor().setPreset('nope')
    expect(editor().settings.preset).toBe('nand')
  })

  it('refuses a radix outside 2 to 16', () => {
    editor().setRadix(1)
    editor().setRadix(17)
    editor().setRadix(2.5)
    expect(editor().settings.radix).toBe(2)
  })

  it('leaves the digits setting alone once the user chose it', () => {
    editor().setRadix(3)
    editor().updateSettings({ showDigits: false })
    editor().setRadix(4)
    expect(editor().settings.showDigits).toBe(false)
  })

  it('edits one palette color and restores the defaults', () => {
    editor().setPaletteColor(2, '#123456')
    expect(editor().settings.palette[2]).toBe('#123456')
    expect(editor().settings.palette[1]).toBe(DEFAULT_SETTINGS.palette[1])
    editor().setPaletteColor(99, '#000000')
    expect(editor().settings.palette).toHaveLength(10)
    editor().resetPalette()
    expect(editor().settings.palette).toEqual(DEFAULT_SETTINGS.palette)
  })

  it('does not put settings in the undo history', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    editor().setRadix(3)
    editor().undo()
    expect(editor().settings.radix).toBe(3)
    expect(editor().doc.components.c1).toBeUndefined()
  })
})
