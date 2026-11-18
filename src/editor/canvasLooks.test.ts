import { describe, expect, it } from 'vitest'
import { CANVAS_LOOKS } from './store.ts'
import { contrastRatio } from './valueStyle.ts'
import css from '../index.css?raw'

/** The variables each canvas look sets in `src/index.css`, by look. */
function looks(): Map<string, Record<string, string>> {
  const found = new Map<string, Record<string, string>>()
  for (const [, id, body] of css.matchAll(/\[data-canvas='(\w+)'\][^{]*\{([^}]*)\}/g)) {
    const vars: Record<string, string> = {}
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[name] = value.trim()
    if (Object.keys(vars).length > 0) found.set(id, vars)
  }
  return found
}

/** How far apart two #rrggbb colors are, straight through RGB. */
function distance(a: string, b: string): number {
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [x, y] = [rgb(a), rgb(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const SIGNALS = ['signal-high', 'signal-low', 'signal-hiz', 'signal-unknown'] as const

describe('canvas looks', () => {
  it('has colors for every look but the classic one', () => {
    const defined = looks()
    for (const look of CANVAS_LOOKS) {
      if (look.id === 'classic') expect(defined.has(look.id)).toBe(false)
      else expect(defined.has(look.id), look.id).toBe(true)
    }
  })

  it('keeps ink and every signal color clear of the background, and the signals apart', () => {
    for (const [id, vars] of looks()) {
      const background = vars['canvas-bg']
      expect(contrastRatio(vars.ink, background), `${id} ink`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(vars.wire, background), `${id} wire`).toBeGreaterThanOrEqual(4.5)
      for (const signal of SIGNALS) {
        expect(contrastRatio(vars[signal], background), `${id} ${signal}`).toBeGreaterThanOrEqual(3)
      }
      // No two signal colors may be mistaken for each other.
      for (const a of SIGNALS) {
        for (const b of SIGNALS) {
          if (a < b) expect(distance(vars[a], vars[b]), `${id} ${a}/${b}`).toBeGreaterThan(80)
        }
      }
    }
  })
})
