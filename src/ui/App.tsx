import { useCallback, useState } from 'react'
import { CanvasView } from './CanvasView.tsx'
import { CircuitTabs } from './CircuitTabs.tsx'
import { DialogHost } from './DialogHost.tsx'
import { Palette } from './Palette.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { StatusBar } from './StatusBar.tsx'
import { Toolbar } from './Toolbar.tsx'
import './App.css'

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  return (
    <div className="app">
      <Toolbar
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
      />
      <CircuitTabs />
      <div className="workspace">
        <Palette />
        <CanvasView />
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      </div>
      <StatusBar />
      <DialogHost />
    </div>
  )
}
