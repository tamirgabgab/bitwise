import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findPreset } from '../core/index.ts'
import {
  EXAMPLES,
  MAX_ZOOM,
  MIN_ZOOM,
  SIM_SPEEDS,
  restartSimulation,
  stepBack,
  stepSimulation,
  stepToClockEdge,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { SimSpeed } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { fitToScreen, zoomAroundCenter } from './commands.ts'
import { startPresenting } from './presentation.ts'
import {
  BrandMark,
  ChevronIcon,
  DeleteIcon,
  FitIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PresentIcon,
  RedoIcon,
  RestartIcon,
  RotateIcon,
  SearchIcon,
  StepBackIcon,
  StepEdgeIcon,
  StepIcon,
  StepsIcon,
  SunIcon,
  TimingIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.tsx'
import { Keys } from './Keys.tsx'
import {
  copyShareLink,
  exportCircuitSvg,
  exportCircuitVerilog,
  openExample,
  openProjectFile,
  saveProjectFile,
  startNewProject,
} from './persistence.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

interface ToolButtonProps {
  /** What the button does. Shown as its tooltip, with the shortcut if any. */
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolButton({ label, shortcut, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace('Ctrl', 'Control')}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function speedLabel(speed: SimSpeed): string {
  if (speed === 'max') return t('Full speed')
  return speed === 1 ? t('1 tick/s') : t('{speed} ticks/s', { speed })
}

function SimControls() {
  const running = useSim((state) => state.running)
  const speed = useSim((state) => state.speed)
  const hasClock = useSim((state) => state.clocks > 0)
  const canStepBack = useSim((state) => state.canStepBack)
  const { setRunning, setSpeed } = useSim.getState()

  return (
    <div className="tool-group transport" role="group" aria-label={t('Simulation')}>
      <button
        type="button"
        className={running ? 'run run-on' : 'run'}
        title={running ? t('Pause the simulation') : t('Run the simulation')}
        onClick={() => setRunning(!running)}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? t('Pause') : t('Run')}
      </button>
      <ToolButton
        label={
          canStepBack || running
            ? t('Step back one tick')
            : t('Step back one tick (nothing to go back to yet)')
        }
        disabled={running || !canStepBack}
        onClick={stepBack}
      >
        <StepBackIcon />
      </ToolButton>
      <ToolButton label={t('Step one tick')} disabled={running} onClick={stepSimulation}>
        <StepIcon />
      </ToolButton>
      <ToolButton
        label={
          hasClock
            ? t('Step to the next rising edge of the clock')
            : t('Step to the next clock edge (this circuit has no clock)')
        }
        disabled={running || !hasClock}
        onClick={stepToClockEdge}
      >
        <StepEdgeIcon />
      </ToolButton>
      <ToolButton label={t('Restart the circuit from time 0')} onClick={restartSimulation}>
        <RestartIcon />
      </ToolButton>
      <select
        className="speed"
        aria-label={t('Simulation speed')}
        title={t('Simulation speed')}
        value={String(speed)}
        onChange={(event) => {
          const value = event.target.value
          setSpeed(value === 'max' ? 'max' : Number(value))
        }}
      >
        {SIM_SPEEDS.map((option) => (
          <option key={String(option)} value={String(option)}>
            {speedLabel(option)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The panels that open under the canvas. */
function PanelToggles() {
  const scopeOpen = useSim((state) => state.scopeOpen)
  const stepsOpen = useEditor((state) => state.stepsOpen)
  const { setScopeOpen } = useSim.getState()

  return (
    <div className="tool-group">
      <button
        type="button"
        className="tool"
        aria-label={t('Timing diagram')}
        aria-pressed={scopeOpen}
        title={scopeOpen ? t('Hide the timing diagram') : t('Show the timing diagram')}
        onClick={() => setScopeOpen(!scopeOpen)}
      >
        <TimingIcon />
      </button>
      <button
        type="button"
        className="tool"
        aria-label={t('Presentation steps')}
        aria-pressed={stepsOpen}
        title={stepsOpen ? t('Hide the presentation steps') : t('Show the presentation steps')}
        onClick={() => useEditor.getState().setStepsOpen(!stepsOpen)}
      >
        <StepsIcon />
      </button>
      <button
        type="button"
        className="tool"
        aria-label={t('Present full screen')}
        title={t('Present full screen: only the canvas and the steps (Esc to leave)')}
        onClick={startPresenting}
      >
        <PresentIcon />
      </button>
    </div>
  )
}

interface MenuRowProps {
  name: string
  summary?: string
  shortcut?: string
  onPick: () => void
}

function MenuRow({ name, summary, shortcut, onPick }: MenuRowProps) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onPick}>
      <span className="menu-text">
        <span className="menu-name">{name}</span>
        {summary && <span className="menu-summary">{summary}</span>}
      </span>
      {shortcut && <Keys combo={shortcut} />}
    </button>
  )
}

/** Everything about the project as a whole, in a menu that drops from its button. */
function FileMenu() {
  const [left, setLeft] = useState<number | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = left !== null

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const close = (): void => setLeft(null)
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') return
      close()
      button.current?.focus()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  /** Moves the focus along the menu with the arrow keys. */
  const step = (by: number): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[(index + by + items.length) % items.length]?.focus()
  }
  /** Closes the menu and then does what the row says. */
  const pick = (action: () => void) => (): void => {
    setLeft(null)
    action()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="tool menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Project files, examples and shortcuts')}
        onClick={() => {
          // The bar can scroll sideways on a phone, so the menu is placed on
          // the screen and not inside the bar.
          const rect = button.current?.getBoundingClientRect()
          setLeft(open || !rect ? null : Math.max(8, Math.min(rect.left, window.innerWidth - 328)))
        }}
      >
        {t('File')}
        <ChevronIcon />
      </button>
      {open && (
        <div
          ref={menu}
          className="menu"
          role="menu"
          aria-label={t('File')}
          style={{ left }}
          onKeyDown={(event) => {
            if (event.code === 'ArrowDown') step(1)
            else if (event.code === 'ArrowUp') step(-1)
            else return
            event.preventDefault()
          }}
        >
          <MenuRow name={t('Start a new project')} onPick={pick(() => void startNewProject())} />
          <MenuRow
            name={t('Home')}
            summary={t('Your projects and the examples, with pictures')}
            onPick={pick(useChrome.getState().openHome)}
          />
          <MenuRow
            name={t('Versions of this project')}
            summary={t('Save a version, or go back to one')}
            onPick={pick(useChrome.getState().openVersions)}
          />
          <MenuRow
            name={t('Open a project file')}
            shortcut="Ctrl+O"
            onPick={pick(() => void openProjectFile())}
          />
          <MenuRow name={t('Save the project as a file')} shortcut="Ctrl+S" onPick={pick(saveProjectFile)} />
          <MenuRow name={t('Copy a link to this project')} onPick={pick(() => void copyShareLink())} />
          <MenuRow name={t('Export this circuit as an SVG picture')} onPick={pick(exportCircuitSvg)} />
          <MenuRow
            name={t('Export this circuit as Verilog')}
            summary={t('A .v file, at radix 2')}
            onPick={pick(() => void exportCircuitVerilog())}
          />
          <MenuRow
            name={t('Build circuits from Verilog')}
            summary={t('Paste code or open a .v file')}
            onPick={pick(useChrome.getState().openVerilog)}
          />
          <div className="menu-heading" role="separator">
            {t('Open an example as a new project')}
          </div>
          {EXAMPLES.map((example) => (
            <MenuRow
              key={example.id}
              name={t(example.name)}
              summary={t(example.summary)}
              onPick={pick(() => void openExample(example))}
            />
          ))}
          <div className="menu-rule" role="separator" />
          <MenuRow
            name={t('Show keyboard shortcuts')}
            shortcut="?"
            onPick={pick(useChrome.getState().openShortcuts)}
          />
          <MenuRow
            name={t('Show the edit history')}
            summary={t('Go back to any edit by name')}
            onPick={pick(useChrome.getState().openHistory)}
          />
          <MenuRow
            name={t('Arrange the circuit')}
            summary={t('Left to right by depth, as one edit')}
            onPick={pick(() => useEditor.getState().arrangeAll())}
          />
          <MenuRow
            name={t('Describe the circuit in words')}
            summary={t('What it is made of and what each output depends on')}
            onPick={pick(useChrome.getState().openDescribe)}
          />
          <MenuRow
            name={t('Open the base calculator')}
            summary={t('Base n, decimal and balanced')}
            onPick={pick(useChrome.getState().openCalculator)}
          />
          <MenuRow name={t('Take the tour')} onPick={pick(useChrome.getState().startTour)} />
        </div>
      )}
    </>
  )
}

export function Toolbar() {
  const settingsOpen = useChrome((state) => state.settingsOpen)
  const canUndo = useEditor((state) => state.past.length > 0)
  const canRedo = useEditor((state) => state.future.length > 0)
  const hasSelection = useEditor((state) => state.selection.size > 0)
  const canRotate = useEditor((state) => {
    for (const id of state.selection) {
      if (id in state.doc.components) return true
    }
    return false
  })
  const zoom = useEditor((state) => state.view.zoom)
  const radix = useEditor((state) => state.settings.radix)
  const presetId = useEditor((state) => state.settings.preset)
  const sandbox = useEditor((state) => state.settings.sandbox)
  const theme = useResolvedTheme()
  const { undo, redo, rotateSelection, deleteSelection, setTheme } = useEditor.getState()
  const kit = sandbox ? t('Sandbox') : t(findPreset(presetId)?.name ?? '')

  return (
    <header className="topbar">
      <h1 className="brand">
        <span className="wordmark">
          <BrandMark />
          <span className="brand-name">Bitwise</span>
        </span>
      </h1>

      <div className="tool-group">
        <FileMenu />
      </div>

      <div className="tool-group">
        <ToolButton label={t('Undo')} shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label={t('Redo')} shortcut="Ctrl+Y" disabled={!canRedo} onClick={redo}>
          <RedoIcon />
        </ToolButton>
      </div>

      <div className="tool-group">
        <ToolButton label={t('Rotate')} shortcut="R" disabled={!canRotate} onClick={rotateSelection}>
          <RotateIcon />
        </ToolButton>
        <ToolButton
          label={t('Delete')}
          shortcut="Delete"
          disabled={!hasSelection}
          onClick={deleteSelection}
        >
          <DeleteIcon />
        </ToolButton>
      </div>

      <SimControls />
      <PanelToggles />

      <div className="spacer" />

      <div className="tool-group">
        <button
          type="button"
          className="tool search-button"
          aria-label={t('Search actions')}
          aria-keyshortcuts="Control+K"
          title={t('Search actions, parts, circuits and examples (Ctrl+K)')}
          onClick={() => useChrome.getState().openCommands()}
        >
          <SearchIcon />
          <span className="search-label">{t('Search')}</span>
          <Keys combo="Ctrl+K" />
        </button>
        <button
          type="button"
          className="tool logic-button"
          aria-expanded={settingsOpen}
          aria-controls="logic-settings"
          title={t('Logic settings: values per wire, gate kit and colors')}
          onClick={() => useChrome.getState().setSettingsOpen(!settingsOpen)}
        >
          <span className="logic-radix">{t('Radix {radix}', { radix })}</span>
          <span className="logic-kit">{kit}</span>
        </button>
      </div>

      <div className="tool-group zoom-group">
        <ToolButton
          label={t('Zoom out')}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomAroundCenter(1 / 1.25)}
        >
          <ZoomOutIcon />
        </ToolButton>
        <button
          type="button"
          className="tool zoom-readout"
          title={t('Reset zoom to 100%')}
          aria-label={t('Zoom {percent}%. Reset to 100%', { percent: Math.round(zoom * 100) })}
          onClick={() => zoomAroundCenter(1 / zoom)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <ToolButton
          label={t('Zoom in')}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomAroundCenter(1.25)}
        >
          <ZoomInIcon />
        </ToolButton>
        <ToolButton label={t('Fit the circuit to the screen')} onClick={fitToScreen}>
          <FitIcon />
        </ToolButton>
      </div>

      <div className="tool-group">
        {theme === 'dark' ? (
          <ToolButton label={t('Switch to light theme')} onClick={() => setTheme('light')}>
            <SunIcon />
          </ToolButton>
        ) : (
          <ToolButton label={t('Switch to dark theme')} onClick={() => setTheme('dark')}>
            <MoonIcon />
          </ToolButton>
        )}
      </div>
    </header>
  )
}
