import { useState } from 'react'
import { MAX_VERSION_NAME, deleteVersion, listVersions, parseProject } from '../io/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon, DeleteIcon } from './icons.tsx'
import { goBackTo, saveVersion, useStorage } from './persistence.ts'
import { savedWhen } from './projectList.ts'
import { Thumbnail } from './Thumbnail.tsx'
import { useModal } from './useModal.ts'

/** What the window shows. It lives only while the window is open. */
function VersionsBox({ close }: { close: () => void }) {
  const library = useStorage((state) => state.library)
  const project = library.projects.find((item) => item.id === library.open)
  // Bumped after each change, so the list is read again from storage.
  const [revision, setRevision] = useState(0)
  const versions = project ? listVersions(project.id) : []
  const [name, setName] = useState(() =>
    t('Version {number}', { number: versions.filter((v) => !v.auto).length + 1 }),
  )
  const [deleting, setDeleting] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  return (
    <div className="versions-box" data-revision={revision}>
      <header className="overlay-head">
        <h2 id="versions-title">
          {project
            ? t('Versions of “{name}”', { name: project.name })
            : t('Versions of this project')}
        </h2>
        <button
          type="button"
          className="tool"
          aria-label={t('Close the versions')}
          title={t('Close the versions (Esc)')}
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>
      <form
        className="versions-save"
        onSubmit={(event) => {
          event.preventDefault()
          if (saveVersion(name)) {
            setName(t('Version {number}', { number: versions.filter((v) => !v.auto).length + 2 }))
            setRevision(revision + 1)
          }
        }}
      >
        <label htmlFor="version-name">{t('Name')}</label>
        <input
          id="version-name"
          value={name}
          maxLength={MAX_VERSION_NAME}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button button-main">
          {t('Save a version')}
        </button>
      </form>
      <p className="versions-note">
        {t(
          'Kept in this browser, not in the project file. A version is also kept each time the project is opened, and before you go back to an older one.',
        )}
      </p>
      {versions.length === 0 ? (
        <p className="versions-note">{t('No versions yet.')}</p>
      ) : (
        <ol className="versions-list">
          {versions.map((version) => (
            <li key={version.id} className="version">
              <Thumbnail
                cacheKey={`version:${version.id}`}
                data={() => parseProject(version.text)}
              />
              {deleting === version.id ? (
                <div className="version-confirm" role="group" aria-label={t('Delete {name}', { name: version.name })}>
                  <p>{t('Delete the version “{name}”? It cannot be brought back.', { name: version.name })}</p>
                  <button type="button" className="button" autoFocus onClick={() => setDeleting(null)}>
                    {t('Keep it')}
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => {
                      setDeleting(null)
                      if (project) deleteVersion(project.id, version.id)
                      setRevision(revision + 1)
                    }}
                  >
                    {t('Delete version')}
                  </button>
                </div>
              ) : (
                <>
                  <span className="version-text">
                    <span className="version-name">{version.name}</span>
                    <span className="version-meta">
                      {version.auto
                        ? t('Kept on its own, {when}', { when: savedWhen(version.saved, now) })
                        : savedWhen(version.saved, now)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      close()
                      goBackTo(version.id)
                    }}
                  >
                    {t('Go back to this')}
                  </button>
                  <button
                    type="button"
                    className="tool"
                    aria-label={t('Delete the version {name}', { name: version.name })}
                    title={t('Delete')}
                    onClick={() => setDeleting(version.id)}
                  >
                    <DeleteIcon />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** The versions of the open project, in a window over the app. */
export function VersionsDialog() {
  const open = useChrome((state) => state.overlay === 'versions')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)

  return (
    <dialog {...modal} className="dialog versions" aria-labelledby="versions-title">
      {open && <VersionsBox close={close} />}
    </dialog>
  )
}
