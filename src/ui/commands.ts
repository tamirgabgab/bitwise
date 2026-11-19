import {
  CANVAS_LOOKS,
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
import { language, msg, t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { chooseLanguage } from './language.ts'
import { startPresenting } from './presentation.ts'
import { matchRank, matchesQuery, paletteSections } from './paletteModel.ts'
import { partHint, partName } from './parts.ts'
import {
  copyShareLink,
  exportCircuitSvg,
  exportCircuitVerilog,
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
  /** What it does, starting with the verb, in the language of the interface. */
  readonly title: string
  /** The title in English, so an English search finds it in any language. */
  readonly english?: string
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

type Values = Readonly<Record<string, string | number>>

/**
 * A title in the language of the interface, from a message marked with
 * `msg`, and the same title in English for the search. The English takes
 * `english` for its places when the shown values are translated.
 */
function titled(
  text: string,
  values?: Values,
  english: Values | undefined = values,
): Pick<Command, 'title' | 'english'> {
  return {
    title: t(text, values),
    english: text.replace(/\{(\w+)\}/g, (place, name: string) =>
      english && Object.hasOwn(english, name) ? String(english[name]) : place,
    ),
  }
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
    { id: 'file.new', group: t('File'), ...titled(msg('Start a new project')), run: () => void startNewProject() },
    {
      id: 'file.projects',
      group: t('File'),
      ...titled(msg('Go to the home screen')),
      detail: t('Your projects and the examples, with pictures'),
      keywords: 'home projects list switch rename duplicate copy delete library saved gallery',
      run: chrome.openHome,
    },
    {
      id: 'file.versions',
      group: t('File'),
      ...titled(msg('Show the versions of this project')),
      detail: t('Save a version, or go back to one'),
      keywords: 'history snapshot checkpoint restore timeline backup',
      run: chrome.openVersions,
    },
    {
      id: 'view.present',
      group: t('View'),
      ...titled(msg('Present full screen')),
      detail: t('Only the canvas and the steps, with a laser pointer'),
      keywords: 'presentation slideshow fullscreen laser pointer lecture',
      run: startPresenting,
    },
    {
      id: 'file.open',
      group: t('File'),
      ...titled(msg('Open a project file')),
      shortcut: 'Ctrl+O',
      keywords: 'load import',
      run: () => void openProjectFile(),
    },
    {
      id: 'file.save',
      group: t('File'),
      ...titled(msg('Save the project as a file')),
      shortcut: 'Ctrl+S',
      keywords: 'download export json',
      run: saveProjectFile,
    },
    {
      id: 'circuits.expression',
      group: t('Circuits'),
      ...titled(msg('Build a circuit from an expression')),
      detail: t('Type a & ~b | c and get the fewest gates as a new circuit'),
      keywords: 'expression formula boolean logic synthesize minimize sum of products',
      run: chrome.openExpression,
    },
    {
      id: 'circuits.verilog',
      group: t('Circuits'),
      ...titled(msg('Build circuits from Verilog')),
      detail: t('Paste modules or open a .v file, and get each module as a new circuit. Radix 2 only'),
      keywords: 'verilog hdl import code module rtl systemverilog paste read open',
      run: chrome.openVerilog,
    },
    {
      id: 'file.share',
      group: t('File'),
      ...titled(msg('Copy a link to this project')),
      detail: t('The whole project rides in the link; no file needed'),
      keywords: 'share send url address clipboard',
      run: () => void copyShareLink(),
    },
    {
      id: 'file.svg',
      group: t('File'),
      ...titled(msg('Export this circuit as an SVG picture')),
      keywords: 'image download',
      disabled: !hasParts,
      run: exportCircuitSvg,
    },
    {
      id: 'file.verilog',
      group: t('File'),
      ...titled(msg('Export this circuit as Verilog')),
      detail: t('A .v file with a module for it and for each circuit it uses. Radix 2 only'),
      keywords: 'hdl code download module rtl systemverilog',
      disabled: !hasParts,
      run: () => void exportCircuitVerilog(),
    },

    {
      id: 'edit.undo',
      group: t('Edit'),
      ...titled(msg('Undo')),
      shortcut: 'Ctrl+Z',
      disabled: editor.past.length === 0,
      run: editor.undo,
    },
    {
      id: 'edit.redo',
      group: t('Edit'),
      ...titled(msg('Redo')),
      shortcut: 'Ctrl+Y',
      disabled: editor.future.length === 0,
      run: editor.redo,
    },
    {
      id: 'view.problems',
      group: t('View'),
      ...titled(chrome.problemsOpen ? msg('Hide the problems') : msg('Show the problems')),
      detail: t('Floating inputs, conflicts, loops and parts that drive nothing'),
      keywords: 'errors warnings check lint issues floating conflict loop unused',
      run: () => chrome.setProblemsOpen(!chrome.problemsOpen),
    },
    {
      id: 'edit.history',
      group: t('Edit'),
      ...titled(msg('Show the edit history')),
      detail: t('Every edit by name; pick one to go back to it'),
      keywords: 'undo redo steps list jump',
      disabled: editor.past.length === 0 && editor.future.length === 0,
      run: chrome.openHistory,
    },
    {
      id: 'edit.all',
      group: t('Edit'),
      ...titled(msg('Select everything')),
      shortcut: 'Ctrl+A',
      disabled: !hasParts,
      run: editor.selectAll,
    },
    {
      id: 'edit.copy',
      group: t('Edit'),
      ...titled(msg('Copy the selection')),
      shortcut: 'Ctrl+C',
      disabled: !hasSelection,
      run: editor.copy,
    },
    { id: 'edit.paste', group: t('Edit'), ...titled(msg('Paste')), shortcut: 'Ctrl+V', run: editor.paste },
    {
      id: 'edit.rotate',
      group: t('Edit'),
      ...titled(msg('Rotate the selection')),
      shortcut: 'R',
      keywords: 'turn',
      disabled: !hasSelection,
      run: editor.rotateSelection,
    },
    {
      id: 'edit.delete',
      group: t('Edit'),
      ...titled(msg('Delete the selection')),
      shortcut: 'Delete',
      keywords: 'remove',
      disabled: !hasSelection,
      run: editor.deleteSelection,
    },
    {
      id: 'edit.arrange',
      group: t('Edit'),
      ...titled(msg('Arrange the circuit left to right')),
      detail: t('Each part a column after what feeds it; frames move as one block'),
      keywords: 'auto layout tidy sort columns depth clean up',
      disabled: Object.keys(editor.doc.components).length === 0,
      run: editor.arrangeAll,
    },
    {
      id: 'file.describe',
      group: t('File'),
      ...titled(msg('Describe the circuit in words')),
      detail: t('What it is made of and what each output depends on'),
      keywords: 'text summary screen reader accessibility explain',
      run: chrome.openDescribe,
    },
    {
      id: 'edit.frame',
      group: t('Edit'),
      ...titled(msg('Put a frame around the selection')),
      keywords: 'group box border title section',
      disabled: !hasSelection,
      run: editor.frameSelection,
    },
    {
      id: 'edit.extract',
      group: t('Edit'),
      ...titled(msg('Turn the selection into a circuit')),
      shortcut: 'Ctrl+G',
      keywords: 'group named subcircuit',
      disabled: !hasSelection,
      run: () => void editor.selectionToCircuit(),
    },

    sim.running
      ? {
          id: 'sim.pause',
          group: t('Simulation'),
          ...titled(msg('Pause the simulation')),
          keywords: 'stop',
          run: () => sim.setRunning(false),
        }
      : {
          id: 'sim.run',
          group: t('Simulation'),
          ...titled(msg('Run the simulation')),
          keywords: 'start play',
          run: () => sim.setRunning(true),
        },
    {
      id: 'sim.step',
      group: t('Simulation'),
      ...titled(msg('Step one tick')),
      disabled: sim.running,
      run: stepSimulation,
    },
    {
      id: 'sim.back',
      group: t('Simulation'),
      ...titled(msg('Step back one tick')),
      disabled: sim.running || !sim.canStepBack,
      run: stepBack,
    },
    {
      id: 'sim.edge',
      group: t('Simulation'),
      ...titled(msg('Step to the next rising edge of the clock')),
      disabled: sim.running || sim.clocks === 0,
      run: stepToClockEdge,
    },
    {
      id: 'sim.restart',
      group: t('Simulation'),
      ...titled(msg('Restart the circuit from time 0')),
      keywords: 'reset',
      run: restartSimulation,
    },

    {
      id: 'view.timing',
      group: t('View'),
      ...titled(sim.scopeOpen ? msg('Hide the timing diagram') : msg('Show the timing diagram')),
      keywords: 'scope waveform',
      run: () => sim.setScopeOpen(!sim.scopeOpen),
    },
    {
      id: 'view.steps',
      group: t('View'),
      ...titled(editor.stepsOpen ? msg('Hide the presentation steps') : msg('Show the presentation steps')),
      keywords: 'slides',
      run: () => editor.setStepsOpen(!editor.stepsOpen),
    },
    {
      id: 'view.logic',
      group: t('View'),
      ...titled(chrome.settingsOpen ? msg('Close the logic settings') : msg('Open the logic settings')),
      keywords: 'radix base gate kit colors sandbox',
      run: () => chrome.setSettingsOpen(!chrome.settingsOpen),
    },
    {
      id: 'view.cone',
      group: t('View'),
      ...titled(sim.coneShown ? msg('Hide the cone of influence') : msg('Show the cone of influence')),
      detail: t('Lights up what the selection drives and fades what has nothing to do with it'),
      keywords: 'fan in fan out depends drives highlight trace',
      run: () => sim.setConeShown(!sim.coneShown),
    },
    {
      id: 'view.language',
      group: t('View'),
      // Each language is named in itself, so it is found by someone who cannot read the other.
      ...(language() === 'he'
        ? titled(msg('Show the interface in English'))
        : titled(msg('Show the interface in Hebrew'))),
      keywords: 'language interface english hebrew rtl right to left translate עברית אנגלית שפה',
      run: () => void chooseLanguage(language() === 'he' ? 'en' : 'he'),
    },
    {
      id: 'view.calculator',
      group: t('View'),
      ...titled(msg('Open the base calculator')),
      keywords: 'convert radix decimal balanced number add multiply',
      run: chrome.openCalculator,
    },
    {
      id: 'view.zoom-in',
      group: t('View'),
      ...titled(msg('Zoom in')),
      disabled: zoom >= MAX_ZOOM,
      run: () => zoomAroundCenter(1.25),
    },
    {
      id: 'view.zoom-out',
      group: t('View'),
      ...titled(msg('Zoom out')),
      disabled: zoom <= MIN_ZOOM,
      run: () => zoomAroundCenter(1 / 1.25),
    },
    {
      id: 'view.zoom-reset',
      group: t('View'),
      ...titled(msg('Reset zoom to 100%')),
      run: () => zoomAroundCenter(1 / zoom),
    },
    {
      id: 'view.fit',
      group: t('View'),
      ...titled(msg('Fit the circuit to the screen')),
      keywords: 'zoom all show whole center',
      disabled: !hasParts,
      run: fitToScreen,
    },
    {
      id: 'view.light',
      group: t('View'),
      ...titled(msg('Switch to light theme')),
      keywords: 'white bright mode',
      disabled: editor.theme === 'light',
      run: () => editor.setTheme('light'),
    },
    {
      id: 'view.dark',
      group: t('View'),
      ...titled(msg('Switch to dark theme')),
      keywords: 'black night mode',
      disabled: editor.theme === 'dark',
      run: () => editor.setTheme('dark'),
    },
    {
      id: 'view.system',
      group: t('View'),
      ...titled(msg('Follow the system theme')),
      keywords: 'light dark auto mode',
      disabled: editor.theme === 'system',
      run: () => editor.setTheme('system'),
    },
    ...CANVAS_LOOKS.map((look) => ({
      id: `view.look.${look.id}`,
      group: t('View'),
      ...titled(msg('Paint the canvas: {look}'), { look: t(look.name) }, { look: look.name }),
      keywords: 'canvas look theme colors blueprint chalkboard scope green classic',
      disabled: editor.canvasLook === look.id,
      run: () => editor.setCanvasLook(look.id),
    })),
    {
      id: 'view.gates',
      group: t('View'),
      ...titled(editor.gateStyle === 'iec' ? msg('Draw gates as ANSI shapes') : msg('Draw gates as IEC boxes')),
      keywords: 'symbols ansi iec rectangular distinctive shape standard',
      run: () => editor.setGateStyle(editor.gateStyle === 'iec' ? 'ansi' : 'iec'),
    },
  ]

  for (const section of paletteSections(editor.settings)) {
    for (const type of section.types) {
      commands.push({
        id: `add.${type}`,
        group: t('Add a part'),
        ...titled(msg('Add {part}'), { part: partName(type) }),
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
      group: t('Circuits'),
      ...titled(msg('Open circuit {name}'), { name }),
      keywords: 'go to switch tab',
      run: () => editor.selectCircuit(id),
    })
    if (canPlace(editor.circuits, editor.active, id)) {
      commands.push({
        id: `circuit.add.${id}`,
        group: t('Circuits'),
        ...titled(msg('Add circuit {name} as a part'), { name }),
        keywords: 'place insert use',
        place: { type: SUB_TYPE, circuit: id },
        run: () => placeAtCenter(SUB_TYPE, id),
      })
    }
  }
  commands.push({
    id: 'circuit.new',
    group: t('Circuits'),
    ...titled(msg('Add an empty circuit')),
    keywords: 'new tab',
    run: () => void editor.addCircuit(),
  })

  for (const example of EXAMPLES) {
    commands.push({
      id: `example.${example.id}`,
      group: t('Examples'),
      ...titled(msg('Open example: {name}'), { name: t(example.name) }, { name: example.name }),
      detail: t(example.summary),
      keywords: 'sample demo',
      run: () => void openExample(example),
    })
  }

  commands.push({
    id: 'help.shortcuts',
    group: t('Help'),
    ...titled(msg('Show keyboard shortcuts')),
    shortcut: '?',
    keywords: 'keys hotkeys help',
    run: chrome.openShortcuts,
  })
  commands.push({
    id: 'help.tour',
    group: t('Help'),
    ...titled(msg('Take the tour')),
    keywords: 'intro introduction guide welcome help start',
    run: chrome.startTour,
  })
  return commands
}

/**
 * The commands a search finds, the best match first. Within one rank they
 * keep the order of the list. A blank query keeps them all. The title and
 * its English both count, so English words find a command in any language.
 */
export function searchCommands(commands: readonly Command[], query: string): Command[] {
  const found = commands.filter((command) =>
    matchesQuery(
      query,
      `${command.title} ${command.group} ${command.keywords ?? ''} ${command.detail ?? ''} ${command.english ?? ''}`,
    ),
  )
  if (query.trim() === '') return found
  const rankOf = (title: string): number =>
    matchesQuery(query, title) ? matchRank(query, title) : 3
  const rank = (command: Command): number =>
    Math.min(rankOf(command.title), command.english === undefined ? 3 : rankOf(command.english))
  return found
    .map((command, index) => ({ command, index, rank: rank(command) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.command)
}
