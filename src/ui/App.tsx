import { useEffect } from 'react'
import { CanvasView } from './CanvasView.tsx'
import { listenForChromeKeys, useChrome } from './chrome.ts'
import { CircuitTabs } from './CircuitTabs.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { DialogHost } from './DialogHost.tsx'
import { Inspector } from './Inspector.tsx'
import { Palette } from './Palette.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { ShortcutsSheet } from './ShortcutsSheet.tsx'
import { StatusBar } from './StatusBar.tsx'
import { StepsPanel } from './StepsPanel.tsx'
import { TimingPanel } from './TimingPanel.tsx'
import { ToastHost } from './ToastHost.tsx'
import { Toolbar } from './Toolbar.tsx'
import { Tour } from './Tour.tsx'
import './App.css'

const closeSettings = (): void => useChrome.getState().setSettingsOpen(false)

export function App() {
  const settingsOpen = useChrome((state) => state.settingsOpen)

  useEffect(() => listenForChromeKeys(), [])
  useEffect(() => {
    // A first visit starts with the tour, unless something else is open.
    const { tourDone, overlay, startTour } = useChrome.getState()
    if (!tourDone && overlay === null && !document.querySelector('dialog[open]')) startTour()
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <CircuitTabs />
      <div className="workspace">
        <Palette />
        <CanvasView />
        <Inspector />
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      </div>
      <StepsPanel />
      <TimingPanel />
      <StatusBar />
      <ToastHost />
      <CommandPalette />
      <ShortcutsSheet />
      <Tour />
      <DialogHost />
    </div>
  )
}
