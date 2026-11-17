import type { ProbedPin } from '../editor/index.ts'
import { partName } from './parts.ts'

/** How a pin on a wire is named to the user: by its part, and where it sits. */
export function pinName(pin: ProbedPin): string {
  let name = pin.label ? `${partName(pin.type)} ${pin.label}` : partName(pin.type)
  // A part with one output needs no pin name; a flip-flop has two.
  if (pin.port !== 'out' && pin.port !== 'in') name += `, pin ${pin.port.toUpperCase()}`
  if (pin.inside) name += `, inside ${pin.inside}`
  return name
}

/** How a port is named in the inspector: `in2` as In 2, `nq` as Q̄, `clk` as Clock. */
export function portLabel(port: string): string {
  if (port === 'nq') return 'Q\u0305'
  if (port === 'clk') return 'Clock'
  if (port === 'in' || port === 'out') return port === 'in' ? 'In' : 'Out'
  const numbered = /^([a-z]+)(\d+)$/.exec(port)
  if (numbered) return `${numbered[1][0].toUpperCase()}${numbered[1].slice(1)} ${numbered[2]}`
  return port.length <= 2 ? port.toUpperCase() : port[0].toUpperCase() + port.slice(1)
}
