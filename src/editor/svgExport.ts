import type { CircuitDoc } from './document.ts'
import { docBounds } from './hitTest.ts'
import type { LiveValues } from './liveValues.ts'
import { renderScene } from './render.ts'
import { SvgContext } from './svgContext.ts'
import type { GateStyle } from './symbols.ts'
import type { CanvasTheme } from './theme.ts'
import type { ValueStyle } from './valueStyle.ts'
import { UNIT } from './view.ts'
import { wirePath } from './wireLayout.ts'

/** Empty space left around the drawing, in grid units. */
const MARGIN = 2
/** Pixels per grid unit at the picture's natural size. */
const SCALE = UNIT * 1.5

/**
 * A drawing as an SVG picture: the whole circuit with the values it carries
 * now, on a plain background and without anything that belongs to editing.
 */
export function circuitSvg(
  doc: CircuitDoc,
  theme: CanvasTheme,
  style: ValueStyle,
  live: LiveValues,
  gates?: GateStyle,
): string {
  let { x0, y0, x1, y1 } = docBounds(doc) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
  // A wire can run outside the box of the parts it joins.
  for (const wire of Object.values(doc.wires)) {
    for (const point of wirePath(doc, wire) ?? []) {
      x0 = Math.min(x0, point.x)
      y0 = Math.min(y0, point.y)
      x1 = Math.max(x1, point.x)
      y1 = Math.max(y1, point.y)
    }
  }
  // Names stand above their parts and keycaps below them.
  x0 -= MARGIN
  y0 -= MARGIN
  x1 += MARGIN
  y1 += MARGIN
  const width = Math.ceil((x1 - x0) * SCALE)
  const height = Math.ceil((y1 - y0) * SCALE)

  const ctx = new SvgContext()
  renderScene(ctx as unknown as CanvasRenderingContext2D, width, height, 1, theme, {
    doc,
    selection: new Set(),
    view: { panX: -x0 * SCALE, panY: -y0 * SCALE, zoom: SCALE / UNIT },
    highlight: null,
    wirePreview: null,
    marquee: null,
    ghost: null,
    live,
    style,
    active: new Set(),
    marks: [],
    paper: true,
    gates,
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">\n${ctx.body}\n</svg>\n`
  )
}
