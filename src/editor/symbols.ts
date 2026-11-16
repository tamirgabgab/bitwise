import { builtinComponents, resolveParams } from '../core/index.ts'
import type { PortDirection } from '../core/index.ts'
import type { Point, Rect } from './geometry.ts'

/** A pin of a symbol, in the symbol's own unrotated coordinates. */
export interface PinGeometry {
  readonly name: string
  readonly direction: PortDirection
  /** The tip of the pin, where wires attach. Always on the grid. */
  readonly pos: Point
  /** Unit vector pointing away from the body. */
  readonly dir: Point
}

/**
 * How a component looks: where its pins are and how to draw it. A symbol
 * faces right: inputs on the left, outputs on the right, origin on the grid.
 */
export interface ComponentSymbol {
  readonly pins: readonly PinGeometry[]
  /** The area the symbol covers, pins included. */
  readonly bounds: Rect
  /**
   * Draws the symbol at the origin. The caller sets the stroke style, fill
   * style and line width first.
   */
  draw(ctx: CanvasRenderingContext2D): void
}

const LEFT: Point = { x: -1, y: 0 }
const RIGHT: Point = { x: 1, y: 0 }
const BUBBLE_RADIUS = 0.3

/**
 * Rows for n inputs, centred on 0 and one grid unit apart. An even count
 * skips the middle row, which is where the output sits.
 */
export function inputRows(count: number): number[] {
  const rows: number[] = []
  // "0 - half" instead of "-half" so a single row is 0 and never -0.
  if (count % 2 === 1) {
    const half = (count - 1) / 2
    for (let y = 0 - half; y <= half; y++) rows.push(y)
  } else {
    const half = count / 2
    for (let y = 0 - half; y <= half; y++) {
      if (y !== 0) rows.push(y)
    }
  }
  return rows
}

type GateShape = 'and' | 'or' | 'xor'

function gateSymbol(shape: GateShape, inputs: number, inverted: boolean): ComponentSymbol {
  const rows = inputRows(inputs)
  const half = Math.max(1.5, rows[rows.length - 1] + 0.5)
  // Where the back of the body is at height y, so input stubs end on it.
  const backX = (y: number): number => {
    if (shape === 'and') return -2
    const t = (1 - y / half) / 2
    return -2 + 1.6 * t * (1 - t) - (shape === 'xor' ? 0.5 : 0)
  }

  const pins: PinGeometry[] = rows.map((y, index) => ({
    name: `in${index}`,
    direction: 'in',
    pos: { x: -3, y },
    dir: LEFT,
  }))
  pins.push({ name: 'out', direction: 'out', pos: { x: 3, y: 0 }, dir: RIGHT })

  return {
    pins,
    bounds: { x0: -3, y0: -half, x1: 3, y1: half },
    draw(ctx) {
      ctx.beginPath()
      for (const y of rows) {
        ctx.moveTo(-3, y)
        ctx.lineTo(backX(y), y)
      }
      ctx.moveTo(inverted ? 2 + 2 * BUBBLE_RADIUS : 2, 0)
      ctx.lineTo(3, 0)
      ctx.stroke()

      ctx.beginPath()
      if (shape === 'and') {
        ctx.moveTo(-2, -half)
        ctx.lineTo(0, -half)
        ctx.ellipse(0, 0, 2, half, 0, -Math.PI / 2, Math.PI / 2)
        ctx.lineTo(-2, half)
      } else {
        ctx.moveTo(-2, -half)
        ctx.quadraticCurveTo(0.7, -half, 2, 0)
        ctx.quadraticCurveTo(0.7, half, -2, half)
        ctx.quadraticCurveTo(-1.2, 0, -2, -half)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      if (shape === 'xor') {
        ctx.beginPath()
        ctx.moveTo(-2.5, half)
        ctx.quadraticCurveTo(-1.7, 0, -2.5, -half)
        ctx.stroke()
      }
      if (inverted) {
        ctx.beginPath()
        ctx.arc(2 + BUBBLE_RADIUS, 0, BUBBLE_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    },
  }
}

/** The triangle of a buffer, with a bubble on its tip for an inverter. */
function unarySymbol(inverted: boolean): ComponentSymbol {
  return {
    pins: [
      { name: 'in', direction: 'in', pos: { x: -2, y: 0 }, dir: LEFT },
      { name: 'out', direction: 'out', pos: { x: 2, y: 0 }, dir: RIGHT },
    ],
    bounds: { x0: -2, y0: -1, x1: 2, y1: 1 },
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(-2, 0)
      ctx.lineTo(-1, 0)
      ctx.moveTo(inverted ? 1 + 2 * BUBBLE_RADIUS : 1, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(-1, -1)
      ctx.lineTo(1, 0)
      ctx.lineTo(-1, 1)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      if (inverted) {
        ctx.beginPath()
        ctx.arc(1 + BUBBLE_RADIUS, 0, BUBBLE_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    },
  }
}

/** An input source: a square housing with a round button in it. */
function inputSymbol(): ComponentSymbol {
  return {
    pins: [{ name: 'out', direction: 'out', pos: { x: 2, y: 0 }, dir: RIGHT }],
    bounds: { x0: -1, y0: -1, x1: 2, y1: 1 },
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.roundRect(-1, -1, 2, 2, 0.25)
      ctx.fill()
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(0, 0, 0.5, 0, Math.PI * 2)
      ctx.stroke()
    },
  }
}

/** A plain box for any component type that has no drawing of its own yet. */
function boxSymbol(type: string, params: Readonly<Record<string, number>>): ComponentSymbol {
  const def = builtinComponents.get(type)
  const ports = def.ports(resolveParams(def, params))
  const inputs = ports.filter((port) => port.direction === 'in')
  const outputs = ports.filter((port) => port.direction === 'out')
  const inRows = inputRows(Math.max(inputs.length, 1))
  const outRows = inputRows(Math.max(outputs.length, 1))
  const half = Math.max(1.5, inRows[inRows.length - 1] + 0.5, outRows[outRows.length - 1] + 0.5)

  const pins: PinGeometry[] = [
    ...inputs.map((port, index): PinGeometry => ({
      name: port.name,
      direction: 'in',
      pos: { x: -3, y: inRows[index] },
      dir: LEFT,
    })),
    ...outputs.map((port, index): PinGeometry => ({
      name: port.name,
      direction: 'out',
      pos: { x: 3, y: outRows[index] },
      dir: RIGHT,
    })),
  ]

  return {
    pins,
    bounds: { x0: -3, y0: -half, x1: 3, y1: half },
    draw(ctx) {
      ctx.beginPath()
      for (const pin of pins) {
        ctx.moveTo(pin.pos.x, pin.pos.y)
        ctx.lineTo(pin.pos.x - pin.dir.x, pin.pos.y)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.rect(-2, -half, 4, 2 * half)
      ctx.fill()
      ctx.stroke()
    },
  }
}

function buildSymbol(type: string, params: Readonly<Record<string, number>>): ComponentSymbol {
  switch (type) {
    case 'and':
      return gateSymbol('and', params.inputs, false)
    case 'nand':
      return gateSymbol('and', params.inputs, true)
    case 'or':
      return gateSymbol('or', params.inputs, false)
    case 'nor':
      return gateSymbol('or', params.inputs, true)
    case 'xor':
      return gateSymbol('xor', params.inputs, false)
    case 'xnor':
      return gateSymbol('xor', params.inputs, true)
    case 'not':
      return unarySymbol(true)
    case 'buffer':
      return unarySymbol(false)
    case 'input':
      return inputSymbol()
    default:
      return boxSymbol(type, params)
  }
}

const cache = new Map<string, ComponentSymbol>()

/** The symbol for a component type with the given (complete) parameters. */
export function symbolFor(
  type: string,
  params: Readonly<Record<string, number>>,
): ComponentSymbol {
  const key = `${type}:${JSON.stringify(params)}`
  let symbol = cache.get(key)
  if (!symbol) {
    symbol = buildSymbol(type, params)
    cache.set(key, symbol)
  }
  return symbol
}
