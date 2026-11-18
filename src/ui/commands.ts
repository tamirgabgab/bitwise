import {
  EXAMPLES,
  MAX_ZOOM,
  MIN_ZOOM,
  SUB_TYPE,
  canPlace,
  canvasRuntime,
  restartSimulation,
  stepBack,
  stepSimulation,
  stepToClockEdge,
  useEditor,
  useSim,
} from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { matchRank, matchesQuery, paletteSections } from './paletteModel.ts'
import { partHint, partName } from './parts.ts'
import {
  exportCircuitSvg,
  openExample,
  openProjectFile,
  saveProjectFile,
  startNewProject,
} from './persistence.ts'
import { placeAtCenter } from './placing.ts'

/*
 * Everything the app can be told to do, as one list. The command search
 * shows it, and each entry says the same words as its button.
 */

export interface Command {
  readonly id: string
  /** What it does, starting with the verb. */
  readonly title: string
  /** The heading it is listed under. */
  readonly group: string
  readonly shortcut?: string
  /** More words to find it by, never shown. */
  readonly keywords?: string
  /** A second line under the title. */
  readonly detail?: string
  /** Listed, but cannot be run right now. */
  readonly disabled?: boolean
  /** For a command that adds a part: which one, so it can be put somewhere else. */
  readonly place?: { readonly type: string; readonly circuit?: string }
  run(): void
}

/** Zooms by a factor around the middle of the canvas. */
export function zoomAroundCenter(factor: number): void {
  const center = canvasRuntime.current?.screenCenter() ?? { x: 0, y: 0 }
  useEditor.getState().zoomAt(factor, center.x, center.y)
}

/** Shows the whole open circuit on the canvas. */
export function fitToScreen(): void {
  const size = canvasRuntime.current?.size()
  if (size) useEditor.getState().fitToScreen(size.width, size.height)
}

/** The commands as they stand now: what is on or off depends on the state. */
export function listCommands(): Command[] {
  const editor = useEditor.getState()
  const sim = useSim.getState()
  const chrome = useChrome.getState()
  const hasSelection = editor.selection.size > 0
  const hasParts = Object.keys(editor.doc.components).length > 0
  const zoom = editor.view.zoom

  const commands: Command[] = [
    { id: 'file.new', group: 'File', title: 'Start a new project', run: () => void startNewProject() },
    {
      id: 'file.projects',
      group: 'File',
      title: 'Manage projects',
      keywords: 'list switch rename duplicate copy delete library saved',
      run: chrome.openProjects,
    },
    {
      id: 'file.open',
      group: 'File',
      title: 'Open a project file',
      shortcut: 'Ctrl+O',
      keywords: 'load import',
      run: () => void openProjectFile(),
    },
    {
      id: 'file.save',
      group: 'File',
      title: 'Save the project as a file',
      shortcut: 'Ctrl+S',
      keywords: 'download export json',
      run: saveProjectFile,
    },
    {
      id: 'file.svg',
      group: 'File',
      title: 'Export this circuit as an SVG picture',
      keywords: 'image download',
      disabled: !hasParts,
      run: exportCircuitSvg,
    },

    {
      id: 'edit.undo',
      group: 'Edit',
      title: 'Undo',
      shortcut: 'Ctrl+Z',
      disabled: editor.past.length === 0,
      run: editor.undo,
    },
    {
      id: 'edit.redo',
      group: 'Edit',
      title: 'Redo',
      shortcut: 'Ctrl+Y',
      disabled: editor.future.length === 0,
      run: editor.redo,
    },
    {
      id: 'edit.all',
      group: 'Edit',
      title: 'Select everything',
      shortcut: 'Ctrl+A',
      disabled: !hasParts,
      run: editor.selectAll,
    },
    {
      id: 'edit.copy',
      group: 'Edit',
      title: 'Copy the selection',
      shortcut: 'Ctrl+C',
      disabled: !hasSelection,
      run: editor.copy,
    },
    { id: 'edit.paste', group: 'Edit', title: 'Paste', shortcut: 'Ctrl+V', run: editor.paste },
    {
      id: 'edit.rotate',
      group: 'Edit',
      title: 'Rotate the selection',
      shortcut: 'R',
      keywords: 'turn',
      disabled: !hasSelection,
      run: editor.rotateSelection,
    },
    {
      id: 'edit.delete',
      group: 'Edit',
      title: 'Delete the selection',
      shortcut: 'Delete',
      keywords: 'remove',
      disabled: !hasSelection,
      run: editor.deleteSelection,
    },
    {
      id: 'edit.extract',
      group: 'Edit',
      title: 'Turn the selection into a circuit',
      shortcut: 'Ctrl+G',
      keywords: 'group named subcircuit',
      disabled: !hasSelection,
      run: () => void editor.selectionToCircuit(),
    },

    sim.running
      ? {
          id: 'sim.pause',
          group: 'Simulation',
          title: 'Pause the simulation',
          keywords: 'stop',
          run: () => sim.setRunning(false),
        }
      : {
          id: 'sim.run',
          group: 'Simulation',
          title: 'Run the simulation',
          keywords: 'start play',
          run: () => sim.setRunning(true),
        },
    {
      id: 'sim.step',
      group: 'Simulation',
      title: 'Step one tick',
      disabled: sim.running,
      run: stepSimulation,
    },
    {
      id: 'sim.back',
      group: 'Simulation',
      title: 'Step back one tick',
      disabled: sim.running || !sim.canStepBack,
      run: stepBack,
    },
    {
      id: 'sim.edge',
      group: 'Simulation',
      title: 'Step to the next rising edge of the clock',
      disabled: sim.running || sim.clocks === 0,
      run: stepToClockEdge,
    },
    {
      id: 'sim.restart',
      group: 'Simulation',
      title: 'Restart the circuit from time 0',
      keywords: 'reset',
      run: restartSimulation,
    },

    {
      id: 'view.timing',
      group: 'View',
      title: sim.scopeOpen ? 'Hide the timing diagram' : 'Show the timing diagram',
      keywords: 'scope waveform',
      run: () => sim.setScopeOpen(!sim.scopeOpen),
    },
    {
      id: 'view.steps',
      group: 'View',
      title: editor.stepsOpen ? 'Hide the presentation steps' : 'Show the presentation steps',
      keywords: 'slides',
      run: () => editor.setStepsOpen(!editor.stepsOpen),
    },
    {
      id: 'view.logic',
      group: 'View',
      title: chrome.settingsOpen ? 'Close the logic settings' : 'Open the logic settings',
      keywords: 'radix base gate kit colors sandbox',
      run: () => chrome.setSettingsOpen(!chrome.settingsOpen),
    },
    {
      id: 'view.cone',
      group: 'View',
      title: sim.coneShown ? 'Hide the cone of influence' : 'Show the cone of influence',
      detail: 'Lights up what the selection drives and fades what has nothing to do with it',
      keywords: 'fan in fan out depends drives highlight trace',
      run: () => sim.setConeShown(!sim.coneShown),
    },
    {
      id: 'view.calculator',
      group: 'View',
      title: 'Open the base calculator',
      keywords: 'convert radix decimal balanced number add multiply',
      run: chrome.openCalculator,
    },
    {
      id: 'view.zoom-in',
      group: 'View',
      title: 'Zoom in',
      disabled: zoom >= MAX_ZOOM,
      run: () => zoomAroundCenter(1.25),
    },
    {
      id: 'view.zoom-out',
      group: 'View',
      title: 'Zoom out',
      disabled: zoom <= MIN_ZOOM,
      run: () => zoomAroundCenter(1 / 1.25),
    },
    {
      id: 'view.zoom-reset',
      group: 'View',
      title: 'Reset zoom to 100%',
      run: () => zoomAroundCenter(1 / zoom),
    },
    {
      id: 'view.fit',
      group: 'View',
      title: 'Fit the circuit to the screen',
      keywords: 'zoom all show whole center',
      disabled: !hasParts,
      run: fitToScreen,
    },
    {
      id: 'view.light',
      group: 'View',
      title: 'Switch to light theme',
      keywords: 'white bright mode',
      disabled: editor.theme === 'light',
      run: () => editor.setTheme('light'),
    },
    {
      id: 'view.dark',
      group: 'View',
      title: 'Switch to dark theme',
      keywords: 'black night mode',
      disabled: editor.theme === 'dark',
      run: () => editor.setTheme('dark'),
    },
    {
      id: 'view.system',
      group: 'View',
      title: 'Follow the system theme',
      keywords: 'light dark auto mode',
      disabled: editor.theme === 'system',
      run: () => editor.setTheme('system'),
    },
  ]

  for (const section of paletteSections(editor.settings)) {
    for (const type of section.types) {
      commands.push({
        id: `add.${type}`,
        group: 'Add a part',
        title: `Add ${partName(type)}`,
        detail: partHint(type, editor.settings.radix),
        keywords: `${type} ${section.title} place insert`,
        place: { type },
        run: () => placeAtCenter(type),
      })
    }
  }

  for (const id of editor.order) {
    if (id === editor.active) continue
    const { name } = editor.circuits[id]
    commands.push({
      id: `circuit.open.${id}`,
      group: 'Circuits',
      title: `Open circuit ${name}`,
      keywords: 'go to switch tab',
      run: () => editor.selectCircuit(id),
    })
    if (canPlace(editor.circuits, editor.active, id)) {
      commands.push({
        id: `circuit.add.${id}`,
        group: 'Circuits',
        title: `Add circuit ${name} as a part`,
        keywords: 'place insert use',
        place: { type: SUB_TYPE, circuit: id },
        run: () => placeAtCenter(SUB_TYPE, id),
      })
    }
  }
  commands.push({
    id: 'circuit.new',
    group: 'Circuits',
    title: 'Add an empty circuit',
    keywords: 'new tab',
    run: () => void editor.addCircuit(),
  })

  for (const example of EXAMPLES) {
    commands.push({
      id: `example.${example.id}`,
      group: 'Examples',
      title: `Open example: ${example.name}`,
      detail: example.summary,
      keywords: 'sample demo',
      run: () => void openExample(example),
    })
  }

  commands.push({
    id: 'help.shortcuts',
    group: 'Help',
    title: 'Show keyboard shortcuts',
    shortcut: '?',
    keywords: 'keys hotkeys help',
    run: chrome.openShortcuts,
  })
  commands.push({
    id: 'help.tour',
    group: 'Help',
    title: 'Take the tour',
    keywords: 'intro introduction guide welcome help start',
    run: chrome.startTour,
  })
  return commands
}

/**
 * The commands a search finds, the best match first. Within one rank they
 * keep the order of the list. A blank query keeps them all.
 */
export function searchCommands(commands: readonly Command[], query: string): Command[] {
  const found = commands.filter((command) =>
    matchesQuery(
      query,
      `${command.title} ${command.group} ${command.keywords ?? ''} ${command.detail ?? ''}`,
    ),
  )
  if (query.trim() === '') return found
  const rank = (command: Command): number =>
    matchesQuery(query, command.title) ? matchRank(query, command.title) : 3
  return found
    .map((command, index) => ({ command, index, rank: rank(command) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.command)
}
