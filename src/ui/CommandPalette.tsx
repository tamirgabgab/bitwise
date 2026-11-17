import { useEffect, useMemo, useRef, useState } from 'react'
import { useChrome } from './chrome.ts'
import { listCommands, searchCommands } from './commands.ts'
import type { Command } from './commands.ts'
import { SearchIcon } from './icons.tsx'
import { Keys } from './Keys.tsx'

/** The most rows the list shows for one search. */
const MAX_ROWS = 60

/**
 * The command search: type a few letters of anything the app can do, a part,
 * a circuit or an example, and press Enter.
 */
export function CommandPalette() {
  const open = useChrome((state) => state.overlay === 'commands')
  const seed = useChrome((state) => state.commandQuery)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dialog commands"
      aria-label="Search actions"
      onCancel={(event) => {
        event.preventDefault()
        useChrome.getState().closeOverlay()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) useChrome.getState().closeOverlay()
      }}
    >
      {open && <CommandSearch seed={seed} />}
    </dialog>
  )
}

function CommandSearch({ seed }: { seed: string }) {
  const [query, setQuery] = useState(seed)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // Read once: the list is as the app stood when the search opened.
  const all = useMemo(() => listCommands(), [])
  const found = useMemo(() => searchCommands(all, query).slice(0, MAX_ROWS), [all, query])
  const current = Math.min(active, Math.max(found.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current, query])

  const run = (command: Command | undefined): void => {
    if (!command || command.disabled) return
    // Closed first, so a command that opens another window is not undone.
    useChrome.getState().closeOverlay()
    command.run()
  }

  const move = (to: number): void => {
    if (found.length > 0) setActive((to + found.length) % found.length)
  }

  return (
    <div className="commands-box">
      <label className="commands-field">
        <SearchIcon />
        <span className="visually-hidden">Search actions, parts, circuits and examples</span>
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={found[current] ? `command-${found[current].id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search actions, parts, circuits and examples"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.code === 'ArrowDown') move(current + 1)
            else if (event.code === 'ArrowUp') move(current - 1)
            else if (event.code === 'Home' && query === '') move(0)
            else if (event.code === 'End' && query === '') move(found.length - 1)
            else if (event.code === 'Enter' || event.code === 'NumpadEnter') run(found[current])
            else return
            event.preventDefault()
          }}
        />
      </label>
      <div ref={listRef} id="command-list" className="commands-list" role="listbox" aria-label="Actions">
        {found.length === 0 && (
          <p className="commands-empty">
            Nothing matches “{query.trim()}”. Try the name of a part, such as “counter”, or an
            action, such as “save”.
          </p>
        )}
        {found.map((command, index) => {
          const heading = index === 0 || found[index - 1].group !== command.group
          return (
            <div key={command.id} role="presentation">
              {heading && (
                <div className="commands-group" role="presentation">
                  {command.group}
                </div>
              )}
              <div
                id={`command-${command.id}`}
                role="option"
                aria-selected={index === current}
                aria-disabled={command.disabled}
                className="command"
                onPointerMove={() => {
                  if (index !== current) setActive(index)
                }}
                onClick={() => run(command)}
              >
                <span className="command-text">
                  <span className="command-title">{command.title}</span>
                  {command.detail && <span className="command-detail">{command.detail}</span>}
                </span>
                {command.shortcut && <Keys combo={command.shortcut} />}
              </div>
            </div>
          )
        })}
      </div>
      <p className="commands-foot">
        <Keys combo="↑" /> <Keys combo="↓" /> to move, <Keys combo="Enter" /> to run,{' '}
        <Keys combo="Esc" /> to close
      </p>
    </div>
  )
}
