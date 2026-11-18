/*
 * Draws the pictures of the README into docs/pictures, with the same code
 * that draws the canvas and exports SVG. Run it again after a change to how
 * circuits look: `npm run pictures`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { addComponent, emptyDoc } from '../src/editor/document.ts'
import type { CircuitDoc } from '../src/editor/document.ts'
import { EXAMPLES } from '../src/editor/examples.ts'
import { readLiveValues } from '../src/editor/liveValues.ts'
import { DEFAULT_SETTINGS, fromProjectData } from '../src/editor/project.ts'
import type { Project, ProjectSettings } from '../src/editor/project.ts'
import { SimBridge } from '../src/editor/simBridge.ts'
import { circuitSvg } from '../src/editor/svgExport.ts'
import type { CanvasTheme } from '../src/editor/theme.ts'
import { makeValueStyle } from '../src/editor/valueStyle.ts'

/** The light theme of `src/index.css`. */
const THEME: CanvasTheme = {
  background: '#fcfdfc',
  gridDot: '#c2cbc7',
  ink: '#1c2925',
  partFill: '#ffffff',
  wire: '#33433e',
  accent: '#b86e00',
  accentSoft: 'rgba(224, 150, 20, 0.26)',
  signalLow: '#16201c',
  signalHigh: '#d92d34',
  signalHiz: '#1f9d55',
  signalUnknown: '#2f6fed',
}

const OUT = new URL('../docs/pictures/', import.meta.url)

interface Shot {
  /** The circuit to draw, by name; the open one when left out. */
  readonly circuit?: string
  /** What to put on the switches, by the name written on them. */
  readonly inputs?: Readonly<Record<string, string>>
  /** How long to let the circuit run. */
  readonly ticks?: number
}

function draw(doc: CircuitDoc, project: Pick<Project, 'circuits'>, settings: ProjectSettings, shot: Shot): string {
  const bridge = new SimBridge()
  bridge.sim.setRadix(settings.radix)
  bridge.sync(doc, project.circuits)
  for (const part of Object.values(doc.components)) {
    const value = part.label === undefined ? undefined : shot.inputs?.[part.label]
    if (part.type === 'input' && value !== undefined && !bridge.setInput(part.id, value)) {
      throw new Error(`Cannot put ${value} on ${part.label}`)
    }
  }
  bridge.sim.run(shot.ticks ?? 200)
  return circuitSvg(doc, THEME, makeValueStyle(settings, THEME), readLiveValues(doc, bridge))
}

function example(id: string, shot: Shot = {}): string {
  const project = fromProjectData(EXAMPLES.find((item) => item.id === id)!.build())
  const circuit = shot.circuit
    ? Object.values(project.circuits).find((item) => item.name === shot.circuit)!
    : project.circuits[project.active]
  return draw(circuit.doc, project, project.settings, shot)
}

/** A row of the larger parts, as they come out of the palette. */
function parts(): string {
  let doc = emptyDoc()
  let x = 0
  for (const type of ['dff', 'mux', 'adder', 'counter', 'rom', 'fsm']) {
    doc = addComponent(doc, type, { x, y: 0 }).doc
    x += 12
  }
  return draw(doc, { circuits: {} }, DEFAULT_SETTINGS, { ticks: 1 })
}

const pictures: Record<string, string> = {
  'half-adder': example('binary-adder', { circuit: 'Half adder', inputs: { A: '1', B: '0' } }),
  'ternary-gates': example('ternary-gates', { inputs: { A: '1', B: '2' } }),
  'ternary-counter': example('ternary-counter', { ticks: 330 }),
  'bus-adder': example('bus-adder', { inputs: { A: '0101', B: '0011' } }),
  parts: parts(),
}

mkdirSync(OUT, { recursive: true })
for (const [name, svg] of Object.entries(pictures)) {
  writeFileSync(new URL(`${name}.svg`, OUT), svg)
  console.log(`docs/pictures/${name}.svg`)
}
