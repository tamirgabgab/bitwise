import { builtinComponents } from '../core/index.ts'
import type { CircuitDoc, Terminal } from './document.ts'

/**
 * How many digits a pin of the drawing carries. Undefined for a junction,
 * and for a pin of a named circuit, whose width is set inside that circuit.
 */
export function pinWidth(doc: CircuitDoc, terminal: Terminal): number | undefined {
  if (terminal.kind !== 'pin') return undefined
  const component = doc.components[terminal.component]
  if (!component || !builtinComponents.has(component.type)) return undefined
  return builtinComponents
    .get(component.type)
    .ports(component.params)
    .find((port) => port.name === terminal.port)?.width
}

/** The width of the wire a group of terminals sits on: that of its first known pin. */
export function widthOf(doc: CircuitDoc, terminals: readonly Terminal[]): number {
  for (const terminal of terminals) {
    const width = pinWidth(doc, terminal)
    if (width !== undefined) return width
  }
  return 1
}
