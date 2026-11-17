import { describe, expect, it } from 'vitest'
import { MIN_PANEL, clampPanelHeight } from './panelSize.ts'

describe('clampPanelHeight', () => {
  it('keeps a height that fits', () => {
    expect(clampPanelHeight(240.4, 800)).toBe(240)
  })

  it('does not go under the least height', () => {
    expect(clampPanelHeight(10, 800)).toBe(MIN_PANEL)
    expect(clampPanelHeight(-50, 800)).toBe(MIN_PANEL)
  })

  it('does not take more than its share of the window', () => {
    expect(clampPanelHeight(2000, 800)).toBe(560)
  })

  it('keeps the least height even in a very small window', () => {
    expect(clampPanelHeight(300, 100)).toBe(MIN_PANEL)
  })
})
