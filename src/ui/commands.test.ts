import { beforeEach, describe, expect, it } from 'vitest'
import { EXAMPLES, useEditor, useSim } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { listCommands, searchCommands } from './commands.ts'
import type { Command } from './commands.ts'
import { SHORTCUTS } from './shortcuts.ts'

function command(id: string, title: string, more: Partial<Command> = {}): Command {
  return { id, title, group: 'Test', run: () => {}, ...more }
}

const titles = (commands: readonly Command[]): string[] => commands.map((item) => item.title)

describe('searchCommands', () => {
  const list = [
    command('a', 'Open a project file', { keywords: 'load' }),
    command('b', 'Add Adder', { detail: 'Adds two numbers' }),
    command('c', 'Add AND'),
    command('d', 'Show the timing diagram', { keywords: 'scope' }),
  ]

  it('keeps the whole list, in order, for a blank query', () => {
    expect(searchCommands(list, ' ')).toEqual(list)
  })

  it('finds a command by its keywords and by its second line', () => {
    expect(titles(searchCommands(list, 'scope'))).toEqual(['Show the timing diagram'])
    expect(titles(searchCommands(list, 'numbers'))).toEqual(['Add Adder'])
  })

  it('puts a title that starts with the query before one that only has it', () => {
    expect(titles(searchCommands(list, 'add'))).toEqual(['Add Adder', 'Add AND'])
    expect(titles(searchCommands(list, 'open'))[0]).toBe('Open a project file')
  })

  it('puts a match in the title before a match in the keywords', () => {
    const mixed = [command('x', 'Something else', { keywords: 'timing' }), ...list]
    expect(titles(searchCommands(mixed, 'timing'))).toEqual([
      'Show the timing diagram',
      'Something else',
    ])
  })

  it('finds nothing for a word no command knows', () => {
    expect(searchCommands(list, 'zzzz')).toEqual([])
  })
})

describe('listCommands', () => {
  beforeEach(() => {
    useEditor.getState().newProject()
    useSim.getState().setRunning(true)
  })

  it('gives every command its own id', () => {
    const ids = listCommands().map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('offers every example and every part of the palette', () => {
    const all = titles(listCommands())
    for (const example of EXAMPLES) expect(all).toContain(`Open example: ${example.name}`)
    expect(all).toContain('Add Counter')
    expect(all).toContain('Add AND')
  })

  it('switches off what cannot be done on an empty circuit', () => {
    const byId = new Map(listCommands().map((item) => [item.id, item]))
    expect(byId.get('edit.undo')?.disabled).toBe(true)
    expect(byId.get('edit.delete')?.disabled).toBe(true)
    expect(byId.get('file.svg')?.disabled).toBe(true)
    expect(byId.get('file.save')?.disabled).toBeFalsy()
  })

  it('switches them on once there is a part and it is selected', () => {
    useEditor.getState().addComponent('and', { x: 0, y: 0 })
    useEditor.getState().selectAll()
    const byId = new Map(listCommands().map((item) => [item.id, item]))
    expect(byId.get('edit.undo')?.disabled).toBe(false)
    expect(byId.get('edit.delete')?.disabled).toBe(false)
  })

  it('offers to pause while running and to run while paused', () => {
    expect(listCommands().some((item) => item.id === 'sim.pause')).toBe(true)
    useSim.getState().setRunning(false)
    const ids = listCommands().map((item) => item.id)
    expect(ids).toContain('sim.run')
    expect(ids).not.toContain('sim.pause')
  })

  it('offers the other circuits of the project, to open and to use', () => {
    const editor = useEditor.getState()
    const first = editor.active
    editor.addCircuit('Second')
    const all = titles(listCommands())
    const name = useEditor.getState().circuits[first].name
    expect(all).toContain(`Open circuit ${name}`)
    expect(all).toContain(`Add circuit ${name} as a part`)
  })

  it('names the same shortcut as the list of shortcuts does', () => {
    const listed = new Set(SHORTCUTS.flatMap((group) => group.items.flatMap((item) => item.keys)))
    for (const item of listCommands()) {
      if (item.shortcut) expect(listed).toContain(item.shortcut)
    }
  })
})

describe('the commands of the canvas look and the workspace', () => {
  it('switches the canvas look and the gate style, and leaves the current look disabled', () => {
    const find = (id: string) => listCommands().find((item) => item.id === id)!
    expect(find('view.look.classic').disabled).toBe(true)
    find('view.look.chalk').run()
    expect(useEditor.getState().canvasLook).toBe('chalk')
    expect(find('view.look.chalk').disabled).toBe(true)
    find('view.look.classic').run()

    expect(find('view.gates').title).toBe('Draw gates as IEC boxes')
    find('view.gates').run()
    expect(useEditor.getState().gateStyle).toBe('iec')
    expect(find('view.gates').title).toBe('Draw gates as ANSI shapes')
    find('view.gates').run()
  })

  it('opens the home screen and the versions', () => {
    listCommands().find((item) => item.id === 'file.projects')!.run()
    expect(useChrome.getState().overlay).toBe('home')
    listCommands().find((item) => item.id === 'file.versions')!.run()
    expect(useChrome.getState().overlay).toBe('versions')
    useChrome.getState().closeOverlay()
  })
})
