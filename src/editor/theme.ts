/** The colors the canvas paints with, taken from the page's CSS variables. */
export interface CanvasTheme {
  readonly background: string
  readonly gridDot: string
  /** Outlines of parts. */
  readonly ink: string
  readonly partFill: string
  readonly wire: string
  /** Selection, hover and anything else that marks the user's focus. */
  readonly accent: string
  readonly accentSoft: string
  /** The classic signal colors: 0, 1, floating and unknown. */
  readonly signalLow: string
  readonly signalHigh: string
  readonly signalHiz: string
  readonly signalUnknown: string
}

/** Reads the theme in effect for an element. Call again when it changes. */
export function readCanvasTheme(element: Element): CanvasTheme {
  const style = getComputedStyle(element)
  const read = (name: string): string => style.getPropertyValue(name).trim()
  return {
    background: read('--canvas-bg'),
    gridDot: read('--grid-dot'),
    ink: read('--ink'),
    partFill: read('--part-fill'),
    wire: read('--wire'),
    accent: read('--accent'),
    accentSoft: read('--accent-soft'),
    signalLow: read('--signal-low'),
    signalHigh: read('--signal-high'),
    signalHiz: read('--signal-hiz'),
    signalUnknown: read('--signal-unknown'),
  }
}
