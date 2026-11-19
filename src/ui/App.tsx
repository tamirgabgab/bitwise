import { useEffect } from 'react'
import { canvasHooks } from '../editor/index.ts'
import { CanvasView } from './CanvasView.tsx'
import { listenForChromeKeys, useChrome } from './chrome.ts'
import { CircuitTabs } from './CircuitTabs.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { DialogHost } from './DialogHost.tsx'
import { Inspector } from './Inspector.tsx'
import { Palette } from './Palette.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { ProblemsPanel } from './ProblemsPanel.tsx'
import { LazyOverlays } from './LazyOverlays.tsx'
import { listenForPresentation } from './presentation.ts'
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
  const presenting = useChrome((state) => state.presenting)

  useEffect(() => listenForChromeKeys(), [])
  useEffect(() => listenForPresentation(), [])
  useEffect(() => {
    canvasHooks.editMachine = (part) => useChrome.getState().openMachine(part)
    return () => {
      canvasHooks.editMachine = null
    }
  }, [])
  useEffect(() => {
    // A first visit starts with the tour; every later one at the home
    // screen. Neither when something else is open already.
    const { tourDone, overlay, startTour, openHome } = useChrome.getState()
    if (overlay !== null || document.querySelector('dialog[open]')) return
    if (tourDone) openHome()
    else startTour()
  }, [])

  return (
    <div className={presenting ? 'app presenting' : 'app'}>
      <Toolbar />
      <CircuitTabs />
      <div className="workspace">
        <Palette />
        <CanvasView />
        <Inspector />
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      </div>
      <StepsPanel />
      <ProblemsPanel />
      <TimingPanel />
      <StatusBar />
      <ToastHost />
      <CommandPalette />
      <LazyOverlays />
      <Tour />
      <DialogHost />
    </div>
  )
}
