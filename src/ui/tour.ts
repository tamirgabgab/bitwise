/* The first-visit tour: what it says, and where its card goes on screen. */

export interface TourStep {
  /** A CSS selector for the piece of the app this step is about. */
  readonly target: string
  readonly title: string
  readonly text: string
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: '.palette',
    title: 'Pick a part',
    text: 'Drag a part onto the canvas, or click it. The search field finds any part by its name or by what it does.',
  },
  {
    target: '.canvas-wrap',
    title: 'Wire it up',
    text: 'Drag from one pin to another to connect them. Click a switch to change its value, and the wires take its color.',
  },
  {
    target: '.run',
    title: 'Run, pause and step',
    text: 'The circuit runs while you build it. Pause it to go through time one tick at a time, forward or back.',
  },
  {
    target: '.search-button',
    title: 'Find anything',
    text: 'Ctrl+K searches every action, part and example. The File menu holds the ready-made examples and the list of shortcuts.',
  },
]

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Pixels kept free between the card and the edge of the window. */
const EDGE = 8

/**
 * Where the card of a step goes: beside the piece it is about, on the first
 * side that has room (right, left, below, above), and over the middle of it
 * when no side has. The card always stays inside the window.
 */
export function placeCard(
  target: Box,
  card: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  gap = 12,
): { left: number; top: number } {
  const midX = target.left + target.width / 2 - card.width / 2
  const midY = target.top + target.height / 2 - card.height / 2
  const right = target.left + target.width + gap
  const below = target.top + target.height + gap
  const left = target.left - gap - card.width
  const above = target.top - gap - card.height

  let spot: { left: number; top: number }
  if (right + card.width + EDGE <= viewport.width) spot = { left: right, top: target.top }
  else if (left >= EDGE) spot = { left, top: target.top }
  else if (below + card.height + EDGE <= viewport.height) spot = { left: midX, top: below }
  else if (above >= EDGE) spot = { left: midX, top: above }
  else spot = { left: midX, top: midY }

  const clamp = (value: number, size: number, room: number): number =>
    Math.round(Math.max(EDGE, Math.min(value, room - size - EDGE)))
  return {
    left: clamp(spot.left, card.width, viewport.width),
    top: clamp(spot.top, card.height, viewport.height),
  }
}
