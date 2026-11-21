import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  SUB_TYPE,
  canPlace,
  interfaceOf,
  readCanvasTheme,
  renderSymbolIcon,
  useEditor,
} from '../editor/index.ts'
import { useChrome } from './chrome.ts'
import { GateTable } from './GateTable.tsx'
import { ChevronIcon, ChipIcon, SearchIcon } from './icons.tsx'
import { matchesQuery, paletteSections, recentIn, searchSections } from './paletteModel.ts'
import { msg, t } from '../i18n/index.ts'
import { hasGateTable, inputCount, outputCount, partHint, partName } from './parts.ts'
import { beginPlacing, placeAtCenter, tapAdds } from './placing.ts'
import { useResolvedTheme } from './useResolvedTheme.ts'

/** The gate whose table is on show, and where its button is. */
interface TableTip {
  readonly type: string
  readonly top: number
  readonly right: number
}

const ICON_WIDTH = 64
const ICON_HEIGHT = 40

function SymbolIcon({ type }: { type: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useResolvedTheme()
  const gates = useEditor((state) => state.gateStyle)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = ICON_WIDTH * ratio
    canvas.height = ICON_HEIGHT * ratio
    renderSymbolIcon(ctx, ICON_WIDTH, ICON_HEIGHT, ratio, readCanvasTheme(canvas), type, gates)
  }, [type, theme, gates])

  return <canvas ref={ref} aria-hidden="true" />
}

/**
 * A translated sentence with parts of the page, such as buttons, in its
 * places: `{search}` in the text is where `nodes.search` goes.
 */
function withNodes(text: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode {
  return text.split(/\{(\w+)\}/).map((piece, index) =>
    index % 2 === 0 ? piece : <Fragment key={piece}>{Object.hasOwn(nodes, piece) ? nodes[piece] : `{${piece}}`}</Fragment>,
  )
}

/** The other circuits of the project, each ready to be used as a part. */
function CircuitParts({ query }: { query: string }) {
  const circuits = useEditor((state) => state.circuits)
  const order = useEditor((state) => state.order)
  const active = useEditor((state) => state.active)
  const folded = useChrome((state) => state.collapsed.includes('circuits'))
  const searching = query.trim() !== ''
  const others = order.filter((id) => id !== active && matchesQuery(query, circuits[id].name))

  // A search that finds no circuit says nothing about circuits at all.
  if (searching && others.length === 0) return null

  return (
    <section>
      <h2>
        {searching ? (
          t('Circuits')
        ) : (
          <button
            type="button"
            className="palette-head"
            aria-expanded={!folded}
            aria-controls="palette-circuits"
            onClick={() => useChrome.getState().toggleSection('circuits')}
          >
            <ChevronIcon />
            <span className="palette-title">{t('Circuits')}</span>
            <span className="palette-count">{others.length}</span>
          </button>
        )}
      </h2>
      {folded && !searching ? null : others.length === 0 ? (
        <p className="palette-note">
          {t('Circuits you add show up here as parts you can use.')}{' '}
          <button type="button" className="link" onClick={() => useEditor.getState().addCircuit()}>
            {t('Add a circuit')}
          </button>
        </p>
      ) : (
        <div id="palette-circuits" className="palette-list">
          {others.map((id) => {
            const circuit = circuits[id]
            const pins = interfaceOf(circuit.doc)
            const allowed = canPlace(circuits, active, id)
            const shape = t('{inputs}, {outputs}', {
              inputs: inputCount(pins.inputs.length),
              outputs: outputCount(pins.outputs.length),
            })
            return (
              <button
                key={id}
                type="button"
                className={allowed ? 'part part-circuit' : 'part part-circuit part-off'}
                // Not `disabled`, so the reason can still be read and focused.
                aria-disabled={!allowed}
                title={
                  allowed
                    ? t('{name}: {shape}. Drag onto the canvas, or click.', { name: circuit.name, shape })
                    : t('{name} has {open} inside it, so it cannot go in here.', {
                        name: circuit.name,
                        open: circuits[active].name,
                      })
                }
                onPointerDown={(event) => {
                  if (allowed) beginPlacing(SUB_TYPE, event, id)
                }}
                onClick={() => {
                  if (allowed && tapAdds()) placeAtCenter(SUB_TYPE, id)
                }}
              >
                <ChipIcon />
                <span className="part-circuit-name">{circuit.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface PartButtonProps {
  type: string
  radix: number
  onShowTable(type: string, button: HTMLElement): void
  onHideTable(): void
}

function PartButton({ type, radix, onShowTable, onHideTable }: PartButtonProps) {
  return (
    <button
      type="button"
      className="part"
      title={t('{name}: {shape}. Drag onto the canvas, or click.', { name: partName(type), shape: partHint(type, radix) })}
      onPointerDown={(event) => {
        onHideTable()
        beginPlacing(type, event)
      }}
      onClick={() => {
        if (tapAdds()) placeAtCenter(type)
      }}
      onPointerEnter={(event) => onShowTable(type, event.currentTarget)}
      onPointerLeave={onHideTable}
      onFocus={(event) => onShowTable(type, event.currentTarget)}
      onBlur={onHideTable}
    >
      <SymbolIcon type={type} />
      {partName(type)}
    </button>
  )
}

export function Palette() {
  const radix = useEditor((state) => state.settings.radix)
  const preset = useEditor((state) => state.settings.preset)
  const sandbox = useEditor((state) => state.settings.sandbox)
  const collapsed = useChrome((state) => state.collapsed)
  const recent = useChrome((state) => state.recent)
  const [query, setQuery] = useState('')
  const [tip, setTip] = useState<TableTip | null>(null)

  const searching = query.trim() !== ''
  const all = paletteSections({ radix, preset, sandbox })
  const lately = recentIn(recent, all)
  const sections = searching
    ? searchSections(all, query, radix)
    : [...(lately.length > 0 ? [{ id: 'recent', title: msg('Used lately'), types: lately }] : []), ...all]

  const showTable = (type: string, button: HTMLElement): void => {
    if (!hasGateTable(type)) return
    const rect = button.getBoundingClientRect()
    setTip({ type, top: rect.top, right: rect.right })
  }
  const hideTable = (): void => setTip(null)

  return (
    <nav className="palette" aria-label={t('Parts')}>
      <label className="palette-search">
        <SearchIcon />
        <span className="visually-hidden">{t('Search parts')}</span>
        <input
          type="search"
          placeholder={t('Search parts')}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.code === 'Escape' && query !== '') {
              setQuery('')
              event.stopPropagation()
            } else if (event.code === 'Enter' && searching && sections.length > 0) {
              // Enter adds the first part the search found.
              placeAtCenter(sections[0].types[0])
            }
          }}
        />
      </label>
      {sections.map((section) => {
        const folded = !searching && collapsed.includes(section.id)
        return (
          <section key={section.id}>
            <h2>
              {searching ? (
                t(section.title)
              ) : (
                <button
                  type="button"
                  className="palette-head"
                  aria-expanded={!folded}
                  aria-controls={`palette-${section.id}`}
                  onClick={() => useChrome.getState().toggleSection(section.id)}
                >
                  <ChevronIcon />
                  <span className="palette-title">{t(section.title)}</span>
                  <span className="palette-count">{section.types.length}</span>
                </button>
              )}
            </h2>
            <div id={`palette-${section.id}`} className="palette-grid" hidden={folded}>
              {section.types.map((type) => (
                <PartButton
                  key={type}
                  type={type}
                  radix={radix}
                  onShowTable={showTable}
                  onHideTable={hideTable}
                />
              ))}
            </div>
          </section>
        )
      })}
      <CircuitParts query={query} />
      {searching && sections.length === 0 && (
        <p className="palette-note palette-none">
          {t('No built-in part matches “{query}”.', { query: query.trim() })}{' '}
          {withNodes(t('{search} or {clear}.'), {
            search: (
              <button
                type="button"
                className="link"
                onClick={() => useChrome.getState().openCommands(query.trim())}
              >
                {t('Search all actions')}
              </button>
            ),
            clear: (
              <button type="button" className="link" onClick={() => setQuery('')}>
                {t('clear the search')}
              </button>
            ),
          })}
        </p>
      )}
      {tip && <GateTable type={tip.type} anchor={tip} />}
    </nav>
  )
}
