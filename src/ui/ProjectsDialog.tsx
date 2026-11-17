import { useState } from 'react'
import { MAX_PROJECT_NAME } from '../io/index.ts'
import { useChrome } from './chrome.ts'
import { CloseIcon, CopyIcon, DeleteIcon, NewIcon, OpenIcon, RenameIcon } from './icons.tsx'
import {
  deleteProject,
  duplicateProject,
  openProjectFile,
  renameProject,
  startNewProject,
  switchProject,
  useStorage,
} from './persistence.ts'
import { NameInput } from './NameInput.tsx'
import { latestFirst, savedWhen } from './projectList.ts'
import { useModal } from './useModal.ts'

/** What the window shows. It lives only while the window is open. */
function ProjectsBox({ close }: { close: () => void }) {
  const library = useStorage((state) => state.library)
  const ok = useStorage((state) => state.ok)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Times are told from when the window opened.
  const [now] = useState(() => Date.now())
  const then = (action: () => Promise<unknown>) => (): void => {
    close()
    void action()
  }

  return (
    <div className="projects-box">
      <header className="overlay-head">
        <h2 id="projects-title">Projects in this browser</h2>
        <button
          type="button"
          className="tool"
          aria-label="Close the projects"
          title="Close the projects (Esc)"
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="projects-actions">
        <button type="button" className="button button-main" onClick={then(startNewProject)}>
          <NewIcon />
          New project
        </button>
        <button type="button" className="button" onClick={then(openProjectFile)}>
          <OpenIcon />
          Open a project file
        </button>
      </div>
      {library.projects.length === 0 ? (
        <p className="projects-note">
          Nothing is kept yet. The project you have open is added here as soon as you change it.
        </p>
      ) : (
        <ul className="projects-list">
          {latestFirst(library.projects).map((project) => {
            const isOpen = project.id === library.open
            return (
              <li key={project.id} className={isOpen ? 'project is-open' : 'project'}>
                {renaming === project.id ? (
                  <NameInput
                    name={project.name}
                    label="Project name"
                    maxLength={MAX_PROJECT_NAME}
                    className="project-name-input"
                    onDone={(name) => {
                      setRenaming(null)
                      if (name?.trim() && name.trim() !== project.name) renameProject(project.id, name)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="project-open"
                    aria-current={isOpen ? 'true' : undefined}
                    onClick={() => {
                      if (isOpen) close()
                      else void switchProject(project.id).then((done) => done && close())
                    }}
                  >
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      {isOpen ? 'Open now' : `Saved ${savedWhen(project.saved, now)}`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="tool"
                  aria-label={`Rename ${project.name}`}
                  title="Rename"
                  onClick={() => setRenaming(project.id)}
                >
                  <RenameIcon />
                </button>
                <button
                  type="button"
                  className="tool"
                  aria-label={`Make a copy of ${project.name}`}
                  title="Make a copy"
                  onClick={() => duplicateProject(project.id)}
                >
                  <CopyIcon />
                </button>
                <button
                  type="button"
                  className="tool"
                  aria-label={`Delete ${project.name}`}
                  title="Delete"
                  onClick={() => void deleteProject(project.id)}
                >
                  <DeleteIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!ok && (
        <p className="projects-note projects-warn">
          This browser is not keeping your projects right now. Save to a file to keep your work.
        </p>
      )}
    </div>
  )
}

/** The projects the browser keeps, in a window over the app. */
export function ProjectsDialog() {
  const open = useChrome((state) => state.overlay === 'projects')
  const close = useChrome.getState().closeOverlay
  const modal = useModal(open, close)

  return (
    <dialog {...modal} className="dialog projects" aria-labelledby="projects-title">
      {open && <ProjectsBox close={close} />}
    </dialog>
  )
}
