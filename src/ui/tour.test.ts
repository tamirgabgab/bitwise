import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, placeCard } from './tour.ts'

const CARD = { width: 300, height: 160 }
const SCREEN = { width: 1280, height: 800 }

describe('placeCard', () => {
  it('goes to the right of a piece on the left edge', () => {
    const spot = placeCard({ left: 0, top: 80, width: 188, height: 600 }, CARD, SCREEN)
    expect(spot).toEqual({ left: 200, top: 80 })
  })

  it('goes to the left of a piece that leaves no room on its right', () => {
    const spot = placeCard({ left: 1100, top: 60, width: 170, height: 300 }, CARD, SCREEN)
    expect(spot.left).toBe(1100 - 12 - 300)
    expect(spot.top).toBe(60)
  })

  it('goes below a piece that spans the window', () => {
    const spot = placeCard({ left: 0, top: 0, width: 1280, height: 44 }, CARD, SCREEN)
    expect(spot.top).toBe(56)
    expect(spot.left).toBe(490)
  })

  it('goes above a piece at the bottom of the window', () => {
    const spot = placeCard({ left: 0, top: 760, width: 1280, height: 40 }, CARD, SCREEN)
    expect(spot.top).toBe(760 - 12 - 160)
  })

  it('sits over the middle of a piece that fills the window', () => {
    const spot = placeCard({ left: 0, top: 0, width: 1280, height: 800 }, CARD, SCREEN)
    expect(spot).toEqual({ left: 490, top: 320 })
  })

  it('never leaves the window, even a small one', () => {
    const phone = { width: 375, height: 700 }
    for (const target of [
      { left: 300, top: 5, width: 60, height: 30 },
      { left: 0, top: 650, width: 375, height: 60 },
      { left: -40, top: -40, width: 30, height: 30 },
    ]) {
      const spot = placeCard(target, CARD, phone)
      expect(spot.left).toBeGreaterThanOrEqual(8)
      expect(spot.top).toBeGreaterThanOrEqual(8)
      expect(spot.left + CARD.width).toBeLessThanOrEqual(phone.width - 8)
      expect(spot.top + CARD.height).toBeLessThanOrEqual(phone.height - 8)
    }
  })
})

describe('the tour', () => {
  it('has four steps, each about one piece of the app', () => {
    expect(TOUR_STEPS).toHaveLength(4)
    expect(new Set(TOUR_STEPS.map((step) => step.target)).size).toBe(4)
  })
})
