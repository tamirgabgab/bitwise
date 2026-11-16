import type { ReactNode } from 'react'
import { findPreset } from '../core/index.ts'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  SIM_SPEEDS,
  canvasRuntime,
  restartSimulation,
  stepSimulation,
  useEditor,
  useSim,
} from '../editor/index.ts'
import type { SimSpeed } from '../editor/index.ts'
import {
  BrandMark,
  DeleteIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  RestartIcon,
  RotateIcon,
  StepIcon,
  SunIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.tsx'
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
  const { setRunning, setSpeed } = useSim.getState()

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
      <ToolButton label="Step one tick" disabled={running} onClick={stepSimulation}>
        <StepIcon />
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
