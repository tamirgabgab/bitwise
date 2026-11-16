import type { ComponentDef } from '../component.ts'
import { Bit, MAX_WIDTH, filled } from '../signal.ts'
import type { Signal } from '../signal.ts'

/**
 * A source whose value is set from outside the circuit, through
 * `Simulator.setState`. It starts at 0. Switches and buttons build on it.
 */
export const inputSource: ComponentDef<Signal> = {
  type: 'input',
  params: { width: { default: 1, min: 1, max: MAX_WIDTH } },
  ports({ width }) {
    return [{ name: 'out', direction: 'out', width }]
  },
  initialState({ width }) {
    return filled(width, Bit.Low)
  },
  evaluate(_inputs, _params, state) {
    return { outputs: { out: state } }
  },
}
