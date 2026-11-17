import type { PointerEvent as ReactPointerEvent } from 'react'
import { SUB_TYPE, canvasRuntime, useEditor } from '../editor/index.ts'
import type { Point } from '../editor/index.ts'
import { useChrome } from './chrome.ts'

/* Putting a part on the canvas, from the palette or from the command search. */

function added(type: string): void {
  // A named circuit has its own list in the palette; only built-in parts
  // are remembered as used last.
  if (type !== SUB_TYPE) useChrome.getState().noteUsed(type)
}

/**
 * Starts carrying a part from the palette. It follows the pointer as a ghost
 * and is placed where the button is released, if that is over the canvas.
 * For a named circuit, `type` is `SUB_TYPE` and `circuit` says which one.
 */
export function beginPlacing(type: string, event: ReactPointerEvent, circuit?: string): void {
  if (event.button !== 0) return
  const { setPlacing, addComponent } = useEditor.getState()
  const gridAt = (e: PointerEvent) =>
    canvasRuntime.current?.clientToGrid(e.clientX, e.clientY) ?? null

  const move = (e: PointerEvent) => setPlacing({ type, circuit, pos: gridAt(e) })
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    setPlacing(null)
  }
  const up = (e: PointerEvent) => {
    const pos = gridAt(e)
    stop()
    if (!pos) return
    addComponent(type, pos, circuit)
    added(type)
  }

  setPlacing({ type, circuit, pos: null })
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}

/** Drops a part at a grid point, or mid-canvas when there is none. */
export function placeAt(type: string, pos: Point | null, circuit?: string): void {
  const at = pos ?? canvasRuntime.current?.gridCenter() ?? { x: 0, y: 0 }
  useEditor.getState().addComponent(type, at, circuit)
  added(type)
}

/** A plain click, or Enter on the keyboard, drops the part mid-canvas. */
export function placeAtCenter(type: string, circuit?: string): void {
  placeAt(type, null, circuit)
}
