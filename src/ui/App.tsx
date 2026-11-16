import { CORE_VERSION } from '../core/index.ts'
import { FILE_FORMAT_VERSION } from '../io/index.ts'
import './App.css'

/** Placeholder shell. The canvas editor replaces the main area in Phase 2. */
export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Cedar Logic</h1>
        <span className="app-meta">
          core {CORE_VERSION} · file format v{FILE_FORMAT_VERSION}
        </span>
      </header>
      <main className="app-main">
        <p>The circuit editor is not built yet.</p>
        <p className="app-hint">See docs/PLAN.md for the roadmap.</p>
      </main>
    </div>
  )
}
