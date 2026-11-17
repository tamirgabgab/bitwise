import { beforeEach, describe, expect, it } from 'vitest'
import { SUB_TYPE } from './document.ts'
import type { Terminal, WireEnd } from './document.ts'
import { toProjectData } from './project.ts'
import type { ProjectData } from './project.ts'
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

describe('labels', () => {
  it('names a part as one step of undo', () => {
    editor().addComponent('input', { x: 0, y: 0 })
    editor().setLabel('c1', 'Carry')
    expect(editor().doc.components.c1.label).toBe('Carry')
    editor().undo()
    expect(editor().doc.components.c1.label).toBeUndefined()
  })

  it('does not record a name that did not change', () => {
    editor().addComponent('input', { x: 0, y: 0 })
    editor().setLabel('c1', 'A')
    const steps = editor().past.length
    editor().setLabel('c1', ' A ')
    expect(editor().past).toHaveLength(steps)
  })
})

describe('circuits of a project', () => {
  /** Makes the open circuit an inverter: switch c1 "A", NOT c2, output c3 "Y". */
  function drawInverter(): void {
    editor().addComponent('input', { x: 0, y: 0 })
    editor().addComponent('not', { x: 8, y: 0 })
    editor().addComponent('output', { x: 16, y: 0 })
    editor().connect(at('c1', 'out'), at('c2', 'in'))
    editor().connect(at('c2', 'out'), at('c3', 'in'))
    editor().setLabel('c1', 'A')
    editor().setLabel('c3', 'Y')
  }

  /** k1 "Main" holds one part, c1, that stands for the inverter k2. */
  function mainUsingInverter(): void {
    editor().addCircuit('Inverter')
    drawInverter()
    editor().selectCircuit('k1')
    editor().addComponent(SUB_TYPE, { x: 0, y: 0 }, 'k2')
  }

  it('starts with one circuit, which is open', () => {
    expect(editor().order).toEqual(['k1'])
    expect(editor().active).toBe('k1')
    expect(editor().circuits.k1.name).toBe('Main')
    expect(editor().circuits.k1.doc).toBe(editor().doc)
  })

  it('adds a circuit, names it and opens it', () => {
    const id = editor().addCircuit('  Half   adder ')
    expect(id).toBe('k2')
    expect(editor().order).toEqual(['k1', 'k2'])
    expect(editor().active).toBe('k2')
    expect(editor().circuits.k2.name).toBe('Half adder')
    expect(editor().doc.components).toEqual({})
  })

  it('finds a free name for a circuit that is given none', () => {
    editor().addCircuit()
    editor().addCircuit()
    expect(editor().order.map((id) => editor().circuits[id].name)).toEqual([
      'Main',
      'Circuit 2',
      'Circuit 3',
    ])
    editor().removeCircuit('k2')
    editor().addCircuit()
    expect(new Set(Object.values(editor().circuits).map((circuit) => circuit.name)).size).toBe(3)
  })

  it('keeps the open drawing and its circuit the same object through edits', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    expect(editor().circuits.k1.doc).toBe(editor().doc)
    editor().undo()
    expect(editor().circuits.k1.doc).toBe(editor().doc)
    editor().redo()
    expect(editor().circuits.k1.doc).toBe(editor().doc)
  })

  it('gives every circuit its own undo history, view and selection', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    editor().setView({ panX: 10, panY: 20, zoom: 2 })
    editor().addCircuit('Other')
    expect(editor().past).toEqual([])
    expect(editor().selection.size).toBe(0)
    editor().addComponent('or', { x: 0, y: 0 })
    editor().addComponent('or', { x: 4, y: 4 })
    editor().setView({ panX: 0, panY: 0, zoom: 1 })

    editor().selectCircuit('k1')
    expect(editor().past).toHaveLength(1)
    expect(editor().view).toEqual({ panX: 10, panY: 20, zoom: 2 })
    expect([...editor().selection]).toEqual(['c1'])
    editor().undo()
    expect(editor().doc.components).toEqual({})

    editor().selectCircuit('k2')
    expect(editor().past).toHaveLength(2)
    expect(Object.keys(editor().doc.components)).toEqual(['c1', 'c2'])
    expect(editor().view).toEqual({ panX: 0, panY: 0, zoom: 1 })
  })

  it('ignores opening a circuit that is open or does not exist', () => {
    const before = useEditor.getState()
    editor().selectCircuit('k1')
    editor().selectCircuit('k9')
    expect(useEditor.getState()).toBe(before)
  })

  it('uses a circuit as a part of another, with its pins', () => {
    mainUsingInverter()
    const part = editor().doc.components.c1
    expect(part.type).toBe(SUB_TYPE)
    expect(part.sub).toEqual({
      circuit: 'k2',
      name: 'Inverter',
      inputs: [{ port: 'c1', label: 'A' }],
      outputs: [{ port: 'c3', label: 'Y' }],
    })
    expect([...editor().selection]).toEqual(['c1'])
  })

  it('does not let a circuit end up inside itself', () => {
    mainUsingInverter()
    editor().addComponent(SUB_TYPE, { x: 0, y: 10 }, 'k1')
    editor().addComponent(SUB_TYPE, { x: 0, y: 10 }, 'k9')
    editor().addComponent(SUB_TYPE, { x: 0, y: 10 })
    expect(Object.keys(editor().doc.components)).toEqual(['c1'])
    editor().selectCircuit('k2')
    const before = editor().doc
    editor().addComponent(SUB_TYPE, { x: 0, y: 10 }, 'k1')
    expect(editor().doc).toBe(before)
  })

  it('updates every use when the circuit changes', () => {
    mainUsingInverter()
    editor().selectCircuit('k2')
    editor().setLabel('c1', 'In')
    editor().addComponent('output', { x: 16, y: 6 })
    expect(editor().circuits.k1.doc.components.c1.sub).toMatchObject({
      inputs: [{ port: 'c1', label: 'In' }],
      outputs: [
        { port: 'c3', label: 'Y' },
        { port: 'c6', label: 'out2' },
      ],
    })
    editor().selectCircuit('k1')
    expect(editor().doc.components.c1.sub?.outputs).toHaveLength(2)
  })

  it('disconnects the wires on a pin that is deleted from the circuit', () => {
    mainUsingInverter()
    editor().addComponent('input', { x: -12, y: 0 })
    editor().addComponent('output', { x: 12, y: 0 })
    editor().connect(at('c2', 'out'), at('c1', 'c1'))
    editor().connect(at('c1', 'c3'), at('c3', 'in'))
    expect(Object.keys(editor().doc.wires)).toHaveLength(2)

    editor().selectCircuit('k2')
    editor().setSelection(['c3'])
    editor().deleteSelection()
    editor().selectCircuit('k1')
    expect(editor().doc.components.c1.sub?.outputs).toEqual([])
    expect(Object.values(editor().doc.wires).map((wire) => wire.to)).toEqual([
      { kind: 'pin', component: 'c1', port: 'c1' },
    ])
  })

  it('brings an old drawing up to date when undo returns to it', () => {
    mainUsingInverter()
    editor().addComponent('and', { x: 0, y: 12 })
    editor().renameCircuit('k2', 'NOT')
    editor().undo()
    expect(editor().doc.components.c1.sub?.name).toBe('NOT')
    expect(editor().circuits.k1.doc).toBe(editor().doc)
  })

  it('renames a circuit everywhere, and ignores a blank name', () => {
    mainUsingInverter()
    editor().renameCircuit('k2', '  NOT gate ')
    expect(editor().circuits.k2.name).toBe('NOT gate')
    expect(editor().doc.components.c1.sub?.name).toBe('NOT gate')
    const steps = editor().past.length
    editor().renameCircuit('k2', '   ')
    editor().renameCircuit('k9', 'Nothing')
    expect(editor().circuits.k2.name).toBe('NOT gate')
    // A name is not part of a drawing, so not part of undo either.
    expect(editor().past).toHaveLength(steps)
  })

  it('deletes a circuit together with the parts that stood for it', () => {
    mainUsingInverter()
    editor().addComponent('input', { x: -12, y: 0 })
    editor().connect(at('c2', 'out'), at('c1', 'c1'))
    editor().setSelection(['c1'])
    editor().removeCircuit('k2')
    expect(editor().order).toEqual(['k1'])
    expect(editor().circuits.k2).toBeUndefined()
    expect(Object.keys(editor().doc.components)).toEqual(['c2'])
    expect(editor().doc.wires).toEqual({})
    expect([...editor().selection]).toEqual([])
  })

  it('opens the neighbour when the open circuit is deleted', () => {
    editor().addCircuit('Second')
    editor().addCircuit('Third')
    editor().selectCircuit('k2')
    editor().removeCircuit('k2')
    expect(editor().active).toBe('k3')
    editor().removeCircuit('k3')
    expect(editor().active).toBe('k1')
    expect(editor().doc).toBe(editor().circuits.k1.doc)
  })

  it('never deletes the last circuit', () => {
    editor().removeCircuit('k1')
    expect(editor().order).toEqual(['k1'])
  })

  it('does not paste a part where it would hold its own circuit', () => {
    mainUsingInverter()
    editor().addComponent('and', { x: 0, y: 12 })
    editor().selectAll()
    editor().copy()
    editor().selectCircuit('k2')
    const before = Object.keys(editor().doc.components).length
    editor().paste()
    const pasted = Object.values(editor().doc.components).slice(before)
    expect(pasted.map((component) => component.type)).toEqual(['and'])
  })
})

describe('whole projects', () => {
  it('writes a project out and reads it back the same', () => {
    editor().addCircuit('Inverter')
    editor().addComponent('input', { x: 0, y: 0 })
    editor().addComponent('output', { x: 8, y: 0 })
    editor().connect(at('c1', 'out'), at('c2', 'in'))
    editor().setLabel('c1', 'A')
    editor().selectCircuit('k1')
    editor().addComponent(SUB_TYPE, { x: 0, y: 0 }, 'k2')
    editor().setRadix(3)
    const { circuits, order, settings } = editor()
    const data = toProjectData(editor())

    editor().newProject()
    editor().loadProject(data)
    expect(editor().order).toEqual(order)
    expect(editor().active).toBe('k1')
    expect(editor().settings).toEqual(settings)
    expect(editor().circuits).toEqual(circuits)
    expect(editor().doc).toBe(editor().circuits.k1.doc)
  })

  it('starts a loaded project with a clean slate', () => {
    editor().addComponent('and', { x: 0, y: 0 })
    editor().copy()
    const epoch = editor().epoch
    editor().loadProject(toProjectData(editor()))
    expect(editor().past).toEqual([])
    expect(editor().clipboard).toBeNull()
    expect(editor().selection.size).toBe(0)
    expect(editor().epoch).toBe(epoch + 1)
  })

  it('goes on numbering circuits after the ones that were loaded', () => {
    editor().addCircuit('Second')
    editor().addCircuit('Third')
    editor().removeCircuit('k2')
    editor().loadProject(toProjectData(editor()))
    expect(editor().addCircuit()).toBe('k4')
  })

  it('starts over with one empty circuit', () => {
    editor().addCircuit('Second')
    editor().addComponent('and', { x: 0, y: 0 })
    editor().setRadix(5)
    const epoch = editor().epoch
    editor().newProject()
    expect(editor().order).toEqual(['k1'])
    expect(editor().doc.components).toEqual({})
    expect(editor().settings).toEqual(DEFAULT_SETTINGS)
    expect(editor().epoch).toBe(epoch + 1)
  })

  it('hands the switch values of a loaded project on, by circuit', () => {
    editor().addComponent('input', { x: 0, y: 0 })
    const data = toProjectData(editor(), { inputs: { k1: { c1: 1 } } })
    editor().loadProject(data)
    expect(editor().restoredInputs).toEqual({ k1: { c1: 1 } })
  })
})

describe('framing a circuit', () => {
  /** A project file with a wide drawing and no word on where to look. */
  function wideProject(): ProjectData {
    editor().addComponent('input', { x: 0, y: 0 })
    editor().addComponent('output', { x: 200, y: 80 })
    return toProjectData(editor())
  }

  it('fits a loaded circuit that has no view of its own, once', () => {
    editor().loadProject(wideProject())
    expect(editor().unframed.has('k1')).toBe(true)
    editor().frame(800, 600)
    const fitted = editor().view
    expect(fitted.zoom).toBeLessThan(1)
    expect(editor().unframed.has('k1')).toBe(false)

    editor().setView({ panX: 5, panY: 5, zoom: 1 })
    editor().frame(800, 600)
    expect(editor().view).toEqual({ panX: 5, panY: 5, zoom: 1 })
  })

  it('leaves a circuit alone that came with a view', () => {
    const data = wideProject()
    const view = { panX: 30, panY: 40, zoom: 0.5 }
    editor().loadProject({ ...data, circuits: [{ ...data.circuits[0], view }] })
    editor().frame(800, 600)
    expect(editor().view).toEqual(view)
  })

  it('leaves the view of work in progress alone', () => {
    editor().addComponent('input', { x: 300, y: 300 })
    const before = editor().view
    editor().frame(800, 600)
    expect(editor().view).toBe(before)
  })
})

describe('tidying and regrouping a selection', () => {
  it('duplicates the selection and selects the copy, as one step of undo', () => {
    inverter()
    editor().setSelection(['c1', 'c2'])
    editor().duplicateSelection(0, 10)
    expect(Object.keys(editor().doc.components)).toHaveLength(4)
    expect(Object.keys(editor().doc.wires)).toHaveLength(2)
    expect([...editor().selection]).toEqual(['c4', 'c5'])
    editor().undo()
    expect(Object.keys(editor().doc.components)).toHaveLength(2)
  })

  it('does not duplicate onto the same spot', () => {
    inverter()
    editor().setSelection(['c1'])
    editor().duplicateSelection(0, 0)
    expect(Object.keys(editor().doc.components)).toHaveLength(2)
  })

  it('lines up and spaces the selected parts', () => {
    editor().addComponent('not', { x: 0, y: 0 })
    editor().addComponent('not', { x: 5, y: 9 })
    editor().addComponent('not', { x: 3, y: 30 })
    editor().setSelection(['c1', 'c2', 'c3'])
    editor().alignSelection('left')
    expect(Object.values(editor().doc.components).map((part) => part.pos.x)).toEqual([0, 0, 0])
    editor().distributeSelection('y')
    expect(Object.values(editor().doc.components).map((part) => part.pos.y)).toEqual([0, 15, 30])
  })

  it('adds a text label and changes its writing', () => {
    editor().addComponent('text', { x: 0, y: 0 })
    expect(editor().doc.components.c1).toMatchObject({ type: 'text', text: 'Text' })
    editor().setText('c1', 'Carry chain')
    expect(editor().doc.components.c1.text).toBe('Carry chain')
    editor().undo()
    expect(editor().doc.components.c1.text).toBe('Text')
  })

  it('turns the selection into a circuit of its own', () => {
    inverter()
    editor().addComponent('output', { x: 20, y: 0 })
    editor().connect(at('c2', 'out'), at('c4', 'in'))
    editor().setSelection(['c2'])
    const id = editor().selectionToCircuit()!
    expect(editor().order).toEqual(['k1', id])
    expect(editor().active).toBe('k1')
    expect(editor().circuits[id].name).toBe('Circuit 2')
    const parts = Object.values(editor().doc.components)
    expect(parts.map((part) => part.type).sort()).toEqual(['circuit', 'input', 'output'])
    const chip = parts.find((part) => part.type === SUB_TYPE)!
    expect([...editor().selection]).toEqual([chip.id])
    expect(chip.sub).toMatchObject({ circuit: id, name: 'Circuit 2' })
    expect(Object.keys(editor().doc.wires)).toHaveLength(2)
    // Undo brings the parts back; the new circuit stays in the project.
    editor().undo()
    expect(Object.values(editor().doc.components).map((part) => part.type)).toEqual([
      'input',
      'not',
      'output',
    ])
    expect(id in editor().circuits).toBe(true)
  })

  it('makes no circuit of a selection with nothing that can move', () => {
    inverter()
    editor().setSelection(['c1'])
    expect(editor().selectionToCircuit()).toBeNull()
    expect(editor().order).toEqual(['k1'])
  })
})

describe('presentation steps', () => {
  const steps = () => editor().circuits[editor().active].steps ?? []

  it('adds steps after the one on show and shows the new one', () => {
    editor().addStep({ c1: 0 })
    editor().addStep({ c1: 1 })
    expect(steps().map((step) => step.inputs.c1)).toEqual([0, 1])
    expect(editor().stepIndex).toBe(1)
    editor().setStepIndex(0)
    editor().addStep({ c1: 2 })
    expect(steps().map((step) => step.inputs.c1)).toEqual([0, 2, 1])
    expect(editor().stepIndex).toBe(1)
  })

  it('changes the note and the switches of a step, outside undo', () => {
    inverter()
    const before = editor().past.length
    editor().addStep({ c1: 0 })
    editor().setStepNote(0, 'The input is off')
    editor().setStepInputs(0, { c1: 1 })
    expect(steps()).toEqual([{ note: 'The input is off', inputs: { c1: 1 } }])
    expect(editor().past.length).toBe(before)
    expect(editor().circuits.k1.doc).toBe(editor().doc)
  })

  it('deletes a step and keeps the index inside the list', () => {
    editor().addStep({})
    editor().addStep({})
    editor().addStep({})
    editor().deleteStep(2)
    expect(steps()).toHaveLength(2)
    expect(editor().stepIndex).toBe(1)
    editor().deleteStep(0)
    expect(editor().stepIndex).toBe(0)
    editor().setStepIndex(9)
    expect(editor().stepIndex).toBe(0)
  })

  it('keeps the steps of a circuit through an edit and through saving', () => {
    inverter()
    editor().addStep({ c1: 1 })
    editor().setStepNote(0, 'On')
    editor().addComponent('output', { x: 20, y: 0 })
    expect(steps()).toHaveLength(1)
    const data = toProjectData(editor())
    expect(data.circuits[0].steps).toEqual([{ note: 'On', inputs: { c1: 1 } }])
    editor().newProject()
    expect(steps()).toEqual([])
    editor().loadProject(data)
    expect(steps()).toEqual([{ note: 'On', inputs: { c1: 1 } }])
  })

  it('starts each circuit at its first step', () => {
    editor().addStep({})
    editor().addStep({})
    const second = editor().addCircuit()
    expect(editor().stepIndex).toBe(0)
    editor().selectCircuit('k1')
    expect(editor().active).not.toBe(second)
    expect(editor().stepIndex).toBe(0)
  })
})
