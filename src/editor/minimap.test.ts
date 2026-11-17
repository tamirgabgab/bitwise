import { describe, expect, it } from 'vitest'
import { addComponent, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { minimapPan, minimapScene, visibleWorld } from './minimap.ts'
import { screenToWorld, UNIT } from './view.ts'
import type { View } from './view.ts'

/** Two gates 40 units apart, joined by a wire. */
function sample(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'not', { x: 0, y: 0 }).doc
  doc = addComponent(doc, 'not', { x: 40, y: 10 }).doc
  return addWire(
    doc,
    { kind: 'pin', component: 'c1', port: 'out' },
    { kind: 'pin', component: 'c2', port: 'in' },
  )!.doc
}

const WIDE: View = { panX: 200, panY: 200, zoom: 1 }

describe('visibleWorld', () => {
  it('is the grid rectangle the canvas shows', () => {
    expect(visibleWorld({ panX: 0, panY: 0, zoom: 1 }, 160, 80)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 5 })
    expect(visibleWorld({ panX: 32, panY: 0, zoom: 2 }, 160, 80)).toEqual({ x0: -1, y0: 0, x1: 4, y1: 2.5 })
  })
})

describe('minimapScene', () => {
  it('has nothing to show for an empty drawing', () => {
    expect(minimapScene(emptyDoc(), WIDE, 800, 600, 160, 100)).toBeUndefined()
  })

  it('keeps every part, the wires and the frame inside the map', () => {
    const scene = minimapScene(sample(), { panX: -3000, panY: 500, zoom: 2 }, 800, 600, 160, 100)!
    const inside = (x: number, y: number): boolean =>
      x >= -1e-6 && y >= -1e-6 && x <= 160 + 1e-6 && y <= 100 + 1e-6
    for (const rect of [...scene.parts, scene.viewport]) {
      expect(inside(rect.x0, rect.y0) && inside(rect.x1, rect.y1)).toBe(true)
    }
    expect(scene.parts).toHaveLength(2)
    expect(scene.wires).toHaveLength(1)
    for (const point of scene.wires[0]) expect(inside(point.x, point.y)).toBe(true)
  })

  it('is not needed while the canvas shows the whole drawing', () => {
    expect(minimapScene(sample(), WIDE, 1200, 800, 160, 100)!.needed).toBe(false)
  })

  it('is needed once a part is out of sight', () => {
    expect(minimapScene(sample(), WIDE, 400, 300, 160, 100)!.needed).toBe(true)
    expect(minimapScene(sample(), { ...WIDE, zoom: 4 }, 1200, 800, 160, 100)!.needed).toBe(true)
  })

  it('draws the frame smaller the further the canvas is zoomed in', () => {
    const near = minimapScene(sample(), { ...WIDE, zoom: 4 }, 400, 300, 160, 100)!
    const far = minimapScene(sample(), WIDE, 400, 300, 160, 100)!
    const span = (scene: typeof near): number => scene.viewport.x1 - scene.viewport.x0
    expect(span(near)).toBeLessThan(span(far))
  })
})

describe('minimapPan', () => {
  it('brings the spot that was picked on the map to the middle of the canvas', () => {
    const view: View = { panX: 200, panY: 200, zoom: 2 }
    const scene = minimapScene(sample(), view, 400, 300, 160, 100)!
    const part = scene.parts[1]
    const moved = minimapPan(scene, view, 400, 300, (part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2)
    expect(moved.zoom).toBe(2)
    const middle = screenToWorld(moved, 200, 150)
    // The second gate stands around (40, 10).
    expect(Math.abs(middle.x - 40)).toBeLessThan(3)
    expect(Math.abs(middle.y - 10)).toBeLessThan(3)
  })

  it('leaves the view where it is when the middle of the frame is picked', () => {
    const view: View = { panX: 120, panY: 80, zoom: 1 }
    const scene = minimapScene(sample(), view, 400, 300, 160, 100)!
    const { viewport } = scene
    const moved = minimapPan(
      scene,
      view,
      400,
      300,
      (viewport.x0 + viewport.x1) / 2,
      (viewport.y0 + viewport.y1) / 2,
    )
    expect(Math.abs(moved.panX - view.panX)).toBeLessThanOrEqual(1)
    expect(Math.abs(moved.panY - view.panY)).toBeLessThanOrEqual(1)
    expect(UNIT).toBe(16)
  })
})
