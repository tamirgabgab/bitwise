import { builtinComponents, resolveParams } from '../core/index.ts'
import { junctionDegrees, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import { symbolFor } from './symbols.ts'
import type { ComponentSymbol } from './symbols.ts'
import type { CanvasTheme } from './theme.ts'
import { UNIT } from './view.ts'
import type { View } from './view.ts'
import { branchPoints, wirePath } from './wireLayout.ts'

/** Everything one frame shows. */
export interface Scene {
  readonly doc: CircuitDoc
  readonly selection: ReadonlySet<string>
  readonly view: View
  /** A pin, junction or wire point to ring, because a wire can attach there. */
  readonly highlight: Point | null
  /** The wire being drawn right now. */
  readonly wirePreview: readonly Point[] | null
  readonly marquee: Rect | null
  /** A part being dragged in from the palette. */
  readonly ghost: { readonly type: string; readonly pos: Point } | null
}

const STROKE = 0.13
const WIRE_STROKE = 0.14
const PIN_DOT = 0.12
const CORNER_RADIUS = 0.4
const JUNCTION_DOT = 0.24

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: CanvasTheme,
  view: View,
): void {
  let step = UNIT * view.zoom
  // Zoomed far out, every dot would turn the page grey: show every fifth.
  if (step < 9) step *= 5
  const size = view.zoom >= 1.5 ? 2 : 1.5
  const startX = ((view.panX % step) + step) % step
  const startY = ((view.panY % step) + step) % step
  ctx.fillStyle = theme.gridDot
  for (let x = startX; x < width; x += step) {
    for (let y = startY; y < height; y += step) {
      ctx.fillRect(x - size / 2, y - size / 2, size, size)
    }
  }
}

/**
 * Traces a wire with rounded corners. A rounded corner reads as one wire
 * turning, where a sharp one next to another wire can look like a crossing.
 */
function tracePath(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]
    const corner = points[i]
    const after = points[i + 1]
    const room = Math.min(
      Math.hypot(corner.x - before.x, corner.y - before.y),
      Math.hypot(after.x - corner.x, after.y - corner.y),
    )
    ctx.arcTo(corner.x, corner.y, after.x, after.y, Math.min(CORNER_RADIUS, room / 2))
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: ComponentSymbol,
  component: Pick<DocComponent, 'pos' | 'rotation'>,
  stroke: string,
  fill: string,
): void {
  ctx.save()
  ctx.translate(component.pos.x, component.pos.y)
  ctx.rotate((component.rotation * Math.PI) / 2)
  ctx.strokeStyle = stroke
  ctx.fillStyle = fill
  ctx.lineWidth = STROKE
  symbol.draw(ctx)
  ctx.restore()
}

/** Paints one frame. `width` and `height` are in CSS pixels. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelRatio: number,
  theme: CanvasTheme,
  scene: Scene,
): void {
  const { doc, selection, view } = scene
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)
  drawGrid(ctx, width, height, theme, view)

  // From here on, one unit is one grid square.
  const scale = UNIT * view.zoom
  ctx.setTransform(
    pixelRatio * scale,
    0,
    0,
    pixelRatio * scale,
    pixelRatio * view.panX,
    pixelRatio * view.panY,
  )
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const wiredPins = new Set<string>()
  for (const wire of Object.values(doc.wires)) {
    wiredPins.add(terminalKey(wire.from))
    wiredPins.add(terminalKey(wire.to))
    const path = wirePath(doc, wire)
    if (!path) continue
    if (selection.has(wire.id)) {
      tracePath(ctx, path)
      ctx.strokeStyle = theme.accentSoft
      ctx.lineWidth = 0.6
      ctx.stroke()
    }
    tracePath(ctx, path)
    ctx.strokeStyle = selection.has(wire.id) ? theme.accent : theme.wire
    ctx.lineWidth = WIRE_STROKE
    ctx.stroke()
  }

  ctx.fillStyle = theme.wire
  for (const point of branchPoints(doc)) {
    ctx.beginPath()
    ctx.arc(point.x, point.y, JUNCTION_DOT, 0, Math.PI * 2)
    ctx.fill()
  }

  const degrees = junctionDegrees(doc)
  for (const junction of Object.values(doc.junctions)) {
    const selected = selection.has(junction.id)
    // Three or more wires make a real junction dot. With fewer it is only a
    // bend point, drawn smaller so it does not read as a connection.
    const radius = (degrees.get(junction.id) ?? 0) >= 3 ? JUNCTION_DOT : 0.15
    if (selected) {
      ctx.beginPath()
      ctx.arc(junction.pos.x, junction.pos.y, 0.5, 0, Math.PI * 2)
      ctx.fillStyle = theme.accentSoft
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(junction.pos.x, junction.pos.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = selected ? theme.accent : theme.wire
    ctx.fill()
  }

  for (const component of Object.values(doc.components)) {
    const symbol = symbolFor(component.type, component.params)
    const selected = selection.has(component.id)
    if (selected) {
      const { x0, y0, x1, y1 } = symbol.bounds
      ctx.save()
      ctx.translate(component.pos.x, component.pos.y)
      ctx.rotate((component.rotation * Math.PI) / 2)
      ctx.beginPath()
      ctx.roundRect(x0 - 0.35, y0 - 0.35, x1 - x0 + 0.7, y1 - y0 + 0.7, 0.4)
      ctx.fillStyle = theme.accentSoft
      ctx.fill()
      ctx.restore()
    }
    drawSymbol(ctx, symbol, component, selected ? theme.accent : theme.ink, theme.partFill)

    // A dot on every pin that has no wire yet, to show where one can start.
    ctx.save()
    ctx.translate(component.pos.x, component.pos.y)
    ctx.rotate((component.rotation * Math.PI) / 2)
    ctx.fillStyle = selected ? theme.accent : theme.ink
    for (const pin of symbol.pins) {
      const key = terminalKey({ kind: 'pin', component: component.id, port: pin.name })
      if (wiredPins.has(key)) continue
      ctx.beginPath()
      ctx.arc(pin.pos.x, pin.pos.y, PIN_DOT, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  if (scene.wirePreview && scene.wirePreview.length > 1) {
    tracePath(ctx, scene.wirePreview)
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = WIRE_STROKE
    ctx.stroke()
  }

  if (scene.highlight) {
    ctx.beginPath()
    ctx.arc(scene.highlight.x, scene.highlight.y, 0.42, 0, Math.PI * 2)
    ctx.fillStyle = theme.accentSoft
    ctx.fill()
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 0.09
    ctx.stroke()
  }

  if (scene.ghost) {
    const symbol = symbolFor(scene.ghost.type, defaultParamsOf(scene.ghost.type))
    ctx.globalAlpha = 0.55
    drawSymbol(ctx, symbol, { pos: scene.ghost.pos, rotation: 0 }, theme.accent, theme.partFill)
    ctx.globalAlpha = 1
  }

  if (scene.marquee) {
    const { x0, y0, x1, y1 } = scene.marquee
    ctx.fillStyle = theme.accentSoft
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 1 / scale
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
  }
}

/** The parameters a freshly placed part of this type starts with. */
export function defaultParamsOf(type: string): Readonly<Record<string, number>> {
  return resolveParams(builtinComponents.get(type))
}

/** Paints a single symbol centred in a small canvas, for the palette. */
export function renderSymbolIcon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelRatio: number,
  theme: CanvasTheme,
  type: string,
): void {
  const symbol = symbolFor(type, defaultParamsOf(type))
  const { x0, y0, x1, y1 } = symbol.bounds
  const scale = Math.min((width - 8) / (x1 - x0), (height - 8) / (y1 - y0), 9)
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.setTransform(
    pixelRatio * scale,
    0,
    0,
    pixelRatio * scale,
    pixelRatio * (width / 2 - ((x0 + x1) / 2) * scale),
    pixelRatio * (height / 2 - ((y0 + y1) / 2) * scale),
  )
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = theme.ink
  ctx.fillStyle = theme.partFill
  ctx.lineWidth = 1.5 / scale
  symbol.draw(ctx)
}
