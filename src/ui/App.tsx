import { useEffect } from 'react'
import { CanvasView } from './CanvasView.tsx'
import { listenForChromeKeys, useChrome } from './chrome.ts'
import { CircuitTabs } from './CircuitTabs.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { DialogHost } from './DialogHost.tsx'
import { Palette } from './Palette.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { ShortcutsSheet } from './ShortcutsSheet.tsx'
import { StatusBar } from './StatusBar.tsx'
import { StepsPanel } from './StepsPanel.tsx'
import { TimingPanel } from './TimingPanel.tsx'
import { Toolbar } from './Toolbar.tsx'
import './App.css'

const closeSettings = (): void => useChrome.getState().setSettingsOpen(false)

export function App() {
  const settingsOpen = useChrome((state) => state.settingsOpen)

  useEffect(() => listenForChromeKeys(), [])

  return (
    <div className="app">
      <Toolbar />
      <CircuitTabs />
      <div className="workspace">
        <Palette />
        <CanvasView />
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      </div>
      <StepsPanel />
      <TimingPanel />
      <StatusBar />
      <CommandPalette />
      <ShortcutsSheet />
      <DialogHost />
    </div>
  )
}
