import { useState } from 'react'
import { MAX_VERSION_NAME, deleteVersion, listVersions, parseProject } from '../io/index.ts'
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
  const [name, setName] = useState(() => `Version ${versions.filter((v) => !v.auto).length + 1}`)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  return (
    <div className="versions-box" data-revision={revision}>
      <header className="overlay-head">
        <h2 id="versions-title">
          {project ? `Versions of “${project.name}”` : 'Versions of this project'}
        </h2>
        <button
          type="button"
          className="tool"
          aria-label="Close the versions"
          title="Close the versions (Esc)"
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
            setName(`Version ${versions.filter((v) => !v.auto).length + 2}`)
            setRevision(revision + 1)
          }
        }}
      >
        <label htmlFor="version-name">Name</label>
        <input
          id="version-name"
          value={name}
          maxLength={MAX_VERSION_NAME}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button button-main">
          Save a version
        </button>
      </form>
      <p className="versions-note">
        Kept in this browser, not in the project file. A version is also kept each time the project
        is opened, and before you go back to an older one.
      </p>
      {versions.length === 0 ? (
        <p className="versions-note">No versions yet.</p>
      ) : (
        <ol className="versions-list">
          {versions.map((version) => (
            <li key={version.id} className="version">
              <Thumbnail
                cacheKey={`version:${version.id}`}
                data={() => parseProject(version.text)}
              />
              {deleting === version.id ? (
                <div className="version-confirm" role="group" aria-label={`Delete ${version.name}`}>
                  <p>Delete the version “{version.name}”? It cannot be brought back.</p>
                  <button type="button" className="button" autoFocus onClick={() => setDeleting(null)}>
                    Keep it
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
                    Delete version
                  </button>
                </div>
              ) : (
                <>
                  <span className="version-text">
                    <span className="version-name">{version.name}</span>
                    <span className="version-meta">
                      {version.auto ? 'Kept on its own, ' : ''}
                      {savedWhen(version.saved, now)}
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
                    Go back to this
                  </button>
                  <button
                    type="button"
                    className="tool"
                    aria-label={`Delete the version ${version.name}`}
                    title="Delete"
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
