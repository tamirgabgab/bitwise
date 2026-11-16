import { CanvasView } from './CanvasView.tsx'
import { Palette } from './Palette.tsx'
import { StatusBar } from './StatusBar.tsx'
import { Toolbar } from './Toolbar.tsx'
import './App.css'

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <Palette />
        <CanvasView />
      </div>
      <StatusBar />
    </div>
  )
}
