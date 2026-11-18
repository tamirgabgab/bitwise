import { describe, expect, it } from 'vitest'
import { addComponent, addText, addWire, emptyDoc } from './document.ts'
import type { CircuitDoc, Terminal } from './document.ts'
import { readLiveValues } from './liveValues.ts'
import { DEFAULT_SETTINGS } from './project.ts'
import { SimBridge } from './simBridge.ts'
import { SvgContext } from './svgContext.ts'
import { circuitSvg } from './svgExport.ts'
import type { GateStyle } from './symbols.ts'
import type { CanvasTheme } from './theme.ts'
import { makeValueStyle } from './valueStyle.ts'

const pin = (component: string, port: string): Terminal => ({ kind: 'pin', component, port })

const THEME: CanvasTheme = {
  background: '#ffffff',
  gridDot: '#dddddd',
  ink: '#222222',
  partFill: '#fafafa',
  wire: '#555555',
  accent: '#d48806',
  accentSoft: '#fff1d6',
  signalLow: '#2f6f4f',
  signalHigh: '#3b82f6',
  signalHiz: '#999999',
  signalUnknown: '#cc3333',
}

/** Switch c1 "A" into NOT c2 into output c3, with a note beside them. */
function sample(): CircuitDoc {
  let doc = emptyDoc()
  doc = addComponent(doc, 'input', { x: 0, y: 0 }, { label: 'A' }).doc
  doc = addComponent(doc, 'not', { x: 10, y: 0 }).doc
  doc = addComponent(doc, 'output', { x: 20, y: 0 }).doc
  doc = addWire(doc, pin('c1', 'out'), pin('c2', 'in'))!.doc
  doc = addWire(doc, pin('c2', 'out'), pin('c3', 'in'))!.doc
  return addText(doc, { x: 10, y: -5 }, 'Turns A <around> & back').doc
}

function picture(doc: CircuitDoc, gates?: GateStyle): string {
  const bridge = new SimBridge()
  bridge.sync(doc, {})
  bridge.sim.settle()
  return circuitSvg(
    doc,
    THEME,
    makeValueStyle(DEFAULT_SETTINGS, THEME),
    readLiveValues(doc, bridge),
    gates,
  )
}

describe('circuitSvg', () => {
  it('writes a whole SVG picture, sized to the drawing', () => {
    const svg = picture(sample())
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    const [, width, height] = /width="(\d+)" height="(\d+)"/.exec(svg)!
    expect(Number(width)).toBeGreaterThan(Number(height))
    expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('draws the parts, the wires, the names and the notes', () => {
    const svg = picture(sample())
    expect(svg.match(/<path /g)!.length).toBeGreaterThan(8)
    expect(svg).toContain('>A</text>')
    expect(svg).toContain('Turns A &lt;around&gt; &amp; back')
  })

  it('draws gates in the style it is given', () => {
    const doc = addComponent(sample(), 'and', { x: 10, y: 8 }).doc
    expect(picture(doc)).not.toContain('>&amp;</text>')
    const iec = picture(doc, 'iec')
    expect(iec).toContain('>&amp;</text>')
    expect(iec).toContain('>1</text>')
  })

  it('leaves out the grid and anything that belongs to editing', () => {
    const svg = picture(sample())
    expect(svg).not.toContain(THEME.gridDot)
    expect(svg).not.toContain(THEME.accent)
  })

  it('keeps everything inside the picture', () => {
    const svg = picture(sample())
    const [, width, height] = /width="(\d+)" height="(\d+)"/.exec(svg)!
    for (const [, x, y] of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) {
      expect(Number(x)).toBeGreaterThan(0)
      expect(Number(x)).toBeLessThan(Number(width))
      expect(Number(y)).toBeGreaterThan(0)
      expect(Number(y)).toBeLessThan(Number(height))
    }
  })

  it('makes a small picture of an empty drawing', () => {
    expect(picture(emptyDoc())).toContain('<svg')
  })
})

describe('SvgContext', () => {
  it('writes points through the transform in effect', () => {
    const ctx = new SvgContext()
    ctx.setTransform(2, 0, 0, 2, 10, 20)
    ctx.translate(1, 1)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(3, 0)
    ctx.lineWidth = 0.5
    ctx.strokeStyle = '#123456'
    ctx.stroke()
    expect(ctx.body).toContain('d="M12 22L18 22"')
    expect(ctx.body).toContain('stroke-width="1"')
    expect(ctx.body).toContain('stroke="#123456"')
  })

  it('turns with rotate and comes back with restore', () => {
    const ctx = new SvgContext()
    ctx.save()
    ctx.rotate(Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(1, 0)
    ctx.lineTo(2, 0)
    ctx.stroke()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(1, 0)
    ctx.lineTo(2, 0)
    ctx.stroke()
    const [turned, plain] = ctx.body.split('\n')
    expect(turned).toContain('d="M0 1L0 2"')
    expect(plain).toContain('d="M1 0L2 0"')
  })

  it('draws a full circle as two arcs and a rounded corner as one', () => {
    const ctx = new SvgContext()
    ctx.beginPath()
    ctx.arc(5, 5, 2, 0, Math.PI * 2)
    ctx.fill()
    expect(ctx.body.match(/A2 2 0 0 1/g)).toHaveLength(2)
    const corner = new SvgContext()
    corner.beginPath()
    corner.moveTo(0, 0)
    corner.arcTo(10, 0, 10, 10, 2)
    corner.lineTo(10, 10)
    corner.stroke()
    expect(corner.body).toContain('M0 0L8 0A2 2 0 0 1 10 2L10 10')
  })

  it('scales dashes and keeps the path through fillRect', () => {
    const ctx = new SvgContext()
    ctx.setTransform(4, 0, 0, 4, 0, 0)
    ctx.setLineDash([1, 2])
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.fillRect(0, 0, 1, 1)
    ctx.lineTo(1, 1)
    ctx.stroke()
    expect(ctx.body).toContain('stroke-dasharray="4 8"')
    expect(ctx.body).toContain('d="M0 0L4 4"')
  })
})
