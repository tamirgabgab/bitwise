import type { CSSProperties } from 'react'
import { gradientColor, inkOn } from '../editor/index.ts'
import type { ProjectSettings } from '../editor/index.ts'

/** True when the two values are shown in the classic dark and red. */
export function usesClassicColors(settings: ProjectSettings): boolean {
  return settings.radix === 2 && settings.classicColors
}

/** True when every value has a color of its own that the user can change. */
export function hasOwnColors(settings: ProjectSettings): boolean {
  return !usesClassicColors(settings) && settings.radix <= settings.palette.length
}

/** The colors a chip for one value is drawn in: the wire color and ink that reads on it. */
export function swatchStyle(settings: ProjectSettings, digit: number): CSSProperties {
  // The classic colors belong to the page theme, so they come from its CSS.
  if (usesClassicColors(settings)) {
    return digit === 0
      ? { background: 'var(--signal-low)', color: 'var(--canvas-bg)' }
      : { background: 'var(--signal-high)', color: '#ffffff' }
  }
  const color = hasOwnColors(settings)
    ? settings.palette[digit]
    : gradientColor(digit / (settings.radix - 1))
  return { background: color, color: inkOn(color) }
}
