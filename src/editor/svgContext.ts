/*
 * A stand-in for a canvas drawing context that writes SVG instead of
 * painting. It knows the part of the canvas API that the renderer and the
 * symbols use, so a drawing is exported by painting it once more onto this.
 *
 * Shapes are written in page coordinates: every point goes through the
 * transform in effect when it is given, as on a canvas. The transforms the
 * renderer uses only move, turn and scale evenly, so a circle stays a circle
 * and one number scales every length.
 */

type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number]

interface State {
  matrix: Matrix
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: string
  lineJoin: string
  globalAlpha: number
  dash: readonly number[]
  font: string
  textAlign: string
  textBaseline: string
}

interface Spot {
  readonly x: number
  readonly y: number
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** A number as short as it can be written without losing what the eye sees. */
function num(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export class SvgContext {
  fillStyle = '#000000'
  strokeStyle = '#000000'
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  globalAlpha = 1
  font = '10px sans-serif'
  textAlign = 'start'
  textBaseline = 'alphabetic'

  private matrix: Matrix = IDENTITY
  private dash: readonly number[] = []
  private readonly stack: State[] = []
  private path: string[] = []
  /** Where the path is now, and where its current piece started. */
  private at: Spot | null = null
  private start: Spot | null = null
  private readonly out: string[] = []

  /** Everything drawn so far, as the inside of an `<svg>` element. */
  get body(): string {
    return this.out.join('\n')
  }

  // ---- State and transform ----

  save(): void {
    this.stack.push({
      matrix: this.matrix,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      dash: this.dash,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    })
  }

  restore(): void {
    const state = this.stack.pop()
    if (!state) return
    this.matrix = state.matrix
    this.dash = state.dash
    this.fillStyle = state.fillStyle
    this.strokeStyle = state.strokeStyle
    this.lineWidth = state.lineWidth
    this.lineCap = state.lineCap
    this.lineJoin = state.lineJoin
    this.globalAlpha = state.globalAlpha
    this.font = state.font
    this.textAlign = state.textAlign
    this.textBaseline = state.textBaseline
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.matrix = [a, b, c, d, e, f]
  }

  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.matrix
    return { a, b, c, d, e, f }
  }

  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.matrix
    this.matrix = [a, b, c, d, a * x + c * y + e, b * x + d * y + f]
  }

  rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.matrix
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    this.matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f]
  }

  setLineDash(dash: readonly number[]): void {
    this.dash = [...dash]
  }

  private get scale(): number {
    return Math.hypot(this.matrix[0], this.matrix[1])
  }

  /** The turn of the transform, in radians. */
  private get turn(): number {
    return Math.atan2(this.matrix[1], this.matrix[0])
  }

  private spot(x: number, y: number): Spot {
    const [a, b, c, d, e, f] = this.matrix
    return { x: a * x + c * y + e, y: b * x + d * y + f }
  }

  // ---- Paths ----

  beginPath(): void {
    this.path = []
    this.at = null
    this.start = null
  }

  private moveSpot(to: Spot): void {
    this.path.push(`M${num(to.x)} ${num(to.y)}`)
    this.at = to
    this.start = to
  }

  private lineSpot(to: Spot): void {
    if (!this.at) {
      this.moveSpot(to)
      return
    }
    this.path.push(`L${num(to.x)} ${num(to.y)}`)
    this.at = to
  }

  moveTo(x: number, y: number): void {
    this.moveSpot(this.spot(x, y))
  }

  lineTo(x: number, y: number): void {
    this.lineSpot(this.spot(x, y))
  }

  closePath(): void {
    if (!this.at) return
    this.path.push('Z')
    this.at = this.start
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.moveTo(x, y)
    this.lineTo(x + width, y)
    this.lineTo(x + width, y + height)
    this.lineTo(x, y + height)
    this.closePath()
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const control = this.spot(cx, cy)
    const to = this.spot(x, y)
    if (!this.at) this.moveSpot(control)
    this.path.push(`Q${num(control.x)} ${num(control.y)} ${num(to.x)} ${num(to.y)}`)
    this.at = to
  }

  arc(cx: number, cy: number, radius: number, from: number, to: number, counter = false): void {
    this.ellipse(cx, cy, radius, radius, 0, from, to, counter)
  }

  ellipse(
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    from: number,
    to: number,
    counter = false,
  ): void {
    const on = (angle: number): Spot => {
      const x = radiusX * Math.cos(angle)
      const y = radiusY * Math.sin(angle)
      const cos = Math.cos(rotation)
      const sin = Math.sin(rotation)
      return this.spot(cx + x * cos - y * sin, cy + x * sin + y * cos)
    }
    const full = 2 * Math.PI
    let sweep = counter ? from - to : to - from
    const whole = sweep >= full - 1e-9
    if (!whole) sweep = ((sweep % full) + full) % full
    const rx = num(radiusX * this.scale)
    const ry = num(radiusY * this.scale)
    const tilt = num(((rotation + this.turn) * 180) / Math.PI)
    const flag = counter ? 0 : 1
    this.lineSpot(on(from))
    const piece = (angle: number, large: boolean): void => {
      const end = on(angle)
      this.path.push(`A${rx} ${ry} ${tilt} ${large ? 1 : 0} ${flag} ${num(end.x)} ${num(end.y)}`)
      this.at = end
    }
    if (whole) {
      // One arc cannot go all the way round: SVG would draw nothing.
      const half = from + (counter ? -Math.PI : Math.PI)
      piece(half, false)
      piece(from, false)
    } else if (sweep > 1e-9) {
      piece(counter ? from - sweep : from + sweep, sweep > Math.PI)
    }
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    const corner = this.spot(x1, y1)
    const next = this.spot(x2, y2)
    const from = this.at ?? corner
    const r = radius * this.scale
    const ax = from.x - corner.x
    const ay = from.y - corner.y
    const bx = next.x - corner.x
    const by = next.y - corner.y
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    const cross = ax * by - ay * bx
    if (r <= 1e-9 || la < 1e-9 || lb < 1e-9 || Math.abs(cross) < 1e-9 * la * lb) {
      this.lineSpot(corner)
      return
    }
    const cos = (ax * bx + ay * by) / (la * lb)
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2
    const reach = r / Math.tan(half)
    const first = { x: corner.x + (ax / la) * reach, y: corner.y + (ay / la) * reach }
    const second = { x: corner.x + (bx / lb) * reach, y: corner.y + (by / lb) * reach }
    this.lineSpot(first)
    this.path.push(`A${num(r)} ${num(r)} 0 0 ${cross < 0 ? 1 : 0} ${num(second.x)} ${num(second.y)}`)
    this.at = second
  }

  roundRect(x: number, y: number, width: number, height: number, radius = 0): void {
    const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2))
    this.moveTo(x + r, y)
    this.arcTo(x + width, y, x + width, y + height, r)
    this.arcTo(x + width, y + height, x, y + height, r)
    this.arcTo(x, y + height, x, y, r)
    this.arcTo(x, y, x + width, y, r)
    this.closePath()
  }

  // ---- Painting ----

  private opacity(name: string): string {
    return this.globalAlpha < 1 ? ` ${name}="${num(this.globalAlpha)}"` : ''
  }

  fill(): void {
    if (this.path.length === 0) return
    this.out.push(
      `<path d="${this.path.join('')}" fill="${escapeXml(this.fillStyle)}"${this.opacity('fill-opacity')}/>`,
    )
  }

  stroke(): void {
    if (this.path.length === 0) return
    const scale = this.scale
    const dash =
      this.dash.length > 0
        ? ` stroke-dasharray="${this.dash.map((length) => num(length * scale)).join(' ')}"`
        : ''
    this.out.push(
      `<path d="${this.path.join('')}" fill="none" stroke="${escapeXml(this.strokeStyle)}" ` +
        `stroke-width="${num(this.lineWidth * scale)}" stroke-linecap="${this.lineCap}" ` +
        `stroke-linejoin="${this.lineJoin}"${dash}${this.opacity('stroke-opacity')}/>`,
    )
  }

  private keepingPath(draw: () => void): void {
    const { path, at, start } = this
    this.beginPath()
    draw()
    this.path = path
    this.at = at
    this.start = start
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.keepingPath(() => {
      this.rect(x, y, width, height)
      this.fill()
    })
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.keepingPath(() => {
      this.rect(x, y, width, height)
      this.stroke()
    })
  }

  clearRect(): void {
    // Nothing is painted until something is drawn, so there is nothing to clear.
  }

  private text(text: string, x: number, y: number, paint: string): void {
    const at = this.spot(x, y)
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10) * this.scale
    const weight = /^\s*(\d{3}|bold)\b/.exec(this.font)?.[1] ?? '400'
    const family = this.font.replace(/^.*?px\s*/, '')
    const anchor =
      this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start'
    const baseline = this.textBaseline === 'middle' ? ' dominant-baseline="central"' : ''
    this.out.push(
      `<text x="${num(at.x)}" y="${num(at.y)}" font-family="${escapeXml(family)}" ` +
        `font-size="${num(size)}" font-weight="${weight}" text-anchor="${anchor}"${baseline} ` +
        `${paint}>${escapeXml(text)}</text>`,
    )
  }

  fillText(text: string, x: number, y: number): void {
    this.text(text, x, y, `fill="${escapeXml(this.fillStyle)}"${this.opacity('fill-opacity')}`)
  }

  strokeText(text: string, x: number, y: number): void {
    this.text(
      text,
      x,
      y,
      `fill="none" stroke="${escapeXml(this.strokeStyle)}" ` +
        `stroke-width="${num(this.lineWidth * this.scale)}" stroke-linejoin="${this.lineJoin}"` +
        this.opacity('stroke-opacity'),
    )
  }
}
