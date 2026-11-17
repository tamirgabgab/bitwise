import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findPreset } from '../core/index.ts'
import {
  EXAMPLES,
  MAX_ZOOM,
  MIN_ZOOM,
  SIM_SPEEDS,
  canvasRuntime,
  restartSimulation,
  stepBack,
  stepSimulation,
  stepToClockEdge,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { SimSpeed } from '../editor/index.ts'
import {
  BrandMark,
  DeleteIcon,
  ExamplesIcon,
  MoonIcon,
  NewIcon,
  OpenIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  RestartIcon,
  RotateIcon,
  SaveIcon,
  StepBackIcon,
  StepEdgeIcon,
  StepIcon,
  SunIcon,
  TimingIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.tsx'
import { openExample, openProjectFile, saveProjectFile, startNewProject } from './persistence.ts'
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

function zoomAroundCenter(factor: number): void {
  const center = canvasRuntime.current?.screenCenter() ?? { x: 0, y: 0 }
  useEditor.getState().zoomAt(factor, center.x, center.y)
}

function speedLabel(speed: SimSpeed): string {
  if (speed === 'max') return 'Full speed'
  return speed === 1 ? '1 tick/s' : `${speed} ticks/s`
}

function SimControls() {
  const running = useSim((state) => state.running)
  const speed = useSim((state) => state.speed)
  const hasClock = useSim((state) => state.clocks > 0)
  const scopeOpen = useSim((state) => state.scopeOpen)
  const canStepBack = useSim((state) => state.canStepBack)
  const { setRunning, setSpeed, setScopeOpen } = useSim.getState()

  return (
    <div className="tool-group">
      {running ? (
        <ToolButton label="Pause the simulation" onClick={() => setRunning(false)}>
          <PauseIcon />
        </ToolButton>
      ) : (
        <ToolButton label="Run the simulation" onClick={() => setRunning(true)}>
          <PlayIcon />
        </ToolButton>
      )}
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
    </div>
  )
}

/** The ready-made projects, in a menu that drops from its button. */
function ExamplesMenu() {
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

  return (
    <>
      <button
        ref={button}
        type="button"
        className="tool"
        aria-label="Open an example"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open an example"
        onClick={() => {
          // The bar can scroll sideways on a phone, so the menu is placed on
          // the screen and not inside the bar.
          const rect = button.current?.getBoundingClientRect()
          setLeft(open || !rect ? null : Math.max(8, Math.min(rect.left, window.innerWidth - 308)))
        }}
      >
        <ExamplesIcon />
      </button>
      {open && (
        <div
          ref={menu}
          className="menu"
          role="menu"
          aria-label="Examples"
          style={{ left }}
          onKeyDown={(event) => {
            if (event.code === 'ArrowDown') step(1)
            else if (event.code === 'ArrowUp') step(-1)
            else return
            event.preventDefault()
          }}
        >
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setLeft(null)
                void openExample(example)
              }}
            >
              <span className="menu-name">{example.name}</span>
              <span className="menu-summary">{example.summary}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

interface ToolbarProps {
  settingsOpen: boolean
  onToggleSettings: () => void
}

export function Toolbar({ settingsOpen, onToggleSettings }: ToolbarProps) {
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
        <span className="brand-name">Cedar Logic</span>
      </h1>

      <div className="tool-group">
        <ToolButton label="New project" onClick={() => void startNewProject()}>
          <NewIcon />
        </ToolButton>
        <ToolButton label="Open a project file" shortcut="Ctrl+O" onClick={() => void openProjectFile()}>
          <OpenIcon />
        </ToolButton>
        <ToolButton label="Save the project as a file" shortcut="Ctrl+S" onClick={saveProjectFile}>
          <SaveIcon />
        </ToolButton>
        <ExamplesMenu />
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

      <div className="spacer" />

      <div className="tool-group">
        <button
          type="button"
          className="tool logic-button"
          aria-expanded={settingsOpen}
          aria-controls="logic-settings"
          title="Logic settings: values per wire, gate kit and colors"
          onClick={onToggleSettings}
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
