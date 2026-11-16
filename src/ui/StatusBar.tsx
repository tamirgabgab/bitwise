import { useEditor } from '../editor/index.ts'

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function StatusBar() {
  const parts = useEditor((state) => Object.keys(state.doc.components).length)
  const wires = useEditor((state) => Object.keys(state.doc.wires).length)
  const selected = useEditor((state) => state.selection.size)
  const isPlacing = useEditor((state) => state.placing !== null)

  let hint: string
  if (isPlacing) {
    hint = 'Release over the canvas to place the part.'
  } else if (selected > 0) {
    hint = `${selected} selected. Drag to move, R to rotate, Delete to remove.`
  } else if (parts === 0) {
    hint = 'Scroll to zoom. Hold Space and drag to pan.'
  } else {
    hint = 'Drag from a pin to another pin or onto a wire to connect them.'
  }

  return (
    <footer className="statusbar">
      <span className="hint" role="status">
        {hint}
      </span>
      <span className="counts">
        {plural(parts, 'part')}, {plural(wires, 'wire')}
      </span>
    </footer>
  )
}
