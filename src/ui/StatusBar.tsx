import { SUB_TYPE, drawingProblems, isAnnotation, useEditor, useSim, valueText } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { problemName } from './parts.ts'
import { useStorage } from './persistence.ts'

/** How many parts, in words. */
function partCount(count: number): string {
  return count === 1 ? t('1 part') : t('{count} parts', { count })
}

/** How many wires, in words. */
function wireCount(count: number): string {
  return count === 1 ? t('1 wire') : t('{count} wires', { count })
}

export function StatusBar() {
  // Writing and frames are drawing, not parts of the circuit.
  const parts = useEditor(
    (state) => Object.values(state.doc.components).filter((part) => !isAnnotation(part.type)).length,
  )
  const wires = useEditor((state) => Object.keys(state.doc.wires).length)
  const selected = useEditor((state) => state.selection.size)
  const isPlacing = useEditor((state) => state.placing !== null)
  const hasInput = useEditor((state) =>
    Object.values(state.doc.components).some((component) => component.type === 'input'),
  )
  const circuitSelected = useEditor((state) => {
    if (state.selection.size !== 1) return false
    const [id] = state.selection
    return state.doc.components[id]?.type === SUB_TYPE
  })
  const stored = useStorage((state) => state.ok)
  const running = useSim((state) => state.running)
  const stable = useSim((state) => state.stable)
  const time = useSim((state) => state.time)
  const conflicts = useSim((state) => state.conflicts)
  const oscillating = useSim((state) => state.oscillating)
  const gates = useSim((state) => state.gates)
  const depth = useSim((state) => state.depth)
  const criticalShown = useSim((state) => state.criticalShown)
  const breakHit = useSim((state) => state.breakHit)
  const settings = useEditor((state) => state.settings)
  const problems = useEditor((state) => drawingProblems(state.doc, problemName).length)
  const problemsOpen = useChrome((state) => state.problemsOpen)
  const wireSelected = useEditor((state) => {
    if (state.selection.size !== 1) return false
    const [id] = state.selection
    return id in state.doc.wires || id in state.doc.junctions
  })

  let hint: string
  if (isPlacing) {
    hint = t('Release over the canvas to place the part.')
  } else if (wireSelected) {
    hint = t('The panel shows what this wire carries. It can also pause the run for you.')
  } else if (circuitSelected) {
    hint = t('Double-click the part to open its circuit. Drag to move, R to rotate.')
  } else if (selected > 0) {
    hint =
      selected === 1
        ? t('1 selected. Drag to move, R to rotate, Delete to remove.')
        : t('{count} selected. Drag to move, R to rotate, Delete to remove.', { count: selected })
  } else if (parts === 0) {
    hint = t('Scroll to zoom. Hold Space and drag to pan.')
  } else if (hasInput && wires > 0) {
    hint = t(
      'Click or scroll over an input to step its value, or type a digit. Shift-click steps back.',
    )
  } else {
    hint = t('Drag from a pin to another pin or onto a wire to connect them.')
  }

  let state: string
  if (!running) state = stable ? t('Paused') : t('Paused, changes waiting')
  else state = stable ? t('Settled') : t('Running')

  return (
    <footer className="statusbar">
      <span className="hint" role="status">
        {hint}
      </span>
      <span className="counts">
        {(problems > 0 || problemsOpen) && (
          <button
            type="button"
            className="status-button"
            aria-pressed={problemsOpen}
            title={problemsOpen ? t('Hide the problems') : t('Show the problems of this circuit')}
            onClick={() => useChrome.getState().setProblemsOpen(!problemsOpen)}
          >
            {problems === 0
              ? t('No problems')
              : problems === 1
                ? t('1 problem')
                : t('{count} problems', { count: problems })}
          </button>
        )}
        {conflicts > 0 && (
          <span className="conflict" title={t('Two outputs drive the same wire to different values')}>
            {conflicts === 1
              ? t('1 wire in conflict')
              : t('{count} wires in conflict', { count: conflicts })}
          </span>
        )}
        {breakHit && (
          <span className="stopped" title={t('A breakpoint on a wire paused the run')}>
            {breakHit.conflict
              ? t('Paused at a breakpoint: the wire is in conflict')
              : t('Paused at a breakpoint: the wire is {value}', {
                  value: valueText(breakHit.digit, settings),
                })}
          </span>
        )}
        {oscillating && (
          <span
            className="conflict"
            title={t(
              'This circuit has no clock, yet it keeps changing: a loop in it feeds itself and never comes to rest',
            )}
          >
            {t('Never settles')}
          </span>
        )}
        <span>{t('{state}, tick {time}', { state, time })}</span>
        <span>
          {partCount(parts)}, {wireCount(wires)}
        </span>
        {gates > 0 &&
          (depth === undefined ? (
            <span
              className="cost"
              title={t(
                'Parts that do work, counting the ones inside named circuits. The circuit has a loop, so it has no longest path',
              )}
            >
              {gates === 1 ? t('1 gate, has a loop') : t('{count} gates, has a loop', { count: gates })}
            </span>
          ) : (
            <button
              type="button"
              className="cost cost-button"
              aria-pressed={criticalShown}
              title={
                criticalShown
                  ? t('Stop marking the longest path on the canvas')
                  : t(
                      'Parts that do work, counting the ones inside named circuits, and the longest path through them in ticks. Click to mark that path on the canvas',
                    )
              }
              onClick={() => useSim.getState().setCriticalShown(!criticalShown)}
            >
              {gates === 1
                ? t('1 gate, depth {depth}', { depth })
                : t('{count} gates, depth {depth}', { count: gates, depth })}
            </button>
          ))}
        {/* Saving is the quiet default; only its failure is worth a word. */}
        {!stored && (
          <span
            className="unsaved"
            title={t(
              "The browser's storage is full or switched off. Save the project as a file to keep it",
            )}
          >
            {t('Not saved in this browser')}
          </span>
        )}
      </span>
    </footer>
  )
}
