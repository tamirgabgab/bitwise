import type { ComponentDef, ParamSpec } from '../component.ts'
import { MAX_RADIX, MAX_WIDTH, X, filled } from '../signal.ts'
import type { Signal } from '../signal.ts'

const widthParam: ParamSpec = { default: 1, min: 1, max: MAX_WIDTH }

/**
 * A source whose value is set from outside the circuit, through
 * `Simulator.setState`. It starts at 0. A digit the radix has no room for
 * reads as X.
 */
function settableSource(type: string): ComponentDef<Signal> {
  return {
    type,
    params: { width: widthParam },
    ports({ width }) {
      return [{ name: 'out', direction: 'out', width }]
    },
    initialState({ width }) {
      return filled(width, 0)
    },
    evaluate(_inputs, _params, state, { radix }) {
      return { outputs: { out: state.map((digit) => (digit < radix ? digit : X)) } }
    },
  }
}

/** A switch: it keeps the value it was last given. */
export const inputSource = settableSource('input')
/** A push button. The same source as a switch; the editor lets go of it. */
export const buttonSource = settableSource('button')

/** A source that always gives `value`, or X when the radix has no such digit. */
export const constSource: ComponentDef = {
  type: 'const',
  params: { value: { default: 1, min: 0, max: MAX_RADIX - 1 }, width: widthParam },
  ports({ width }) {
    return [{ name: 'out', direction: 'out', width }]
  },
  evaluate(_inputs, { value, width }, _state, { radix }) {
    return { outputs: { out: filled(width, value < radix ? value : X) } }
  },
}
