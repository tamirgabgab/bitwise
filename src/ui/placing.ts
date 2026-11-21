import type { PointerEvent as ReactPointerEvent } from 'react'
import { SUB_TYPE, canvasRuntime, freeSpot, placementParams, useEditor } from '../editor/index.ts'
import type { Point } from '../editor/index.ts'
import { useChrome } from './chrome.ts'

/* Putting a part on the canvas, from the palette or from the command search. */

function added(type: string): void {
  // A named circuit has its own list in the palette; only built-in parts
  // are remembered as used last.
  if (type !== SUB_TYPE) useChrome.getState().noteUsed(type)
}

/** How long a finger rests on a palette item before it picks the part up, in ms. */
export const PICK_UP = 400

/** How far a finger may wander while it rests, in pixels. */
const PICK_UP_SLOP = 10

/** Set when a finger carried a part, so the click that may follow adds nothing. */
let carried = false

/**
 * Starts carrying a part from the palette. It follows the pointer as a ghost
 * and is placed where the button is released, if that is over the canvas.
 * For a named circuit, `type` is `SUB_TYPE` and `circuit` says which one.
 *
 * A finger first has to rest on the item for `PICK_UP`: before that, a swipe
 * scrolls the palette and a tap adds the part mid-canvas.
 */
export function beginPlacing(type: string, event: ReactPointerEvent, circuit?: string): void {
  if (event.button !== 0) return
  carried = false
  if (event.pointerType === 'touch') pickUp(type, event, circuit)
  else carry(type, circuit)
}

/** Whether a click on a palette item should add its part: not when a finger just carried it. */
export function tapAdds(): boolean {
  const add = !carried
  carried = false
  return add
}

function pickUp(type: string, event: ReactPointerEvent, circuit?: string): void {
  const item = event.currentTarget
  const finger = event.pointerId
  const start = { x: event.clientX, y: event.clientY }
  let holding = false
  // Once the part is picked up, the finger moves it and no longer scrolls the palette.
  const still = (e: Event) => {
    if (holding) e.preventDefault()
  }
  const noMenu = (e: Event) => e.preventDefault()
  const end = () => {
    window.clearTimeout(timer)
    window.removeEventListener('pointermove', wander)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('contextmenu', noMenu)
    item.removeEventListener('touchmove', still)
  }
  const wander = (e: PointerEvent) => {
    if (e.pointerId !== finger) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > PICK_UP_SLOP) end()
  }
  const timer = window.setTimeout(() => {
    window.removeEventListener('pointermove', wander)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    holding = true
    carried = true
    navigator.vibrate?.(10)
    carry(type, circuit, () => {
      holding = false
      window.removeEventListener('contextmenu', noMenu)
      item.removeEventListener('touchmove', still)
    })
  }, PICK_UP)
  window.addEventListener('pointermove', wander)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('contextmenu', noMenu)
  item.addEventListener('touchmove', still, { passive: false })
}

function carry(type: string, circuit: string | undefined, done?: () => void): void {
  const { setPlacing, addComponent } = useEditor.getState()
  const gridAt = (e: PointerEvent) => canvasRuntime.current?.clientToGrid(e.clientX, e.clientY) ?? null

  const move = (e: PointerEvent) => setPlacing({ type, circuit, pos: gridAt(e) })
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    setPlacing(null)
    done?.()
  }
  const up = (e: PointerEvent) => {
    const pos = gridAt(e)
    stop()
    if (!pos) return
    // Dropped onto a wire, the part goes into it.
    addComponent(type, pos, circuit, true)
    added(type)
  }

  setPlacing({ type, circuit, pos: null })
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}

/**
 * Drops a part at a grid point, or, when there is none, near the middle of
 * the canvas where it covers no other part, so taps add parts side by side.
 */
export function placeAt(type: string, pos: Point | null, circuit?: string): void {
  const state = useEditor.getState()
  const middle = canvasRuntime.current?.gridCenter() ?? { x: 0, y: 0 }
  const at = pos ?? freeSpot(state.doc, type, placementParams(type, state.settings.radix), middle)
  state.addComponent(type, at, circuit)
  added(type)
}

/** A plain click, or Enter on the keyboard, drops the part mid-canvas. */
export function placeAtCenter(type: string, circuit?: string): void {
  placeAt(type, null, circuit)
}
