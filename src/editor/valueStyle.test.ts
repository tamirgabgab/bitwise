import { describe, expect, it } from 'vitest'
import { X, Z } from '../core/index.ts'
import {
  DEFAULT_PALETTE,
  contrastRatio,
  digitColor,
  gradientColor,
  inkOn,
  luminance,
  makeValueStyle,
  mixColor,
  valueText,
} from './valueStyle.ts'
import type { ValueSettings, ValueTheme } from './valueStyle.ts'

const light: ValueTheme = {
  background: '#fcfdfc',
  wire: '#33433e',
  signalLow: '#16201c',
  signalHigh: '#d92d34',
  signalHiz: '#1f9d55',
  signalUnknown: '#2f6fed',
}
const dark: ValueTheme = { ...light, background: '#0f1513', wire: '#a3b4ae' }

function settings(changes: Partial<ValueSettings> = {}): ValueSettings {
  return {
    radix: 2,
    palette: DEFAULT_PALETTE,
    classicColors: true,
    balanced: false,
    showDigits: false,
    ...changes,
  }
}

describe('colors', () => {
  it('measures luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(luminance('#fff')).toBeCloseTo(1)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#123456', '#123456')).toBe(1)
    // A color it cannot read counts as mid grey instead of failing.
    expect(luminance('rgb(1, 2, 3)')).toBe(0.5)
  })

  it('picks dark writing for light colors and light writing for dark ones', () => {
    expect(inkOn('#ffffff')).not.toBe('#ffffff')
    expect(inkOn('#e8b400')).not.toBe('#ffffff')
    expect(inkOn('#14181b')).toBe('#ffffff')
    expect(inkOn('#2f6fed')).toBe('#ffffff')
  })

  it('runs the gradient from blue to red', () => {
    expect(gradientColor(0)).toBe('#0000ff')
    expect(gradientColor(0.5)).toBe('#00ff00')
    expect(gradientColor(1)).toBe('#ff0000')
    expect(gradientColor(7)).toBe('#ff0000')
  })
})

describe('digitColor', () => {
  it('uses the off and on colors in the classic look', () => {
    expect(digitColor(0, settings(), light)).toBe(light.signalLow)
    expect(digitColor(1, settings(), light)).toBe(light.signalHigh)
  })

  it('uses the palette at radix 2 when the classic look is off', () => {
    const plain = settings({ classicColors: false })
    expect(digitColor(0, plain, light)).toBe(DEFAULT_PALETTE[0])
    expect(digitColor(1, plain, light)).toBe(DEFAULT_PALETTE[1])
  })

  it('uses the palette for 3 to 10 values, classic setting or not', () => {
    for (let radix = 3; radix <= 10; radix++) {
      for (let digit = 0; digit < radix; digit++) {
        expect(digitColor(digit, settings({ radix }), light)).toBe(DEFAULT_PALETTE[digit])
      }
    }
  })

  it('follows an edited palette', () => {
    const palette = [...DEFAULT_PALETTE]
    palette[2] = '#abcdef'
    expect(digitColor(2, settings({ radix: 3, palette }), light)).toBe('#abcdef')
  })

  it('switches to the gradient above 10 values', () => {
    const wide = settings({ radix: 12 })
    expect(digitColor(0, wide, light)).toBe(gradientColor(0))
    expect(digitColor(11, wide, light)).toBe(gradientColor(1))
    const colors = new Set(
      Array.from({ length: 16 }, (_, digit) => digitColor(digit, settings({ radix: 16 }), light)),
    )
    expect(colors.size).toBe(16)
  })
})

describe('valueText', () => {
  it('writes digits, with letters from ten up', () => {
    expect(valueText(0, settings())).toBe('0')
    expect(valueText(9, settings({ radix: 16 }))).toBe('9')
    expect(valueText(15, settings({ radix: 16 }))).toBe('F')
  })

  it('writes X for unknown and out-of-range values and Z for floating', () => {
    expect(valueText(X, settings())).toBe('X')
    expect(valueText(Z, settings())).toBe('Z')
    expect(valueText(2, settings())).toBe('X')
  })

  it('centres an odd radix on zero when balanced', () => {
    const ternary = settings({ radix: 3, balanced: true })
    expect([0, 1, 2].map((digit) => valueText(digit, ternary))).toEqual(['−1', '0', '+1'])
    const five = settings({ radix: 5, balanced: true })
    expect([0, 2, 4].map((digit) => valueText(digit, five))).toEqual(['−2', '0', '+2'])
  })

  it('ignores balanced for an even radix', () => {
    const four = settings({ radix: 4, balanced: true })
    expect([0, 1, 2, 3].map((digit) => valueText(digit, four))).toEqual(['0', '1', '2', '3'])
  })
})

describe('makeValueStyle', () => {
  it('draws a digit as a solid line in its color', () => {
    const look = makeValueStyle(settings({ radix: 3 }), light).wire(2, false)
    expect(look).toEqual({ color: DEFAULT_PALETTE[2], dash: [], weight: 1 })
  })

  it('lifts a color that would vanish into the canvas to a solid, readable one', () => {
    const ten = settings({ radix: 10 })
    // Black on the dark canvas, white on the light one.
    for (const [theme, digit] of [[dark, 0], [light, 9]] as const) {
      const look = makeValueStyle(ten, theme).wire(digit, false)
      expect(look.color).not.toBe(DEFAULT_PALETTE[digit])
      expect(look.dash).toEqual([])
      expect(contrastRatio(look.color, theme.background)).toBeGreaterThanOrEqual(1.6)
    }
    // Colors that already read are left alone.
    expect(makeValueStyle(ten, light).wire(0, false).color).toBe(DEFAULT_PALETTE[0])
    expect(makeValueStyle(ten, dark).wire(9, false).color).toBe(DEFAULT_PALETTE[9])
  })

  it('mixes two colors', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('breaks the line for floating, unknown and conflicting wires', () => {
    const style = makeValueStyle(settings({ radix: 3 }), light)
    const floating = style.wire(Z, false)
    const unknown = style.wire(X, false)
    const conflict = style.wire(1, true)
    for (const look of [floating, unknown, conflict]) expect(look.dash.length).toBe(2)
    expect(new Set([floating, unknown, conflict].map((look) => look.dash.join())).size).toBe(3)
    expect(conflict.weight).toBeGreaterThan(unknown.weight)
  })

  it('keeps CedarLogic green and blue for Z and X in the classic look only', () => {
    const classic = makeValueStyle(settings(), light)
    expect(classic.wire(Z, false).color).toBe(light.signalHiz)
    expect(classic.wire(X, false).color).toBe(light.signalUnknown)
    // With a palette those hues are digits, so Z and X go neutral.
    const palette = makeValueStyle(settings({ radix: 4 }), light)
    expect(palette.wire(Z, false).color).toBe(light.wire)
    expect(palette.wire(X, false).color).toBe(light.wire)
  })

  it('treats a digit the radix has no room for as unknown', () => {
    const style = makeValueStyle(settings({ radix: 3 }), light)
    expect(style.wire(5, false)).toEqual(style.wire(X, false))
    expect(style.fill(5)).toBeNull()
    expect(style.text(5)).toBe('X')
  })

  it('fills a patch with the value color, and not at all for X and Z', () => {
    const style = makeValueStyle(settings({ radix: 3 }), light)
    expect(style.fill(1)).toBe(DEFAULT_PALETTE[1])
    expect(style.fill(X)).toBeNull()
    expect(style.fill(Z)).toBeNull()
  })

  it('passes on whether digits are shown', () => {
    expect(makeValueStyle(settings({ showDigits: true }), light).showDigits).toBe(true)
    expect(makeValueStyle(settings(), light).showDigits).toBe(false)
  })
})
