import { useEditor, useSim } from '../editor/index.ts'

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
  const running = useSim((state) => state.running)
  const stable = useSim((state) => state.stable)
  const time = useSim((state) => state.time)
  const conflicts = useSim((state) => state.conflicts)

  let hint: string
  if (isPlacing) {
    hint = 'Release over the canvas to place the part.'
  } else if (selected > 0) {
    hint = `${selected} selected. Drag to move, R to rotate, Delete to remove.`
  } else if (parts === 0) {
    hint = 'Scroll to zoom. Hold Space and drag to pan.'
  } else if (hasInput && wires > 0) {
    hint = 'Click an input to change its value. Shift-click or right-click steps back.'
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
        <span>
          {state}, tick {time}
        </span>
        <span>
          {plural(parts, 'part')}, {plural(wires, 'wire')}
        </span>
      </span>
    </footer>
  )
}
