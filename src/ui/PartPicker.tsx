import { useState } from 'react'
import { useEditor } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon, SearchIcon } from './icons.tsx'
import { SymbolIcon } from './Palette.tsx'
import { matchRank, paletteSections, searchSections } from './paletteModel.ts'
import { partName } from './parts.ts'
import { placeAtCenter } from './placing.ts'
import { useModal } from './useModal.ts'

/**
 * Every part in one window, by its section, with a search on top. A tap on
 * a part adds it mid-canvas and closes the window. Made for a phone, where
 * the palette is a strip that shows a few parts at a time.
 */
export function PartPicker() {
  const open = useChrome((state) => state.overlay === 'parts')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)
  const radix = useEditor((state) => state.settings.radix)
  const preset = useEditor((state) => state.settings.preset)
  const sandbox = useEditor((state) => state.settings.sandbox)
  const [query, setQuery] = useState('')

  const all = paletteSections({ radix, preset, sandbox })
  const searching = query.trim() !== ''
  const sections = searchSections(all, query, radix).map((section) =>
    searching
      ? {
          ...section,
          types: [...section.types].sort((a, b) => matchRank(query, partName(a)) - matchRank(query, partName(b))),
        }
      : section,
  )
  const add = (type: string): void => {
    placeAtCenter(type)
    setQuery('')
    close()
  }

  return (
    <dialog {...modal} className="dialog part-picker" aria-labelledby="part-picker-title">
      {open && (
        <div>
          <header className="overlay-head">
            <h2 id="part-picker-title">{t('All parts')}</h2>
            <button
              type="button"
              className="tool"
              aria-label={t('Close all parts')}
              title={t('Close all parts (Esc)')}
              onClick={close}
            >
              <CloseIcon />
            </button>
          </header>
          <label className="palette-search part-picker-search">
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
                // Enter adds the part that answers the search best.
                if (event.code === 'Enter' && searching && sections.length > 0) add(sections[0].types[0])
              }}
            />
          </label>
          <div className="part-picker-list">
            {sections.length === 0 && (
              <p className="palette-note">
                {t('No part matches “{query}”. Try a name such as “counter” or “and”.', { query })}
              </p>
            )}
            {sections.map((section) => (
              <section key={section.id}>
                <h3>{t(section.title)}</h3>
                <div className="part-picker-grid">
                  {section.types.map((type) => (
                    <button key={type} type="button" className="part" onClick={() => add(type)}>
                      <SymbolIcon type={type} />
                      {partName(type)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </dialog>
  )
}
