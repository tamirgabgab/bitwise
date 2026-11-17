import { useEffect, useRef, useState } from 'react'
import { MAX_PROJECT_NAME } from '../io/index.ts'
import type { StoredProject } from '../io/index.ts'
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
import { latestFirst, savedWhen } from './projectList.ts'

/** The name of a project, edited in place. Enter or leaving the field keeps it. */
function NameEditor({ project, onDone }: { project: StoredProject; onDone: () => void }) {
  const [name, setName] = useState(project.name)
  const finish = (keep: boolean): void => {
    if (keep && name.trim() && name.trim() !== project.name) renameProject(project.id, name)
    onDone()
  }
  return (
    <input
      className="project-name-input"
      aria-label="Project name"
      value={name}
      maxLength={MAX_PROJECT_NAME}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- it opens because the user asked to rename
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true)
        else if (event.key === 'Escape') {
          // Leaves the name as it was, and keeps the window open.
          event.preventDefault()
          event.stopPropagation()
          finish(false)
        }
      }}
    />
  )
}

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
      <header className="shortcuts-head">
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
                  <NameEditor project={project} onDone={() => setRenaming(null)} />
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
  const ref = useRef<HTMLDialogElement>(null)
  const close = useChrome.getState().closeOverlay

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog projects"
      aria-labelledby="projects-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      {open && <ProjectsBox close={close} />}
    </dialog>
  )
}
