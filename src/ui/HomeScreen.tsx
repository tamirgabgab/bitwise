import { useState } from 'react'
import { EXAMPLES } from '../editor/index.ts'
import { MAX_PROJECT_NAME, parseProject, readLocal } from '../io/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { BrandMark, CloseIcon, CopyIcon, DeleteIcon, NewIcon, OpenIcon, RenameIcon } from './icons.tsx'
import {
  deleteProject,
  duplicateProject,
  openExample,
  openProjectFile,
  renameProject,
  startNewProject,
  switchProject,
  useStorage,
} from './persistence.ts'
import { NameInput } from './NameInput.tsx'
import { latestFirst, savedWhen } from './projectList.ts'
import { Thumbnail } from './Thumbnail.tsx'
import { useModal } from './useModal.ts'

/** The text of a project the browser keeps, read as a project, or null. */
function storedProject(id: string) {
  return () => {
    const text = readLocal(id)
    return text === null ? null : parseProject(text)
  }
}

/** What the home screen shows. It lives only while the screen is open. */
function HomeBox({ close }: { close: () => void }) {
  const library = useStorage((state) => state.library)
  const ok = useStorage((state) => state.ok)
  const [renaming, setRenaming] = useState<string | null>(null)
  // The project whose delete waits for a yes, asked in its own card so no
  // second window opens over this one.
  const [deleting, setDeleting] = useState<string | null>(null)
  // Times are told from when the screen opened.
  const [now] = useState(() => Date.now())
  const then = (action: () => Promise<unknown>) => (): void => {
    close()
    void action()
  }
  const projects = latestFirst(library.projects)

  return (
    <div className="home-page">
      <header className="home-head">
        <h1 id="home-title">
          <span className="wordmark">
            <BrandMark />
            Bitwise
          </span>
        </h1>
        <div className="home-actions">
          <button type="button" className="button button-main" onClick={then(startNewProject)}>
            <NewIcon />
            {t('Start a new project')}
          </button>
          <button type="button" className="button" onClick={then(openProjectFile)}>
            <OpenIcon />
            {t('Open a project file')}
          </button>
        </div>
        <button
          type="button"
          className="tool home-close"
          aria-label={t('Back to the canvas')}
          title={t('Back to the canvas (Esc)')}
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>

      <section aria-labelledby="home-projects">
        <h2 id="home-projects">
          {t('Projects in this browser')} <span className="home-count">{projects.length}</span>
        </h2>
        {projects.length === 0 ? (
          <p className="home-note">
            {t('Nothing is kept yet. The project you have open is added here as soon as you change it.')}
          </p>
        ) : (
          <ul className="home-grid">
            {projects.map((project) => {
              const isOpen = project.id === library.open
              return (
                <li key={project.id} className={isOpen ? 'home-card is-open' : 'home-card'}>
                  <button
                    type="button"
                    className="home-open"
                    aria-current={isOpen ? 'true' : undefined}
                    onClick={() => {
                      // Closed first, so a failure message never opens over this screen.
                      close()
                      if (!isOpen) void switchProject(project.id)
                    }}
                  >
                    <Thumbnail cacheKey={`${project.id}:${project.saved}`} data={storedProject(project.id)} />
                    {renaming !== project.id && (
                      <>
                        <span className="home-name">{project.name}</span>
                        <span className="home-meta">
                          {isOpen ? t('Open now') : t('Saved {when}', { when: savedWhen(project.saved, now) })}
                        </span>
                      </>
                    )}
                  </button>
                  {renaming === project.id && (
                    <NameInput
                      name={project.name}
                      label={t('Project name')}
                      maxLength={MAX_PROJECT_NAME}
                      className="home-name-input"
                      onDone={(name) => {
                        setRenaming(null)
                        if (name?.trim() && name.trim() !== project.name) renameProject(project.id, name)
                      }}
                    />
                  )}
                  {deleting === project.id ? (
                    <div className="home-confirm" role="group" aria-label={t('Delete {name}', { name: project.name })}>
                      <p>{t('Delete “{name}”? It cannot be brought back.', { name: project.name })}</p>
                      <button type="button" className="button" autoFocus onClick={() => setDeleting(null)}>
                        {t('Keep it')}
                      </button>
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => {
                          setDeleting(null)
                          void deleteProject(project.id)
                        }}
                      >
                        {t('Delete project')}
                      </button>
                    </div>
                  ) : (
                    <div className="home-tools">
                      <button
                        type="button"
                        className="tool"
                        aria-label={t('Rename {name}', { name: project.name })}
                        title={t('Rename')}
                        onClick={() => setRenaming(project.id)}
                      >
                        <RenameIcon />
                      </button>
                      <button
                        type="button"
                        className="tool"
                        aria-label={t('Make a copy of {name}', { name: project.name })}
                        title={t('Make a copy')}
                        onClick={() => duplicateProject(project.id)}
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className="tool"
                        aria-label={t('Delete {name}', { name: project.name })}
                        title={t('Delete')}
                        onClick={() => setDeleting(project.id)}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!ok && (
          <p className="home-note home-warn">
            {t('This browser is not keeping your projects right now. Save to a file to keep your work.')}
          </p>
        )}
      </section>

      <section aria-labelledby="home-examples">
        <h2 id="home-examples">
          {t('Examples')} <span className="home-count">{EXAMPLES.length}</span>
        </h2>
        <ul className="home-grid">
          {EXAMPLES.map((example) => (
            <li key={example.id} className="home-card">
              <button type="button" className="home-open" onClick={then(() => openExample(example))}>
                <Thumbnail cacheKey={`example:${example.id}`} data={example.build} />
                <span className="home-name">{t(example.name)}</span>
                <span className="home-meta">{t(example.summary)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * The home screen: the projects the browser keeps and the examples, each
 * with a picture. It opens when the app starts, and from the File menu.
 */
export function HomeScreen() {
  const open = useChrome((state) => state.overlay === 'home')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)

  return (
    <dialog {...modal} className="dialog home" aria-labelledby="home-title">
      {open && <HomeBox close={close} />}
    </dialog>
  )
}
