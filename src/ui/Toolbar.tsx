import type { ReactNode } from 'react'
import { MAX_ZOOM, MIN_ZOOM, canvasRuntime, useEditor } from '../editor/index.ts'
import {
  BrandMark,
  DeleteIcon,
  MoonIcon,
  RedoIcon,
  RotateIcon,
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

export function Toolbar() {
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
  const theme = useResolvedTheme()
  const { undo, redo, rotateSelection, deleteSelection, setTheme } = useEditor.getState()

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

      <div className="spacer" />

      <div className="tool-group">
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
