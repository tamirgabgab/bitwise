import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { MAX_CIRCUIT_NAME, useEditor, usersOf } from '../editor/index.ts'
import { ask } from './dialogs.ts'
import { CloseIcon, PlusIcon } from './icons.tsx'

/** "A", "A and B", "A, B and C". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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

interface NameFieldProps {
  name: string
  /** Called with the new name, or with null when the user gives up. */
  onDone(name: string | null): void
}

/** The name of a tab while it is being typed. */
function NameField({ name, onDone }: NameFieldProps) {
  const [draft, setDraft] = useState(name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.select()
  }, [])

  const finish = (value: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(value)
  }

  return (
    <input
      ref={ref}
      className="tab-input"
      aria-label="Circuit name"
      value={draft}
      maxLength={MAX_CIRCUIT_NAME}
      spellCheck={false}
      // As wide as the name, so the tab keeps its size while typing starts.
      style={{ width: `${Math.max(draft.length, 3) + 1}ch` }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(event) => {
        if (event.code === 'Enter' || event.code === 'NumpadEnter') finish(draft)
        else if (event.code === 'Escape') finish(null)
      }}
    />
  )
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
              <NameField
                name={name}
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
            {open && order.length > 1 && renaming !== id && (
              <button
                type="button"
                className="tab-close"
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
