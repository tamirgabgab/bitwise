import { SUB_TYPE, useEditor, useSim, valueText } from '../editor/index.ts'
import { useStorage } from './persistence.ts'

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function StatusBar() {
  const parts = useEditor((state) => Object.keys(state.doc.components).length)
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
  const wireSelected = useEditor((state) => {
    if (state.selection.size !== 1) return false
    const [id] = state.selection
    return id in state.doc.wires || id in state.doc.junctions
  })

  let hint: string
  if (isPlacing) {
    hint = 'Release over the canvas to place the part.'
  } else if (wireSelected) {
    hint = 'The panel shows what this wire carries. It can also pause the run for you.'
  } else if (circuitSelected) {
    hint = 'Double-click the part to open its circuit. Drag to move, R to rotate.'
  } else if (selected > 0) {
    hint = `${selected} selected. Drag to move, R to rotate, Delete to remove.`
  } else if (parts === 0) {
    hint = 'Scroll to zoom. Hold Space and drag to pan.'
  } else if (hasInput && wires > 0) {
    hint = 'Click or scroll over an input to step its value, or type a digit. Shift-click steps back.'
  } else {
    hint = 'Drag from a pin to another pin or onto a wire to connect them.'
  }

  let state: string
  if (!running) state = stable ? 'Paused' : 'Paused, changes waiting'
  else state = stable ? 'Settled' : 'Running'

  return (
    <footer className="statusbar">
      <span className="hint" role="status">
        {hint}
      </span>
      <span className="counts">
        {conflicts > 0 && (
          <span className="conflict" title="Two outputs drive the same wire to different values">
            {plural(conflicts, 'wire')} in conflict
          </span>
        )}
        {breakHit && (
          <span className="stopped" title="A breakpoint on a wire paused the run">
            Paused at a breakpoint:{' '}
            {breakHit.conflict
              ? 'the wire is in conflict'
              : `the wire is ${valueText(breakHit.digit, settings)}`}
          </span>
        )}
        {oscillating && (
          <span
            className="conflict"
            title="This circuit has no clock, yet it keeps changing: a loop in it feeds itself and never comes to rest"
          >
            Never settles
          </span>
        )}
        <span>
          {state}, tick {time}
        </span>
        <span>
          {plural(parts, 'part')}, {plural(wires, 'wire')}
        </span>
        {gates > 0 &&
          (depth === undefined ? (
            <span
              className="cost"
              title="Parts that do work, counting the ones inside named circuits. The circuit has a loop, so it has no longest path"
            >
              {plural(gates, 'gate')}, has a loop
            </span>
          ) : (
            <button
              type="button"
              className="cost cost-button"
              aria-pressed={criticalShown}
              title={
                criticalShown
                  ? 'Stop marking the longest path on the canvas'
                  : 'Parts that do work, counting the ones inside named circuits, and the longest path through them in ticks. Click to mark that path on the canvas'
              }
              onClick={() => useSim.getState().setCriticalShown(!criticalShown)}
            >
              {plural(gates, 'gate')}, depth {depth}
            </button>
          ))}
        {/* Saving is the quiet default; only its failure is worth a word. */}
        {!stored && (
          <span
            className="unsaved"
            title="The browser's storage is full or switched off. Save the project as a file to keep it"
          >
            Not saved in this browser
          </span>
        )}
      </span>
    </footer>
  )
}
