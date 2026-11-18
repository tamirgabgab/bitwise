import {
  X,
  builtinComponents,
  digitChar,
  filled,
  formatSignal,
  numberValue,
  resolveParams,
} from '../core/index.ts'
import type { Digit, Signal } from '../core/index.ts'
import { FRAME_TYPE, NET_TYPE, junctionDegrees, keyName, terminalKey } from './document.ts'
import type { BusFormat, CircuitDoc, DocComponent, SubRef } from './document.ts'
import { formatAt } from './busFormat.ts'
import type { Point, Rect } from './geometry.ts'
import type { LiveValues, WireValue } from './liveValues.ts'
import { DEFAULT_FRAME, FRAME_SIZE, FRAME_TITLE, symbolOf } from './symbols.ts'
import type { ComponentSymbol, SymbolFace, SymbolReadout } from './symbols.ts'
import type { CanvasTheme } from './theme.ts'
import { inkOn } from './valueStyle.ts'
import type { ValueStyle, WireLook } from './valueStyle.ts'
import type { ConeMarks } from './cone.ts'
import type { Guide } from './guides.ts'
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
  /**
   * A part being dragged in from the palette, and the wire it would go into
   * if it were dropped there.
   */
  readonly ghost: {
    readonly type: string
    readonly pos: Point
    readonly sub?: SubRef
    readonly onto?: string
  } | null
  /** The values of the running circuit, and how to show them. */
  readonly live: LiveValues
  readonly style: ValueStyle
  /** The parts a change is passing through at this tick, to be ringed. */
  readonly active: ReadonlySet<string>
  /** Where a breakpoint sits on a wire. */
  readonly marks: readonly Point[]
  /** The wave on a wire whose value just changed: how far it is, and which way it runs. */
  readonly pulse?: (wireId: string) => WirePulse | undefined
  /** The longest path through the circuit, to be marked, when the user asked for it. */
  readonly critical?: { readonly parts: ReadonlySet<string>; readonly wires: ReadonlySet<string> }
  /** Where the parts being dragged line up with the others. */
  readonly guides?: readonly Guide[]
  /**
   * The cone of influence of the selection, when the user asked for it:
   * what it drives is lit, what drives it is drawn as usual, and the rest
   * fades.
   */
  readonly cone?: ConeMarks
  /** Leave the grid out, as for a picture of the circuit. */
  readonly paper?: boolean
}

/** A wave on its way along a wire. */
export interface WirePulse {
  /** From 0, just started, to 1, gone. */
  readonly progress: number
  /** 1 from the first end of the wire to the second, -1 the other way, 0 unknown. */
  readonly direction: number
}

const STROKE = 0.13
const WIRE_STROKE = 0.14
const PIN_DOT = 0.12
const CORNER_RADIUS = 0.4
const JUNCTION_DOT = 0.24
/** How strongly a part or wire outside the cone of influence is drawn. */
const FADED = 0.22
const FONT = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif'
/** Values are set in Plex Mono, falling back to Plex Sans (`--font-mono`). */
const VALUE_FONT = '"IBM Plex Mono", "IBM Plex Sans", system-ui, sans-serif'

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
  tracePath(ctx, path)
  ctx.setLineDash(look.dash as number[])
  ctx.strokeStyle = look.color
  ctx.lineWidth = WIRE_STROKE * look.weight
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * The wave over a wire that just changed: a glow in the color of the new
 * value that fades, and gaps that run the way the value travels.
 */
function strokePulse(
  ctx: CanvasRenderingContext2D,
  path: readonly Point[],
  look: WireLook,
  pulse: WirePulse,
  theme: CanvasTheme,
): void {
  const fade = 1 - pulse.progress
  ctx.globalAlpha = 0.4 * fade
  tracePath(ctx, path)
  ctx.strokeStyle = look.color
  ctx.lineWidth = WIRE_STROKE * look.weight + 0.36
  ctx.stroke()
  if (pulse.direction !== 0) {
    ctx.globalAlpha = 0.85 * fade
    tracePath(ctx, path)
    ctx.setLineDash([0.22, 0.9])
    ctx.lineDashOffset = -pulse.direction * pulse.progress * 3.36
    ctx.strokeStyle = theme.background
    ctx.lineWidth = WIRE_STROKE * look.weight * 0.5
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }
  ctx.globalAlpha = 1
}

/** How the wire that carries `value` is stroked. */
function wireLook(style: ValueStyle, value: WireValue): WireLook {
  // Pins of different widths on one wire: a fault, shown like a conflict.
  if (value.mixed) return style.wire(X, true)
  if (value.signal.length > 1) return style.bus(value.signal, value.conflict)
  return style.wire(value.digit, value.conflict)
}

function fillDot(ctx: CanvasRenderingContext2D, at: Point, radius: number, look: WireLook): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = look.color
  ctx.fill()
}

/** The smallest text worth drawing, in CSS pixels. */
export const MIN_TEXT_PX = 8.5

/**
 * How far small text may be enlarged to reach `MIN_TEXT_PX`. Text that would
 * need more is too small to read at this zoom and is left out instead, so it
 * does not crowd its neighbours.
 */
export const MAX_TEXT_BOOST = 1.6

/** The pixel size text is drawn at, or 0 to leave it out. */
export function textPixels(designed: number, floor: number): number {
  if (designed >= floor) return designed
  return designed * MAX_TEXT_BOOST >= floor ? floor : 0
}

/**
 * `MIN_TEXT_PX` in device pixels, for each context `renderScene` drew on.
 * Any other context, such as an icon's or an SVG export's, uses
 * `MIN_TEXT_PX` as it is.
 */
const textFloors = new WeakMap<CanvasRenderingContext2D, number>()

/**
 * Writes text centred on a point given in the current coordinates, upright
 * and at a real pixel size whatever rotation and scale are in effect. Text
 * smaller than `MIN_TEXT_PX` is enlarged a little or, when even that would
 * not make it readable, left out.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  size: number,
  color: string,
  halo?: string,
  family = FONT,
  align: CanvasTextAlign = 'center',
): void {
  const matrix = ctx.getTransform()
  const scale = Math.hypot(matrix.a, matrix.b)
  const x = matrix.a * at.x + matrix.c * at.y + matrix.e
  const y = matrix.b * at.x + matrix.d * at.y + matrix.f
  const pixels = textPixels(size * scale, textFloors.get(ctx) ?? MIN_TEXT_PX)
  if (pixels === 0) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `600 ${pixels}px ${family}`
  ctx.textAlign = align
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

/** Writes a value (a digit, a bus, a display reading) the way `drawText` does, in the value face. */
function drawValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  size: number,
  color: string,
  halo?: string,
): void {
  drawText(ctx, text, at, size, color, halo, VALUE_FONT)
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  face: SymbolFace,
  signal: Signal | undefined,
  style: ValueStyle | null,
  theme: CanvasTheme,
  outline: string,
): void {
  const { pos, reach } = face
  const wide = face.wide ?? reach
  ctx.beginPath()
  if (face.shape === 'round' && face.wide === undefined) ctx.arc(pos.x, pos.y, reach, 0, Math.PI * 2)
  else {
    const corner = face.shape === 'round' ? reach : 0.16
    ctx.roundRect(pos.x - wide, pos.y - reach, 2 * wide, 2 * reach, corner)
  }
  // Only a single digit has a color of its own; a bus is written out.
  const digit = signal?.length === 1 ? signal[0] : undefined
  const fill = digit === undefined ? null : (style?.fill(digit) ?? null)
  ctx.fillStyle = fill ?? theme.partFill
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = STROKE * 0.75
  ctx.stroke()
  if (signal === undefined) return
  if (digit === undefined) {
    const text = style ? style.label(signal) : formatSignal(signal)
    const size = Math.min(reach * 1.3, (2 * wide * 0.9) / (text.length * 0.6))
    drawValue(ctx, text, pos, size, theme.ink)
    return
  }
  const text = style ? style.text(digit) : digitChar(digit)
  const size = reach * (text.length > 1 ? 1.05 : 1.4)
  drawValue(ctx, text, pos, size, fill ? inkOn(fill) : theme.ink)
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
  drawValue(ctx, text, readout.digits, size, theme.ink)
  const value = digits ? numberValue(digits, radix) : 0
  const decimal = value === undefined ? 'no number' : `= ${value}`
  drawValue(ctx, decimal, readout.decimal, 0.62, theme.ink)
  ctx.globalAlpha /= digits ? 1 : 0.4
}

interface PartLook {
  readonly stroke: string
  readonly fill: string
  readonly lineWidth: number
}

/**
 * Draws one part where it stands: its outline, the writing on it, and its
 * face showing `faceSignal` (left blank when undefined).
 */
function drawPart(
  ctx: CanvasRenderingContext2D,
  symbol: ComponentSymbol,
  placement: Pick<DocComponent, 'pos' | 'rotation'>,
  look: PartLook,
  theme: CanvasTheme,
  style: ValueStyle | null,
  faceSignal: Signal | undefined,
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
  if (symbol.face) drawFace(ctx, symbol.face, faceSignal, style, theme, look.stroke)
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

/**
 * A frame: a quiet box, tinted only a little, with its title in the band
 * along the top. Its colors are the ink of the parts, never a value color
 * or the accent, unless it is selected. A selected frame shows the handle
 * that resizes it.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: DocComponent,
  selected: boolean,
  theme: CanvasTheme,
): void {
  const { x, y } = frame.pos
  const { x: w, y: h } = frame.size ?? FRAME_SIZE
  const alpha = ctx.globalAlpha
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 0.5)
  ctx.globalAlpha = alpha * 0.045
  ctx.fillStyle = theme.ink
  ctx.fill()
  ctx.globalAlpha = alpha * (selected ? 1 : 0.38)
  ctx.strokeStyle = selected ? theme.accent : theme.ink
  ctx.lineWidth = selected ? 0.1 : 0.07
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y + FRAME_TITLE)
  ctx.lineTo(x + w, y + FRAME_TITLE)
  ctx.globalAlpha = alpha * 0.18
  ctx.strokeStyle = theme.ink
  ctx.lineWidth = 0.06
  ctx.stroke()
  ctx.globalAlpha = alpha * 0.75
  drawText(ctx, frame.text ?? DEFAULT_FRAME, { x: x + 0.6, y: y + FRAME_TITLE / 2 }, 0.8, theme.ink, undefined, FONT, 'left')
  ctx.globalAlpha = alpha
  if (selected) {
    const side = 0.6
    ctx.beginPath()
    ctx.rect(x + w - side / 2, y + h - side / 2, side, side)
    ctx.fillStyle = theme.background
    ctx.fill()
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 0.08
    ctx.stroke()
  }
}

/** What a part's face shows before any simulation: only a constant has a value. */
function restingFace(type: string, params: Readonly<Record<string, number>>): Signal | undefined {
  return type === 'const' ? filled(params.width ?? 1, params.value) : undefined
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
  textFloors.set(ctx, MIN_TEXT_PX * pixelRatio)
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

  // Frames lie under everything else.
  for (const component of Object.values(doc.components)) {
    if (component.type === FRAME_TYPE) drawFrame(ctx, component, selection.has(component.id), theme)
  }

  const wiredPins = new Set<string>()
  // Where each bus gets its value written: beside its longest straight run.
  const busLabels = new Map<
    WireValue,
    { at: Point; length: number; level: boolean; format: BusFormat }
  >()
  for (const wire of Object.values(doc.wires)) {
    wiredPins.add(terminalKey(wire.from))
    wiredPins.add(terminalKey(wire.to))
    const path = wirePath(doc, wire)
    if (!path) continue
    ctx.globalAlpha = scene.cone && !scene.cone.wires.has(wire.id) ? FADED : 1
    if (selection.has(wire.id) || scene.critical?.wires.has(wire.id) || scene.cone?.ahead.has(wire.id)) {
      tracePath(ctx, path)
      ctx.strokeStyle = theme.accentSoft
      ctx.lineWidth = selection.has(wire.id) ? 0.6 : 0.8
      ctx.stroke()
    }
    if (scene.ghost?.onto === wire.id) {
      // The part carried in would go into this wire.
      tracePath(ctx, path)
      ctx.strokeStyle = theme.accentSoft
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
    const value = live.at(wire.from)
    const look = wireLook(style, value)
    strokeWire(ctx, path, look)
    const pulse = scene.pulse?.(wire.id)
    if (pulse) strokePulse(ctx, path, look, pulse, theme)
    if (value.signal.length > 1 && !value.mixed) {
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1]
        const to = path[i]
        const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
        const best = busLabels.get(value)
        if (best && best.length >= length) continue
        busLabels.set(value, {
          at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
          length,
          level: from.y === to.y,
          format: formatAt(doc, wire.from),
        })
      }
    }
  }

  ctx.globalAlpha = 1

  for (const branch of wireBranches(doc)) {
    const value = live.net(branch.net)
    const faded = scene.cone && !(branch.net !== undefined && scene.cone.nets.has(branch.net))
    ctx.globalAlpha = faded ? FADED : 1
    fillDot(ctx, branch.pos, JUNCTION_DOT, wireLook(style, value))
  }
  ctx.globalAlpha = 1

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
    ctx.globalAlpha = scene.cone && !scene.cone.junctions.has(junction.id) ? FADED : 1
    fillDot(ctx, junction.pos, radius, wireLook(style, value))
    ctx.globalAlpha = 1
  }

  for (const component of Object.values(doc.components)) {
    if (component.type === FRAME_TYPE) continue
    const symbol = symbolOf(component)
    const selected = selection.has(component.id)
    const outline = selected ? theme.accent : theme.ink
    // A rounded box `pad` units clear of the part, turned with it.
    const ring = (pad: number, radius: number, paint: () => void): void => {
      const { x0, y0, x1, y1 } = symbol.bounds
      ctx.save()
      ctx.translate(component.pos.x, component.pos.y)
      ctx.rotate((component.rotation * Math.PI) / 2)
      ctx.beginPath()
      ctx.roundRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, radius)
      paint()
      ctx.restore()
    }
    ctx.globalAlpha = scene.cone && !scene.cone.parts.has(component.id) ? FADED : 1
    if (selected || scene.cone?.ahead.has(component.id)) {
      ring(0.35, 0.4, () => {
        ctx.fillStyle = theme.accentSoft
        ctx.fill()
      })
    }
    if (scene.critical?.parts.has(component.id)) {
      // On the longest path: a dashed ring, so it reads apart from the
      // solid ring of a part a change is passing through.
      ring(0.5, 0.5, () => {
        ctx.setLineDash([0.35, 0.25])
        ctx.strokeStyle = theme.accent
        ctx.lineWidth = 0.12
        ctx.stroke()
      })
    }
    if (scene.active.has(component.id)) {
      // A change is passing through this part right now.
      ring(0.35, 0.4, () => {
        ctx.strokeStyle = theme.accent
        ctx.lineWidth = 0.16
        ctx.stroke()
      })
    }
    drawPart(
      ctx,
      symbol,
      component,
      { stroke: outline, fill: theme.partFill, lineWidth: STROKE },
      theme,
      style,
      live.faceSignal(component.id) ?? restingFace(component.type, component.params),
      // A net label carries its name inside.
      component.type === NET_TYPE ? undefined : component.label,
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
        // A bus has its value written along the wire instead.
        const driven = live.outputSignal(component.id, pin.name)
        if (driven.length === 1) {
          const text = style.text(driven[0])
          drawValue(ctx, text, at, text.length > 1 ? 0.6 : 0.72, theme.ink, theme.background)
        }
      }
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  for (const [value, label] of busLabels) {
    const text = style.label(value.signal, label.format)
    const at = label.level
      ? { x: label.at.x, y: label.at.y - 0.62 }
      : { x: label.at.x + 0.5 + text.length * 0.19, y: label.at.y }
    drawValue(ctx, text, at, 0.64, theme.ink, theme.background)
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

  if (scene.ghost?.type === FRAME_TYPE) {
    const { x, y } = scene.ghost.pos
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.roundRect(x, y, FRAME_SIZE.x, FRAME_SIZE.y, 0.5)
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = STROKE
    ctx.stroke()
    ctx.globalAlpha = 1
  } else if (scene.ghost) {
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

  if (scene.guides && scene.guides.length > 0) {
    // Hairlines that reach a little past what lines up, as in a drawing program.
    const reach = 1
    ctx.beginPath()
    for (const guide of scene.guides) {
      if (guide.axis === 'x') {
        ctx.moveTo(guide.at, guide.from - reach)
        ctx.lineTo(guide.at, guide.to + reach)
      } else {
        ctx.moveTo(guide.from - reach, guide.at)
        ctx.lineTo(guide.to + reach, guide.at)
      }
    }
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 1 / scale
    ctx.stroke()
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
  if (type === FRAME_TYPE) {
    // A box with the band of its title: the writing would be too small to read.
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1.5 / scale
    ctx.beginPath()
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 0.8)
    ctx.moveTo(x0, y0 + FRAME_TITLE * 1.4)
    ctx.lineTo(x1, y0 + FRAME_TITLE * 1.4)
    ctx.stroke()
    return
  }
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
