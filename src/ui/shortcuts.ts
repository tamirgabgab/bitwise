/* The keyboard and mouse shortcuts of the app, as the list of shortcuts shows them. */

import { msg } from '../i18n/index.ts'

export interface Shortcut {
  /** One way to do it, or several: each is a combination such as "Ctrl+Z". */
  readonly keys: readonly string[]
  readonly does: string
}

export interface ShortcutGroup {
  readonly title: string
  readonly items: readonly Shortcut[]
}

export const SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: msg('Project'),
    items: [
      { keys: ['Ctrl+K'], does: msg('Search actions, parts, circuits and examples') },
      { keys: ['Ctrl+O'], does: msg('Open a project file') },
      { keys: ['Ctrl+S'], does: msg('Save the project as a file') },
      { keys: ['?'], does: msg('Show this list') },
    ],
  },
  {
    title: msg('Editing'),
    items: [
      { keys: ['Ctrl+Z'], does: msg('Undo') },
      { keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], does: msg('Redo') },
      { keys: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V'], does: msg('Copy, cut and paste') },
      { keys: ['Ctrl+A'], does: msg('Select everything') },
      { keys: ['/'], does: msg('Add a part where the pointer is') },
      { keys: ['Ctrl+G'], does: msg('Turn the selection into a circuit') },
      { keys: ['R'], does: msg('Rotate the selection') },
      { keys: ['Delete'], does: msg('Delete the selection') },
      { keys: ['Arrows'], does: msg('Move the selection one grid step') },
      { keys: ['Alt+Drag'], does: msg('Drag a copy of the selection') },
      { keys: ['Esc'], does: msg('Cancel what you are doing, or clear the selection') },
    ],
  },
  {
    title: msg('Canvas'),
    items: [
      { keys: ['Scroll'], does: msg('Zoom in and out. Over a switch: step its value') },
      { keys: ['Space+Drag'], does: msg('Pan the canvas') },
      {
        keys: ['Drag'],
        does: msg('From a pin or a wire: draw a wire. From a selected wire: move that stretch of it. From empty canvas: select an area'),
      },
      { keys: ['Right-click'], does: msg('On a wire: show it in the timing diagram, or take it away') },
      { keys: ['Double-click'], does: msg('Open the circuit a part stands for') },
    ],
  },
  {
    title: msg('Simulation'),
    items: [
      { keys: ['Click'], does: msg('Step a switch to its next value') },
      { keys: ['Shift+Click', 'Right-click'], does: msg('Step a switch back one value') },
      { keys: ['A key you chose'], does: msg('Step the switch or press the button it belongs to') },
      { keys: ['0-9', 'A-F'], does: msg('With the pointer on a switch: put it on that value') },
      { keys: ['Arrows'], does: msg('Walk the presentation steps while their panel is open') },
    ],
  },
]
