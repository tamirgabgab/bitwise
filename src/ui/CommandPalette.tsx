import { useEffect, useMemo, useRef, useState } from 'react'
import type { Point } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { listCommands, searchCommands } from './commands.ts'
import type { Command } from './commands.ts'
import { SearchIcon } from './icons.tsx'
import { Keys } from './Keys.tsx'
import { placeAt } from './placing.ts'
import { useModal } from './useModal.ts'

/** The most rows the list shows for one search. */
const MAX_ROWS = 60

/**
 * The command search: type a few letters of anything the app can do, a part,
 * a circuit or an example, and press Enter.
 */
export function CommandPalette() {
  const open = useChrome((state) => state.overlay === 'commands')
  const seed = useChrome((state) => state.commandQuery)
  const quickAdd = useChrome((state) => state.quickAdd)
  const modal = useModal(open, useChrome.getState().closeOverlay)

  return (
    <dialog
      {...modal}
      className="dialog commands"
      aria-label={quickAdd ? t('Add a part') : t('Search actions')}
    >
      {open && <CommandSearch seed={seed} quickAdd={quickAdd} />}
    </dialog>
  )
}

function CommandSearch({
  seed,
  quickAdd,
}: {
  seed: string
  quickAdd: { readonly at: Point | null } | null
}) {
  const [query, setQuery] = useState(seed)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // Read once: the list is as the app stood when the search opened.
  const all = useMemo(
    () => listCommands().filter((command) => !quickAdd || command.place),
    [quickAdd],
  )
  const found = useMemo(() => searchCommands(all, query).slice(0, MAX_ROWS), [all, query])
  const current = Math.min(active, Math.max(found.length - 1, 0))
  const prompt = quickAdd
    ? t('Search parts to add where the pointer is')
    : t('Search actions, parts, circuits and examples')

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current, query])

  const run = (command: Command | undefined): void => {
    if (!command || command.disabled) return
    // Closed first, so a command that opens another window is not undone.
    useChrome.getState().closeOverlay()
    if (quickAdd && command.place) placeAt(command.place.type, quickAdd.at, command.place.circuit)
    else command.run()
  }

  const move = (to: number): void => {
    if (found.length > 0) setActive((to + found.length) % found.length)
  }

  return (
    <div className="commands-box">
      <label className="commands-field">
        <SearchIcon />
        <span className="visually-hidden">{prompt}</span>
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
          placeholder={prompt}
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
      <div ref={listRef} id="command-list" className="commands-list" role="listbox" aria-label={t('Actions')}>
        {found.length === 0 && (
          <p className="commands-empty">
            {quickAdd
              ? t('No part matches “{query}”. Try a name such as “counter” or “and”.', {
                  query: query.trim(),
                })
              : t(
                  'Nothing matches “{query}”. Try the name of a part, such as “counter”, or an action, such as “save”.',
                  { query: query.trim() },
                )}{' '}
            <button
              type="button"
              className="link"
              onClick={(event) => {
                setQuery('')
                setActive(0)
                // Back to the field, where typing goes on.
                event.currentTarget.closest('.commands-box')?.querySelector('input')?.focus()
              }}
            >
              {t('Clear the search')}
            </button>
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
    </div>
  )
}
