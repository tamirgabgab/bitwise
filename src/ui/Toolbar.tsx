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
  exportCircuitSvg,
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
  if (speed === 'max') return 'Full speed'
  return speed === 1 ? '1 tick/s' : `${speed} ticks/s`
}

function SimControls() {
  const running = useSim((state) => state.running)
  const speed = useSim((state) => state.speed)
  const hasClock = useSim((state) => state.clocks > 0)
  const canStepBack = useSim((state) => state.canStepBack)
  const { setRunning, setSpeed } = useSim.getState()

  return (
    <div className="tool-group transport" role="group" aria-label="Simulation">
      <button
        type="button"
        className={running ? 'run run-on' : 'run'}
        title={running ? 'Pause the simulation' : 'Run the simulation'}
        onClick={() => setRunning(!running)}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? 'Pause' : 'Run'}
      </button>
      <ToolButton
        label={
          canStepBack || running
            ? 'Step back one tick'
            : 'Step back one tick (nothing to go back to yet)'
        }
        disabled={running || !canStepBack}
        onClick={stepBack}
      >
        <StepBackIcon />
      </ToolButton>
      <ToolButton label="Step one tick" disabled={running} onClick={stepSimulation}>
        <StepIcon />
      </ToolButton>
      <ToolButton
        label={
          hasClock
            ? 'Step to the next rising edge of the clock'
            : 'Step to the next clock edge (this circuit has no clock)'
        }
        disabled={running || !hasClock}
        onClick={stepToClockEdge}
      >
        <StepEdgeIcon />
      </ToolButton>
      <ToolButton label="Restart the circuit from time 0" onClick={restartSimulation}>
        <RestartIcon />
      </ToolButton>
      <select
        className="speed"
        aria-label="Simulation speed"
        title="Simulation speed"
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
        aria-label="Timing diagram"
        aria-pressed={scopeOpen}
        title={scopeOpen ? 'Hide the timing diagram' : 'Show the timing diagram'}
        onClick={() => setScopeOpen(!scopeOpen)}
      >
        <TimingIcon />
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Presentation steps"
        aria-pressed={stepsOpen}
        title={stepsOpen ? 'Hide the presentation steps' : 'Show the presentation steps'}
        onClick={() => useEditor.getState().setStepsOpen(!stepsOpen)}
      >
        <StepsIcon />
      </button>
      <button
        type="button"
        className="tool"
        aria-label="Present full screen"
        title="Present full screen: only the canvas and the steps (Esc to leave)"
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
        title="Project files, examples and shortcuts"
        onClick={() => {
          // The bar can scroll sideways on a phone, so the menu is placed on
          // the screen and not inside the bar.
          const rect = button.current?.getBoundingClientRect()
          setLeft(open || !rect ? null : Math.max(8, Math.min(rect.left, window.innerWidth - 328)))
        }}
      >
        File
        <ChevronIcon />
      </button>
      {open && (
        <div
          ref={menu}
          className="menu"
          role="menu"
          aria-label="File"
          style={{ left }}
          onKeyDown={(event) => {
            if (event.code === 'ArrowDown') step(1)
            else if (event.code === 'ArrowUp') step(-1)
            else return
            event.preventDefault()
          }}
        >
          <MenuRow name="Start a new project" onPick={pick(() => void startNewProject())} />
          <MenuRow
            name="Home"
            summary="Your projects and the examples, with pictures"
            onPick={pick(useChrome.getState().openHome)}
          />
          <MenuRow
            name="Versions of this project"
            summary="Save a version, or go back to one"
            onPick={pick(useChrome.getState().openVersions)}
          />
          <MenuRow
            name="Open a project file"
            shortcut="Ctrl+O"
            onPick={pick(() => void openProjectFile())}
          />
          <MenuRow name="Save the project as a file" shortcut="Ctrl+S" onPick={pick(saveProjectFile)} />
          <MenuRow name="Export this circuit as an SVG picture" onPick={pick(exportCircuitSvg)} />
          <div className="menu-heading" role="separator">
            Open an example as a new project
          </div>
          {EXAMPLES.map((example) => (
            <MenuRow
              key={example.id}
              name={example.name}
              summary={example.summary}
              onPick={pick(() => void openExample(example))}
            />
          ))}
          <div className="menu-rule" role="separator" />
          <MenuRow
            name="Show keyboard shortcuts"
            shortcut="?"
            onPick={pick(useChrome.getState().openShortcuts)}
          />
          <MenuRow
            name="Show the edit history"
            summary="Go back to any edit by name"
            onPick={pick(useChrome.getState().openHistory)}
          />
          <MenuRow
            name="Arrange the circuit"
            summary="Left to right by depth, as one edit"
            onPick={pick(() => useEditor.getState().arrangeAll())}
          />
          <MenuRow
            name="Describe the circuit in words"
            summary="What it is made of and what each output depends on"
            onPick={pick(useChrome.getState().openDescribe)}
          />
          <MenuRow
            name="Open the base calculator"
            summary="Base n, decimal and balanced"
            onPick={pick(useChrome.getState().openCalculator)}
          />
          <MenuRow name="Take the tour" onPick={pick(useChrome.getState().startTour)} />
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
  const kit = sandbox ? 'Sandbox' : (findPreset(presetId)?.name ?? '')

  return (
    <header className="topbar">
      <h1 className="brand">
        <BrandMark />
        <span className="brand-name">Bitwise</span>
      </h1>

      <div className="tool-group">
        <FileMenu />
      </div>

      <div className="tool-group">
        <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label="Redo" shortcut="Ctrl+Y" disabled={!canRedo} onClick={redo}>
          <RedoIcon />
        </ToolButton>
      </div>

      <div className="tool-group">
        <ToolButton label="Rotate" shortcut="R" disabled={!canRotate} onClick={rotateSelection}>
          <RotateIcon />
        </ToolButton>
        <ToolButton
          label="Delete"
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
          aria-label="Search actions"
          aria-keyshortcuts="Control+K"
          title="Search actions, parts, circuits and examples (Ctrl+K)"
          onClick={() => useChrome.getState().openCommands()}
        >
          <SearchIcon />
          <span className="search-label">Search</span>
          <Keys combo="Ctrl+K" />
        </button>
        <button
          type="button"
          className="tool logic-button"
          aria-expanded={settingsOpen}
          aria-controls="logic-settings"
          title="Logic settings: values per wire, gate kit and colors"
          onClick={() => useChrome.getState().setSettingsOpen(!settingsOpen)}
        >
          <span className="logic-radix">Radix {radix}</span>
          <span className="logic-kit">{kit}</span>
        </button>
      </div>

      <div className="tool-group zoom-group">
        <ToolButton
          label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomAroundCenter(1 / 1.25)}
        >
          <ZoomOutIcon />
        </ToolButton>
        <button
          type="button"
          className="tool zoom-readout"
          title="Reset zoom to 100%"
          aria-label={`Zoom ${Math.round(zoom * 100)}%. Reset to 100%`}
          onClick={() => zoomAroundCenter(1 / zoom)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <ToolButton
          label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomAroundCenter(1.25)}
        >
          <ZoomInIcon />
        </ToolButton>
        <ToolButton label="Fit the circuit to the screen" onClick={fitToScreen}>
          <FitIcon />
        </ToolButton>
      </div>

      <div className="tool-group">
        {theme === 'dark' ? (
          <ToolButton label="Switch to light theme" onClick={() => setTheme('light')}>
            <SunIcon />
          </ToolButton>
        ) : (
          <ToolButton label="Switch to dark theme" onClick={() => setTheme('dark')}>
            <MoonIcon />
          </ToolButton>
        )}
      </div>
    </header>
  )
}
