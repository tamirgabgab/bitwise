import { useEffect, useRef, useState } from 'react'
import { fromProjectData, projectSvg, readCanvasTheme, useEditor } from '../editor/index.ts'
import type { ProjectData } from '../editor/index.ts'

/*
 * Small pictures of projects, for the home screen and the versions. Each is
 * an SVG of the circuit that was open, drawn through the same code as the
 * canvas, in the plain look of the page. Drawing one lays out every wire, so
 * they are made one at a time after the window shows, and kept.
 */

const pictures = new Map<string, string | null>()
/** At most this many pictures are kept; then the oldest are drawn again when needed. */
const KEPT = 120
let queue: Promise<void> = Promise.resolve()

function keyOf(key: string): string {
  const theme = readCanvasTheme(document.documentElement)
  return `${key}|${theme.background}|${useEditor.getState().gateStyle}`
}

function draw(data: () => ProjectData | null): string | null {
  try {
    const project = data()
    if (!project) return null
    const theme = readCanvasTheme(document.documentElement)
    const svg = projectSvg(fromProjectData(project), theme, useEditor.getState().gateStyle)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return null
  }
}

interface ThumbnailProps {
  /** Names the project and its state: a new key draws a new picture. */
  readonly cacheKey: string
  /** The project to draw, or null when it cannot be read. */
  readonly data: () => ProjectData | null
}

export function Thumbnail({ cacheKey, data }: ThumbnailProps) {
  const full = keyOf(cacheKey)
  // Drawn after the window shows, so the latest `data` is kept here for it.
  const source = useRef(data)
  useEffect(() => {
    source.current = data
  })
  const [, setDrawn] = useState(0)
  const known = pictures.has(full)

  useEffect(() => {
    if (pictures.has(full)) return
    let live = true
    queue = queue
      .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
      .then(() => {
        if (!live || pictures.has(full)) return
        const url = draw(source.current)
        if (pictures.size >= KEPT) pictures.delete(pictures.keys().next().value as string)
        pictures.set(full, url)
        setDrawn((count) => count + 1)
      })
    return () => {
      live = false
    }
  }, [full])

  const url = known ? (pictures.get(full) ?? null) : undefined
  return (
    <span className="thumb" aria-hidden="true">
      {url ? <img src={url} alt="" /> : url === null ? <span className="thumb-none">No picture</span> : null}
    </span>
  )
}
