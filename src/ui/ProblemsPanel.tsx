import { canvasRuntime, centerOn, currentProblems, useEditor, useSim } from '../editor/index.ts'
import type { Problem } from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon } from './icons.tsx'
import { problemName } from './parts.ts'

const KIND_NAMES: Readonly<Record<Problem['kind'], string>> = {
  conflict: 'Conflict',
  mixed: 'Widths',
  floating: 'Floating',
  undriven: 'Floating',
  loop: 'Loop',
  unused: 'Unused',
}

/** Selects what a problem is about and brings it to the middle of the canvas. */
function show(problem: Problem): void {
  const state = useEditor.getState()
  state.setSelection(problem.ids)
  const size = canvasRuntime.current?.size()
  if (size) state.setView(centerOn(state.view, problem.at, size.width, size.height))
}

/**
 * The problems of the open circuit, in a strip under the canvas: inputs
 * left floating, wires in conflict, parts that drive nothing, loops with
 * no memory and widths that do not match. Picking one shows it.
 */
export function ProblemsPanel() {
  const open = useChrome((state) => state.problemsOpen)
  const doc = useEditor((state) => state.doc)
  // Conflicts come and go as the circuit runs.
  useSim((state) => state.revision)
  if (!open) return null
  const problems = currentProblems(doc, problemName)
  const close = (): void => useChrome.getState().setProblemsOpen(false)

  return (
    <section className="problems" aria-label="Problems">
      <header className="problems-head">
        <h2>Problems</h2>
        <span className="problems-count">
          {problems.length === 0 ? 'None found' : `${problems.length} found`}
        </span>
        <button
          type="button"
          className="tool"
          aria-label="Close the problems"
          title="Close the problems"
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>
      {problems.length === 0 ? (
        <p className="problems-empty">
          Every input is connected, no wire is in conflict and nothing is left over.
        </p>
      ) : (
        <ul className="problems-list">
          {problems.map((problem, index) => (
            <li key={`${problem.kind}:${problem.ids.join(',')}:${index}`}>
              <button type="button" className="problems-row" onClick={() => show(problem)}>
                <span className="problems-kind">{KIND_NAMES[problem.kind]}</span>
                <span>{problem.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
