import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { MAX_CIRCUIT_NAME, useEditor, usersOf } from '../editor/index.ts'
import { ask } from './dialogs.ts'
import { CloseIcon, PlusIcon } from './icons.tsx'
import { NameInput } from './NameInput.tsx'

/** "A", "A and B", "A, B and C". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

let measure: CanvasRenderingContext2D | null | undefined

/**
 * How wide `text` is in the face of the tabs, in px, so the field that
 * renames a tab is as wide as the name it replaces.
 */
function tabTextWidth(text: string): number {
  measure ??= document.createElement('canvas').getContext('2d')
  const sample = document.querySelector('.tab-name, .tab-input')
  if (!measure || !sample) return text.length * 8
  measure.font = getComputedStyle(sample).font
  return Math.ceil(measure.measureText(text).width)
}

/** Deletes a circuit, after asking if anything would be lost with it. */
async function deleteCircuit(id: string): Promise<void> {
  const { circuits } = useEditor.getState()
  const circuit = circuits[id]
  const users = usersOf(circuits, id).map((user) => `“${circuits[user].name}”`)
  const hasParts = Object.keys(circuit.doc.components).length > 0
  if (hasParts || users.length > 0) {
    const used =
      users.length > 0 ? `\nIt is used in ${listOf(users)}. Those parts are removed with it.` : ''
    const agreed = await ask({
      title: `Delete “${circuit.name}”?`,
      body: `The circuit and everything drawn in it will be gone. This cannot be undone.${used}`,
      confirm: 'Delete circuit',
      cancel: 'Keep it',
      danger: true,
    })
    if (!agreed) return
  }
  useEditor.getState().removeCircuit(id)
}

/**
 * One tab for every circuit of the project. The open one can be renamed in
 * place and deleted; the button at the end adds a circuit.
 */
export function CircuitTabs() {
  const order = useEditor((state) => state.order)
  const circuits = useEditor((state) => state.circuits)
  const active = useEditor((state) => state.active)
  const [renaming, setRenaming] = useState<string | null>(null)
  const bar = useRef<HTMLElement>(null)
  const { selectCircuit, renameCircuit, addCircuit } = useEditor.getState()

  // The open tab stays in sight when there are more tabs than room.
  useEffect(() => {
    bar.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const focusTab = (id: string | undefined): void => {
    if (id === undefined) return
    bar.current?.querySelector<HTMLElement>(`[data-circuit="${id}"]`)?.focus()
  }

  const onKey = (event: ReactKeyboardEvent, id: string): void => {
    const index = order.indexOf(id)
    if (event.code === 'F2') {
      event.preventDefault()
      selectCircuit(id)
      setRenaming(id)
    } else if (event.code === 'ArrowRight') {
      focusTab(order[index + 1])
    } else if (event.code === 'ArrowLeft') {
      focusTab(order[index - 1])
    }
  }

  return (
    <nav ref={bar} className="tabs" aria-label="Circuits">
      {order.map((id) => {
        const { name } = circuits[id]
        const open = id === active
        return (
          <div key={id} className={open ? 'tab tab-open' : 'tab'}>
            {renaming === id ? (
              <NameInput
                name={name}
                label="Circuit name"
                maxLength={MAX_CIRCUIT_NAME}
                className="tab-input"
                // As wide as the name, so the tab keeps its size while typing starts.
                style={(draft) => ({ width: `${Math.max(tabTextWidth(draft), 24)}px` })}
                onDone={(next) => {
                  setRenaming(null)
                  if (next !== null) renameCircuit(id, next)
                  // Typing took the focus; give it back to the tab.
                  requestAnimationFrame(() => focusTab(id))
                }}
              />
            ) : (
              <button
                type="button"
                className="tab-name"
                data-circuit={id}
                aria-current={open ? 'page' : undefined}
                aria-keyshortcuts="F2"
                title={open ? `${name}. Double-click or press F2 to rename` : `Open ${name}`}
                onClick={() => selectCircuit(id)}
                onDoubleClick={() => setRenaming(id)}
                onKeyDown={(event) => onKey(event, id)}
              >
                {name}
              </button>
            )}
            {/* Kept, hidden, while renaming, so the tabs after it do not move. */}
            {open && order.length > 1 && (
              <button
                type="button"
                className="tab-close"
                style={renaming === id ? { visibility: 'hidden' } : undefined}
                tabIndex={renaming === id ? -1 : undefined}
                aria-label={`Delete circuit ${name}`}
                title={`Delete ${name}`}
                onClick={() => void deleteCircuit(id)}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="tool tab-add"
        aria-label="Add a circuit"
        title="Add a circuit"
        onClick={() => setRenaming(addCircuit())}
      >
        <PlusIcon />
      </button>
    </nav>
  )
}
