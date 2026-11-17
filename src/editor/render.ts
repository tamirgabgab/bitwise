import { builtinComponents, digitChar, numberValue, resolveParams } from '../core/index.ts'
import type { Digit } from '../core/index.ts'
import { junctionDegrees, keyName, terminalKey } from './document.ts'
import type { CircuitDoc, DocComponent, SubRef } from './document.ts'
import type { Point, Rect } from './geometry.ts'
import type { LiveValues } from './liveValues.ts'
import { symbolOf } from './symbols.ts'
import type { ComponentSymbol, SymbolFace, SymbolReadout } from './symbols.ts'
import type { CanvasTheme } from './theme.ts'
import { inkOn } from './valueStyle.ts'
import type { ValueStyle, WireLook } from './valueStyle.ts'
import { UNIT } from './view.ts'
import type { View } from './view.ts'
import { wireBranches, wirePath } from './wireLayout.ts'

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
  readonly ghost: { readonly type: string; readonly pos: Point; readonly sub?: SubRef } | null
  /** The values of the running circuit, and how to show them. */
  readonly live: LiveValues
  readonly style: ValueStyle
  /** The parts a change is passing through at this tick, to be ringed. */
  readonly active: ReadonlySet<string>
  /** Where a breakpoint sits on a wire. */
  readonly marks: readonly Point[]
  /** Leave the grid out, as for a picture of the circuit. */
  readonly paper?: boolean
}

const STROKE = 0.13
const WIRE_STROKE = 0.14
const PIN_DOT = 0.12
const CORNER_RADIUS = 0.4
const JUNCTION_DOT = 0.24
const FONT = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif'

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

function strokeWire(ctx: CanvasRenderingContext2D, path: readonly Point[], look: WireLook): void {
  if (look.casing) {
    tracePath(ctx, path)
    ctx.strokeStyle = look.casing
    ctx.lineWidth = WIRE_STROKE * look.weight + 0.1
    ctx.stroke()
  }
  tracePath(ctx, path)
  ctx.setLineDash(look.dash as number[])
  ctx.strokeStyle = look.color
  ctx.lineWidth = WIRE_STROKE * look.weight
  ctx.stroke()
  ctx.setLineDash([])
}

function fillDot(ctx: CanvasRenderingContext2D, at: Point, radius: number, look: WireLook): void {
  if (look.casing) {
    ctx.beginPath()
    ctx.arc(at.x, at.y, radius + 0.05, 0, Math.PI * 2)
    ctx.fillStyle = look.casing
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = look.color
  ctx.fill()
}

/**
 * Writes text centred on a point given in the current coordinates, upright
 * and at a real pixel size whatever rotation and scale are in effect.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  size: number,
  color: string,
  halo?: string,
): void {
  const matrix = ctx.getTransform()
  const scale = Math.hypot(matrix.a, matrix.b)
  const x = matrix.a * at.x + matrix.c * at.y + matrix.e
  const y = matrix.b * at.x + matrix.d * at.y + matrix.f
  const pixels = size * scale
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `600 ${pixels}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // The visual middle of digits and capitals sits a little above the em middle.
  const baseline = y + pixels * 0.06
  if (halo) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, pixels * 0.28)
    ctx.strokeStyle = halo
    ctx.strokeText(text, x, baseline)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, baseline)
  ctx.restore()
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  face: SymbolFace,
  digit: Digit | undefined,
  style: ValueStyle | null,
  theme: CanvasTheme,
  outline: string,
): void {
  const { pos, reach } = face
  ctx.beginPath()
  if (face.shape === 'round') ctx.arc(pos.x, pos.y, reach, 0, Math.PI * 2)
  else ctx.roundRect(pos.x - reach, pos.y - reach, 2 * reach, 2 * reach, 0.16)
  const fill = digit === undefined ? null : (style?.fill(digit) ?? null)
  ctx.fillStyle = fill ?? theme.partFill
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = STROKE * 0.75
  ctx.stroke()
  if (digit === undefined) return
  const text = style ? style.text(digit) : digitChar(digit)
  const size = reach * (text.length > 1 ? 1.05 : 1.4)
  drawText(ctx, text, pos, size, fill ? inkOn(fill) : theme.ink)
}

/** Writes the number a display shows: its digits, and under them the decimal value. */
function drawReadout(
  ctx: CanvasRenderingContext2D,
  readout: SymbolReadout,
  digits: readonly Digit[] | undefined,
  radix: number,
  theme: CanvasTheme,
): void {
  const shown = digits ?? readout.pins.map(() => 0)
  const text = [...shown].reverse().map(digitChar).join('')
  const size = readout.size * Math.min(1, 5.2 / text.length)
  ctx.globalAlpha *= digits ? 1 : 0.4
  drawText(ctx, text, readout.digits, size, theme.ink)
  const value = digits ? numberValue(digits, radix) : 0
  const decimal = value === undefined ? 'no number' : `= ${value}`
  drawText(ctx, decimal, readout.decimal, 0.62, theme.ink)
  ctx.globalAlpha /= digits ? 1 : 0.4
}

interface PartLook {
  readonly stroke: string
  readonly fill: string
  readonly lineWidth: number
}

/**
 * Draws one part where it stands: its outline, the writing on it, and its
 * face showing `faceDigit` (left blank when undefined).
 */
function drawPart(
  ctx: CanvasRenderingContext2D,
  symbol: ComponentSymbol,
  placement: Pick<DocComponent, 'pos' | 'rotation'>,
  look: PartLook,
  theme: CanvasTheme,
  style: ValueStyle | null,
  faceDigit: Digit | undefined,
  name?: string,
  number?: { readonly digits: readonly Digit[]; readonly radix: number },
  keyCap?: string,
): void {
  ctx.save()
  ctx.translate(placement.pos.x, placement.pos.y)
  ctx.rotate((placement.rotation * Math.PI) / 2)
  ctx.strokeStyle = look.stroke
  ctx.fillStyle = look.fill
  ctx.lineWidth = look.lineWidth
  symbol.draw(ctx)
  if (symbol.face) drawFace(ctx, symbol.face, faceDigit, style, theme, look.stroke)
  if (symbol.label) {
    const { label } = symbol
    let text = label.text
    if (label.digit !== undefined) text += style ? style.text(label.digit) : digitChar(label.digit)
    drawText(ctx, text, label.pos, text.length > 2 ? label.size * 0.82 : label.size, look.stroke)
  }
  for (const note of symbol.notes ?? []) {
    drawText(ctx, note.text, note.pos, note.size, look.stroke)
  }
  if (symbol.readout) {
    drawReadout(ctx, symbol.readout, number?.digits, number?.radix ?? 2, theme)
  }
  if (name) {
    // The name of the part, just above it.
    const { x0, x1, y0 } = symbol.bounds
    drawText(ctx, name, { x: (x0 + x1) / 2, y: y0 - 0.55 }, 0.68, theme.ink, theme.background)
  }
  if (keyCap) {
    // The keyboard key that works the part, as a small keycap under it.
    const { x0, x1, y1 } = symbol.bounds
    const at = { x: (x0 + x1) / 2, y: y1 + 0.8 }
    ctx.beginPath()
    ctx.roundRect(at.x - 0.46, at.y - 0.46, 0.92, 0.92, 0.2)
    ctx.fillStyle = theme.background
    ctx.fill()
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 0.07
    ctx.stroke()
    drawText(ctx, keyCap, at, 0.6, theme.ink)
  }
  ctx.restore()
}

/** What a part's face shows before any simulation: only a constant has a value. */
function restingFace(type: string, params: Readonly<Record<string, number>>): Digit | undefined {
  return type === 'const' ? params.value : undefined
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
  const { doc, selection, view, live, style } = scene
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)
  if (!scene.paper) drawGrid(ctx, width, height, theme, view)

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
    const value = live.at(wire.from)
    strokeWire(ctx, path, style.wire(value.digit, value.conflict))
  }

  for (const branch of wireBranches(doc)) {
    const value = live.net(branch.net)
    fillDot(ctx, branch.pos, JUNCTION_DOT, style.wire(value.digit, value.conflict))
  }

  const degrees = junctionDegrees(doc)
  for (const junction of Object.values(doc.junctions)) {
    // Three or more wires make a real junction dot. With fewer it is only a
    // bend point, drawn smaller so it does not read as a connection.
    const radius = (degrees.get(junction.id) ?? 0) >= 3 ? JUNCTION_DOT : 0.15
    if (selection.has(junction.id)) {
      ctx.beginPath()
      ctx.arc(junction.pos.x, junction.pos.y, 0.5, 0, Math.PI * 2)
      ctx.fillStyle = theme.accentSoft
      ctx.fill()
    }
    const value = live.at({ kind: 'junction', junction: junction.id })
    fillDot(ctx, junction.pos, radius, style.wire(value.digit, value.conflict))
  }

  for (const component of Object.values(doc.components)) {
    const symbol = symbolOf(component)
    const selected = selection.has(component.id)
    const outline = selected ? theme.accent : theme.ink
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
    if (scene.active.has(component.id)) {
      // A change is passing through this part right now.
      const { x0, y0, x1, y1 } = symbol.bounds
      ctx.save()
      ctx.translate(component.pos.x, component.pos.y)
      ctx.rotate((component.rotation * Math.PI) / 2)
      ctx.beginPath()
      ctx.roundRect(x0 - 0.35, y0 - 0.35, x1 - x0 + 0.7, y1 - y0 + 0.7, 0.4)
      ctx.strokeStyle = theme.accent
      ctx.lineWidth = 0.16
      ctx.stroke()
      ctx.restore()
    }
    drawPart(
      ctx,
      symbol,
      component,
      { stroke: outline, fill: theme.partFill, lineWidth: STROKE },
      theme,
      style,
      live.face(component.id) ?? restingFace(component.type, component.params),
      component.label,
      symbol.readout && {
        digits: symbol.readout.pins.map(
          (port) => live.at({ kind: 'pin', component: component.id, port }).digit,
        ),
        radix: live.radix,
      },
      component.key === undefined ? undefined : keyName(component.key),
    )

    ctx.save()
    ctx.translate(component.pos.x, component.pos.y)
    ctx.rotate((component.rotation * Math.PI) / 2)
    for (const pin of symbol.pins) {
      // A dot on every pin that has no wire yet, to show where one can start.
      const key = terminalKey({ kind: 'pin', component: component.id, port: pin.name })
      if (!wiredPins.has(key)) {
        ctx.fillStyle = outline
        ctx.beginPath()
        ctx.arc(pin.pos.x, pin.pos.y, PIN_DOT, 0, Math.PI * 2)
        ctx.fill()
      }
      // The value a gate puts out, written beside its output pin.
      if (style.showDigits && pin.direction === 'out' && !symbol.face) {
        const at = {
          x: pin.pos.x - 0.45 * pin.dir.x + 0.6 * pin.dir.y,
          y: pin.pos.y - 0.45 * pin.dir.y - 0.6 * pin.dir.x,
        }
        const text = style.text(live.output(component.id, pin.name))
        drawText(ctx, text, at, text.length > 1 ? 0.6 : 0.72, theme.ink, theme.background)
      }
    }
    ctx.restore()
  }

  for (const mark of scene.marks) {
    // A breakpoint: a diamond around the point of the wire it sits on.
    const reach = 0.48
    ctx.beginPath()
    ctx.moveTo(mark.x, mark.y - reach)
    ctx.lineTo(mark.x + reach, mark.y)
    ctx.lineTo(mark.x, mark.y + reach)
    ctx.lineTo(mark.x - reach, mark.y)
    ctx.closePath()
    ctx.strokeStyle = theme.background
    ctx.lineWidth = 0.26
    ctx.stroke()
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 0.13
    ctx.stroke()
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
    const { ghost } = scene
    const params = defaultParamsOf(ghost.type)
    ctx.globalAlpha = 0.55
    drawPart(
      ctx,
      symbolOf({ type: ghost.type, params, sub: ghost.sub }),
      { pos: scene.ghost.pos, rotation: 0 },
      { stroke: theme.accent, fill: theme.partFill, lineWidth: STROKE },
      theme,
      style,
      restingFace(scene.ghost.type, params),
    )
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
  // A named circuit and a text label have no parameters.
  return builtinComponents.has(type) ? resolveParams(builtinComponents.get(type)) : {}
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
  const params = defaultParamsOf(type)
  const symbol = symbolOf({ type, params })
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
  drawPart(
    ctx,
    symbol,
    { pos: { x: 0, y: 0 }, rotation: 0 },
    { stroke: theme.ink, fill: theme.partFill, lineWidth: 1.5 / scale },
    theme,
    null,
    restingFace(type, params),
  )
}
