import { X, Z, digitChar } from '../core/index.ts'
import type { Digit, Signal } from '../core/index.ts'

/*
 * How a value looks: its color on a wire and how it is written.
 *
 * At radix 2 the classic look is CedarLogic's: one color for 0, one for 1.
 * With more values every digit gets its own color from a palette the user
 * can edit, and past ten values an automatic gradient takes over.
 */

/** Colors for the values 0 to 9: black, blue, red, green, yellow, purple,
 * orange, turquoise, pink, white. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#14181b',
  '#2f6fed',
  '#e03131',
  '#1f9d55',
  '#e8b400',
  '#9141d9',
  '#f2710c',
  '#12b5cb',
  '#e64d9a',
  '#ffffff',
]

/** The part of the project settings that decides how values look. */
export interface ValueSettings {
  readonly radix: number
  readonly palette: readonly string[]
  /** At radix 2, use the simulator's own off and on colors. */
  readonly classicColors: boolean
  /** Write the values of an odd radix around zero: -1, 0, +1. */
  readonly balanced: boolean
  readonly showDigits: boolean
}

/** The colors a value style takes from the page theme. */
export interface ValueTheme {
  readonly background: string
  readonly wire: string
  readonly signalLow: string
  readonly signalHigh: string
  readonly signalHiz: string
  readonly signalUnknown: string
}

function parseHex(color: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return undefined
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Relative luminance from 0 (black) to 1 (white). 0.5 for an unreadable color. */
export function luminance(color: string): number {
  const rgb = parseHex(color)
  if (!rgb) return 0.5
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two colors, from 1 (the same) to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Black or white, whichever reads better on the given color. */
export function inkOn(color: string): string {
  return luminance(color) > 0.4 ? '#101314' : '#ffffff'
}

/** A color for position t (0 to 1) along the automatic gradient: blue to red. */
export function gradientColor(t: number): string {
  const hue = 240 * (1 - Math.min(1, Math.max(0, t)))
  // HSL to RGB at full saturation and half lightness.
  const channel = (offset: number): number => {
    const k = (offset + hue / 30) % 12
    const value = 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255)
  }
  const hex = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`
}

/** Whether the classic two-color look applies. */
export function isClassic(settings: ValueSettings): boolean {
  return settings.radix === 2 && settings.classicColors
}

/** The color of a digit from 0 to radix - 1. */
export function digitColor(digit: number, settings: ValueSettings, theme: ValueTheme): string {
  if (isClassic(settings)) return digit === 0 ? theme.signalLow : theme.signalHigh
  if (settings.radix <= settings.palette.length) return settings.palette[digit] ?? theme.wire
  return gradientColor(digit / (settings.radix - 1))
}

/** A value as the user reads it: a digit, a balanced digit, X or Z. */
export function valueText(digit: Digit, settings: ValueSettings): string {
  if (digit === Z) return 'Z'
  if (digit < 0 || digit >= settings.radix) return 'X'
  if (settings.balanced && settings.radix % 2 === 1) {
    const centred = digit - (settings.radix - 1) / 2
    if (centred === 0) return '0'
    return centred > 0 ? `+${centred}` : `−${0 - centred}`
  }
  return digitChar(digit)
}

/**
 * A whole signal as the user reads it. A plain wire is written like any
 * value; a bus is its digits in a row, the most significant first.
 */
export function signalText(signal: Signal, settings: ValueSettings): string {
  if (signal.length === 1) return valueText(signal[0], settings)
  let text = ''
  for (let i = signal.length - 1; i >= 0; i--) {
    const digit = signal[i]
    text += digit === Z ? 'Z' : digit < 0 || digit >= settings.radix ? 'X' : digitChar(digit)
  }
  return text
}

/** How to stroke a wire that carries a value. Lengths are in grid units. */
export interface WireLook {
  readonly color: string
  readonly dash: readonly number[]
  /** Line width as a multiple of the normal wire width. */
  readonly weight: number
}

/** Below this contrast with the canvas a color is lifted toward the wire color. */
const MIN_CONTRAST = 1.6

/** A color part of the way from `a` to `b`: 0 is `a`, 1 is `b`. */
export function mixColor(a: string, b: string, t: number): string {
  const from = parseHex(a)
  const to = parseHex(b)
  if (!from || !to) return a
  const hex = (i: number): string =>
    Math.round(from[i] + (to[i] - from[i]) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}

/**
 * The color a value is drawn in on the canvas. One that would nearly vanish
 * into the background, such as black on the dark theme, is moved toward the
 * plain wire color until it reads, so the wire stays one solid line.
 */
function visibleColor(color: string, theme: ValueTheme): string {
  if (contrastRatio(color, theme.background) >= MIN_CONTRAST) return color
  for (let t = 0.2; t < 1; t += 0.1) {
    const lifted = mixColor(color, theme.wire, t)
    if (contrastRatio(lifted, theme.background) >= MIN_CONTRAST + 0.4) return lifted
  }
  return theme.wire
}

/**
 * Everything the renderer needs to show values, for one combination of
 * settings and theme.
 */
export interface ValueStyle {
  readonly showDigits: boolean
  /** The fill for a patch showing `digit`, or null for X and Z. */
  fill(digit: Digit): string | null
  text(digit: Digit): string
  /** How a whole signal is written: see `signalText`. */
  label(signal: Signal): string
  wire(digit: Digit, conflict: boolean): WireLook
  /** A bus: heavier than a wire and in one plain color, whatever it carries. */
  bus(signal: Signal, conflict: boolean): WireLook
}

export function makeValueStyle(settings: ValueSettings, theme: ValueTheme): ValueStyle {
  const classic = isClassic(settings)
  // Classic keeps CedarLogic's green and blue. With a palette those hues may
  // be digits, so floating and unknown wires fall back to the plain wire color.
  const floating = classic ? theme.signalHiz : theme.wire
  const unknown = classic ? theme.signalUnknown : theme.wire
  // Lifting a color clear of the background is slow, and every wire of every
  // frame asks for one, so each digit's look is worked out once.
  const looks: WireLook[] = []
  const lookOf = (digit: Digit): WireLook =>
    (looks[digit] ??= {
      color: visibleColor(digitColor(digit, settings, theme), theme),
      dash: [],
      weight: 1,
    })

  return {
    showDigits: settings.showDigits,
    fill(digit) {
      return digit >= 0 && digit < settings.radix ? digitColor(digit, settings, theme) : null
    },
    text(digit) {
      return valueText(digit, settings)
    },
    label(signal) {
      return signalText(signal, settings)
    },
    bus(signal, conflict) {
      if (conflict) return { color: unknown, dash: [0.3, 0.35], weight: 3 }
      if (signal.every((digit) => digit === Z)) {
        return { color: floating, dash: [0.4, 0.34], weight: 2 }
      }
      return { color: theme.wire, dash: [], weight: 2.5 }
    },
    wire(digit, conflict) {
      if (conflict) return { color: unknown, dash: [0.3, 0.35], weight: 1.9 }
      if (digit === Z) return { color: floating, dash: [0.4, 0.34], weight: 0.8 }
      if (digit === X || digit >= settings.radix) {
        return { color: unknown, dash: [0.02, 0.3], weight: 1.15 }
      }
      return lookOf(digit)
    },
  }
}
