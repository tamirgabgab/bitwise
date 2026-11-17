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
  /** Writing on the body. The renderer keeps it upright when the part turns. */
  readonly label?: SymbolLabel
  /** A patch that shows a live value: the face of a switch, a lamp. */
  readonly face?: SymbolFace
  /** More writing on the body, such as the pin names of a named circuit. */
  readonly notes?: readonly SymbolLabel[]
  /** Where a number display writes the number that reaches it. */
  readonly readout?: SymbolReadout
}

export interface SymbolReadout {
  /** The pins that carry the digits, least significant first. */
  readonly pins: readonly string[]
  /** The middle of the digits, written in the circuit's radix. */
  readonly digits: Point
  /** The middle of the same number written in decimal, smaller. */
  readonly decimal: Point
  /** Height of the digits, in grid units. */
  readonly size: number
}

/** The type of a part that stands for a named circuit. */
export const SUB_TYPE = 'circuit'

/** The type of a part that is only writing on the canvas. */
export const TEXT_TYPE = 'text'

/** What a new text label says. */
export const DEFAULT_TEXT = 'Text'

/** Height of the writing of a text label, in grid units. */
const TEXT_SIZE = 0.95

/** One pin of a named circuit, as a part that stands for it shows it. */
export interface SubPin {
  /** The port name: the id of the switch or output inside the circuit. */
  readonly port: string
  readonly label: string
}

/** What a part that stands for a named circuit knows about that circuit. */
export interface SubRef {
  /** Id of the circuit. */
  readonly circuit: string
  readonly name: string
  readonly inputs: readonly SubPin[]
  readonly outputs: readonly SubPin[]
}

export interface SymbolLabel {
  readonly text: string
  /** A value written after the text, in the project's way of writing values. */
  readonly digit?: number
  readonly pos: Point
  /** Height of the writing, in grid units. */
  readonly size: number
}

export interface SymbolFace {
  readonly shape: 'round' | 'square'
  readonly pos: Point
  /** Half the width of the patch. */
  readonly reach: number
}

const LEFT: Point = { x: -1, y: 0 }
const RIGHT: Point = { x: 1, y: 0 }
const UP: Point = { x: 0, y: -1 }
const DOWN: Point = { x: 0, y: 1 }
/** Q with a bar over it: the mirrored output of a latch or flip-flop. */
const Q_BAR = 'Q\u0305'
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

/**
 * A source set by hand: a square housing around a face that shows its value.
 * A switch has a square face, a push button a round one.
 */
function sourceSymbol(face: SymbolFace['shape']): ComponentSymbol {
  return {
    pins: [{ name: 'out', direction: 'out', pos: { x: 2, y: 0 }, dir: RIGHT }],
    bounds: { x0: -1, y0: -1, x1: 2, y1: 1 },
    face: { shape: face, pos: { x: 0, y: 0 }, reach: 0.64 },
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.roundRect(-1, -1, 2, 2, 0.25)
      ctx.fill()
      ctx.stroke()
    },
  }
}

/** A constant: a tag pointing at its output, with the value on it. */
function constSymbol(): ComponentSymbol {
  return {
    pins: [{ name: 'out', direction: 'out', pos: { x: 2, y: 0 }, dir: RIGHT }],
    bounds: { x0: -1, y0: -1, x1: 2, y1: 1 },
    face: { shape: 'square', pos: { x: -0.25, y: 0 }, reach: 0.5 },
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(-1, -0.85)
      ctx.lineTo(0.35, -0.85)
      ctx.lineTo(1, 0)
      ctx.lineTo(0.35, 0.85)
      ctx.lineTo(-1, 0.85)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    },
  }
}

/** A lamp: a round body that takes the color of the value it is shown. */
function outputSymbol(): ComponentSymbol {
  return {
    pins: [{ name: 'in', direction: 'in', pos: { x: -2, y: 0 }, dir: LEFT }],
    bounds: { x0: -2, y0: -1, x1: 1, y1: 1 },
    face: { shape: 'round', pos: { x: 0, y: 0 }, reach: 0.72 },
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(-2, 0)
      ctx.lineTo(-1, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    },
  }
}

/**
 * A one-input gate with something written on it: a wide triangle for Shift,
 * a rounded bar for an IS detector.
 */
function taggedSymbol(shape: 'triangle' | 'bar', label: SymbolLabel): ComponentSymbol {
  const half = shape === 'triangle' ? 1.5 : 1
  return {
    pins: [
      { name: 'in', direction: 'in', pos: { x: -3, y: 0 }, dir: LEFT },
      { name: 'out', direction: 'out', pos: { x: 2, y: 0 }, dir: RIGHT },
    ],
    bounds: { x0: -3, y0: -half, x1: 2, y1: half },
    label,
    draw(ctx) {
      ctx.beginPath()
      ctx.moveTo(-3, 0)
      ctx.lineTo(-2, 0)
      ctx.moveTo(1, 0)
      ctx.lineTo(2, 0)
      ctx.stroke()

      ctx.beginPath()
      if (shape === 'triangle') {
        ctx.moveTo(-2, -half)
        ctx.lineTo(1, 0)
        ctx.lineTo(-2, half)
        ctx.closePath()
      } else {
        ctx.roundRect(-2, -half, 3, 2 * half, half)
      }
      ctx.fill()
      ctx.stroke()
    },
  }
}

/** A gate with 2 to 8 inputs drawn as a rounded box with its operator on it. */
function operatorSymbol(inputs: number, operator: string): ComponentSymbol {
  const rows = inputRows(inputs)
  const half = Math.max(1.5, rows[rows.length - 1] + 0.5)
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
    label: { text: operator, pos: { x: 0, y: 0 }, size: 1.5 },
    draw(ctx) {
      ctx.beginPath()
      for (const y of rows) {
        ctx.moveTo(-3, y)
        ctx.lineTo(-2, y)
      }
      ctx.moveTo(2, 0)
      ctx.lineTo(3, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.roundRect(-2, -half, 4, 2 * half, 0.6)
      ctx.fill()
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

/** A clock: the housing of a source with a square wave on it. */
function clockSymbol(): ComponentSymbol {
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
      ctx.moveTo(-0.6, 0.35)
      ctx.lineTo(-0.3, 0.35)
      ctx.lineTo(-0.3, -0.35)
      ctx.lineTo(0.15, -0.35)
      ctx.lineTo(0.15, 0.35)
      ctx.lineTo(0.6, 0.35)
      ctx.stroke()
    },
  }
}

/** A cycling switch: the housing of a source with a staircase on it. */
function cycleSymbol(): ComponentSymbol {
  const clock = clockSymbol()
  return {
    pins: clock.pins,
    bounds: clock.bounds,
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
      ctx.moveTo(-0.65, 0.45)
      ctx.lineTo(-0.22, 0.45)
      ctx.lineTo(-0.22, 0)
      ctx.lineTo(0.22, 0)
      ctx.lineTo(0.22, -0.45)
      ctx.lineTo(0.65, -0.45)
      ctx.stroke()
    },
  }
}

/**
 * A part that turns a digit into bits or bits into a digit: a box with the
 * digit on one side and the bits on the other, each bit marked with what it
 * is worth. Bit 0 is on top, like the lowest digit of a number display.
 */
function converterSymbol(bits: number, toBits: boolean): ComponentSymbol {
  const rows = inputRows(bits)
  const half = Math.max(1.5, rows[rows.length - 1] + 0.5)
  const side = toBits ? 1 : -1
  const bitPins = rows.map((y, index): PinGeometry => ({
    name: `b${index}`,
    direction: toBits ? 'out' : 'in',
    pos: { x: 3 * side, y },
    dir: toBits ? RIGHT : LEFT,
  }))
  const digitPin: PinGeometry = toBits
    ? { name: 'in', direction: 'in', pos: { x: -3, y: 0 }, dir: LEFT }
    : { name: 'out', direction: 'out', pos: { x: 3, y: 0 }, dir: RIGHT }
  const pins = toBits ? [digitPin, ...bitPins] : [...bitPins, digitPin]

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
    label: { text: 'n', pos: { x: -1.25 * side, y: 0 }, size: 0.9 },
    notes: rows.map((y, index) => ({
      text: String(2 ** index),
      pos: { x: 1.4 * side, y },
      size: 0.6,
    })),
  }
}

/** One labelled pin on the left or right side of a memory part. */
interface SidePin {
  readonly name: string
  readonly text: string
  readonly y: number
  /** A clock input: marked with a small triangle instead of a name. */
  readonly clock?: boolean
}

/**
 * A latch or flip-flop: a box with its inputs on the left and Q and its
 * mirror on the right. A flip-flop also has Set on top and Reset below.
 */
function memorySymbol(inputs: readonly SidePin[], half: number, async: boolean): ComponentSymbol {
  const pins: PinGeometry[] = [
    ...inputs.map((pin): PinGeometry => ({
      name: pin.name,
      direction: 'in',
      pos: { x: -3, y: pin.y },
      dir: LEFT,
    })),
    { name: 'q', direction: 'out', pos: { x: 3, y: 1 - half }, dir: RIGHT },
    { name: 'nq', direction: 'out', pos: { x: 3, y: half - 1 }, dir: RIGHT },
  ]
  const notes: SymbolLabel[] = [
    ...inputs
      .filter((pin) => !pin.clock)
      .map((pin): SymbolLabel => ({ text: pin.text, pos: { x: -1.35, y: pin.y }, size: 0.72 })),
    { text: 'Q', pos: { x: 1.35, y: 1 - half }, size: 0.72 },
    { text: Q_BAR, pos: { x: 1.35, y: half - 1 }, size: 0.72 },
  ]
  if (async) {
    pins.push(
      { name: 'set', direction: 'in', pos: { x: 0, y: 0 - half - 1 }, dir: UP },
      { name: 'reset', direction: 'in', pos: { x: 0, y: half + 1 }, dir: DOWN },
    )
    notes.push(
      { text: 'S', pos: { x: 0, y: 0.62 - half }, size: 0.6 },
      { text: 'R', pos: { x: 0, y: half - 0.62 }, size: 0.6 },
    )
  }
  const reach = async ? half + 1 : half

  return {
    pins,
    notes,
    bounds: { x0: -3, y0: 0 - reach, x1: 3, y1: reach },
    draw(ctx) {
      ctx.beginPath()
      for (const pin of pins) {
        ctx.moveTo(pin.pos.x, pin.pos.y)
        ctx.lineTo(pin.pos.x - pin.dir.x, pin.pos.y - pin.dir.y)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(-2, 0 - half, 4, 2 * half, 0.3)
      ctx.fill()
      ctx.stroke()
      for (const pin of inputs) {
        if (!pin.clock) continue
        ctx.beginPath()
        ctx.moveTo(-2, pin.y - 0.45)
        ctx.lineTo(-1.3, pin.y)
        ctx.lineTo(-2, pin.y + 0.45)
        ctx.stroke()
      }
    },
  }
}

const CLOCK_PIN = { name: 'clk', text: '', clock: true } as const

/**
 * A number display: a screen with one input per digit down its left side,
 * the least significant on top.
 */
function displaySymbol(digits: number): ComponentSymbol {
  const first = 0 - Math.floor((digits - 1) / 2)
  const rows = Array.from({ length: digits }, (_, index) => first + index)
  const top = Math.min(first - 1, -2)
  const bottom = Math.max(rows[rows.length - 1] + 1, 2)
  const middle = (top + bottom) / 2
  const pins: PinGeometry[] = rows.map((y, index) => ({
    name: `in${index}`,
    direction: 'in',
    pos: { x: -4, y },
    dir: LEFT,
  }))

  return {
    pins,
    bounds: { x0: -4, y0: top, x1: 4, y1: bottom },
    notes: rows.map((y, index): SymbolLabel => ({
      text: String(index),
      pos: { x: -2.55, y },
      size: 0.5,
    })),
    readout: {
      pins: pins.map((pin) => pin.name),
      digits: { x: 1, y: middle - 0.4 },
      decimal: { x: 1, y: middle + 0.85 },
      size: 1.15,
    },
    draw(ctx) {
      ctx.beginPath()
      for (const pin of pins) {
        ctx.moveTo(pin.pos.x, pin.pos.y)
        ctx.lineTo(-3, pin.pos.y)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(-3, top, 7, bottom - top, 0.3)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-2.1, top)
      ctx.lineTo(-2.1, bottom)
      ctx.stroke()
    },
  }
}

function buildSymbol(type: string, params: Readonly<Record<string, number>>): ComponentSymbol {
  switch (type) {
    case 'clock':
      return clockSymbol()
    case 'cycle':
      return cycleSymbol()
    case 'tobits':
      return converterSymbol(params.bits, true)
    case 'frombits':
      return converterSymbol(params.bits, false)
    case 'sr':
      return memorySymbol(
        [
          { name: 's', text: 'S', y: -1 },
          { name: 'r', text: 'R', y: 1 },
        ],
        2,
        false,
      )
    case 'dff':
      return memorySymbol([{ name: 'd', text: 'D', y: -1 }, { ...CLOCK_PIN, y: 1 }], 2, true)
    case 'tff':
      return memorySymbol([{ name: 't', text: 'T', y: -1 }, { ...CLOCK_PIN, y: 1 }], 2, true)
    case 'jkff':
      return memorySymbol(
        [
          { name: 'j', text: 'J', y: -2 },
          { ...CLOCK_PIN, y: 0 },
          { name: 'k', text: 'K', y: 2 },
        ],
        3,
        true,
      )
    case 'display':
      return displaySymbol(params.digits)
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
    case 'shift':
      return taggedSymbol('triangle', {
        text: `+${params.by}`,
        pos: { x: -1.1, y: 0 },
        size: 0.85,
      })
    case 'is':
      return taggedSymbol('bar', {
        text: '=',
        digit: params.match,
        pos: { x: -0.5, y: 0 },
        size: 0.95,
      })
    case 'add':
      return operatorSymbol(params.inputs, '+')
    case 'mul':
      return operatorSymbol(params.inputs, '×')
    case 'input':
      return sourceSymbol('square')
    case 'button':
      return sourceSymbol('round')
    case 'const':
      return constSymbol()
    case 'output':
      return outputSymbol()
    default:
      return boxSymbol(type, params)
  }
}

/** Shortens writing that would not fit, marking the cut. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * A named circuit used as a part: a box with the circuit's name on top, its
 * inputs down the left side and its outputs down the right.
 */
function chipSymbol(sub: SubRef): ComponentSymbol {
  const inRows = inputRows(Math.max(sub.inputs.length, 1))
  const outRows = inputRows(Math.max(sub.outputs.length, 1))
  const half = Math.max(1, inRows[inRows.length - 1], outRows[outRows.length - 1]) + 0.5
  // The name gets a strip of its own above the pin rows.
  const top = 0 - half - 1.5

  const pins: PinGeometry[] = [
    ...sub.inputs.map((pin, index): PinGeometry => ({
      name: pin.port,
      direction: 'in',
      pos: { x: -5, y: inRows[index] },
      dir: LEFT,
    })),
    ...sub.outputs.map((pin, index): PinGeometry => ({
      name: pin.port,
      direction: 'out',
      pos: { x: 5, y: outRows[index] },
      dir: RIGHT,
    })),
  ]
  const notes: SymbolLabel[] = [
    { text: clip(sub.name, 14), pos: { x: 0, y: top + 0.8 }, size: 0.78 },
    ...sub.inputs.map((pin, index): SymbolLabel => ({
      text: clip(pin.label, 5),
      pos: { x: -2.9, y: inRows[index] },
      size: 0.6,
    })),
    ...sub.outputs.map((pin, index): SymbolLabel => ({
      text: clip(pin.label, 5),
      pos: { x: 2.9, y: outRows[index] },
      size: 0.6,
    })),
  ]

  return {
    pins,
    notes,
    bounds: { x0: -5, y0: top, x1: 5, y1: half },
    draw(ctx) {
      ctx.beginPath()
      for (const pin of pins) {
        ctx.moveTo(pin.pos.x, pin.pos.y)
        ctx.lineTo(pin.pos.x - pin.dir.x, pin.pos.y)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(-4, top, 8, half - top, 0.3)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-4, top + 1.5)
      ctx.lineTo(4, top + 1.5)
      ctx.stroke()
    },
  }
}

/**
 * A text label: writing with no pins. The box is a guess at the width of the
 * writing, wide enough to select and drag it by.
 */
function textSymbol(text: string): ComponentSymbol {
  const half = Math.max(1, Math.ceil((text.length * TEXT_SIZE * 0.56) / 2 + 0.3))
  return {
    pins: [],
    notes: [{ text, pos: { x: 0, y: 0 }, size: TEXT_SIZE }],
    bounds: { x0: 0 - half, y0: -0.8, x1: half, y1: 0.8 },
    draw() {},
  }
}

const texts = new Map<string, ComponentSymbol>()

const UNKNOWN_CIRCUIT: SubRef = { circuit: '', name: '?', inputs: [], outputs: [] }
const chips = new WeakMap<SubRef, ComponentSymbol>()

/** The symbol of a part of the drawing, whether built in or a named circuit. */
export function symbolOf(part: {
  readonly type: string
  readonly params: Readonly<Record<string, number>>
  readonly sub?: SubRef
  readonly text?: string
}): ComponentSymbol {
  if (part.type === TEXT_TYPE) {
    const text = part.text ?? DEFAULT_TEXT
    let symbol = texts.get(text)
    if (!symbol) {
      symbol = textSymbol(text)
      texts.set(text, symbol)
    }
    return symbol
  }
  if (part.type !== SUB_TYPE) return symbolFor(part.type, part.params)
  const sub = part.sub ?? UNKNOWN_CIRCUIT
  let symbol = chips.get(sub)
  if (!symbol) {
    symbol = chipSymbol(sub)
    chips.set(sub, symbol)
  }
  return symbol
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
