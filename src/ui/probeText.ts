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
