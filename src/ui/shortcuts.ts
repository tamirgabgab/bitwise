/* The keyboard and mouse shortcuts of the app, as the list of shortcuts shows them. */

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
    title: 'Project',
    items: [
      { keys: ['Ctrl+K'], does: 'Search actions, parts, circuits and examples' },
      { keys: ['Ctrl+O'], does: 'Open a project file' },
      { keys: ['Ctrl+S'], does: 'Save the project as a file' },
      { keys: ['?'], does: 'Show this list' },
    ],
  },
  {
    title: 'Editing',
    items: [
      { keys: ['Ctrl+Z'], does: 'Undo' },
      { keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], does: 'Redo' },
      { keys: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V'], does: 'Copy, cut and paste' },
      { keys: ['Ctrl+A'], does: 'Select everything' },
      { keys: ['Ctrl+G'], does: 'Turn the selection into a circuit' },
      { keys: ['R'], does: 'Rotate the selection' },
      { keys: ['Delete'], does: 'Delete the selection' },
      { keys: ['Arrows'], does: 'Move the selection one grid step' },
      { keys: ['Alt+Drag'], does: 'Drag a copy of the selection' },
      { keys: ['Esc'], does: 'Cancel what you are doing, or clear the selection' },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { keys: ['Scroll'], does: 'Zoom in and out' },
      { keys: ['Space+Drag'], does: 'Pan the canvas' },
      { keys: ['Drag'], does: 'From a pin: draw a wire. From empty canvas: select an area' },
      { keys: ['Double-click'], does: 'Open the circuit a part stands for' },
    ],
  },
  {
    title: 'Simulation',
    items: [
      { keys: ['Click'], does: 'Step a switch to its next value' },
      { keys: ['Shift+Click', 'Right-click'], does: 'Step a switch back one value' },
      { keys: ['A key you chose'], does: 'Step the switch or press the button it belongs to' },
      { keys: ['Arrows'], does: 'Walk the presentation steps while their panel is open' },
    ],
  },
]
