import type { ComponentDef } from '../component.ts'
import { MAX_WIDTH } from '../signal.ts'

/**
 * A place to look at a value: a lamp or a display. It drives nothing; the
 * editor reads what arrives at its input.
 */
export const outputSink: ComponentDef = {
  type: 'output',
  params: { width: { default: 1, min: 1, max: MAX_WIDTH } },
  ports({ width }) {
    return [{ name: 'in', direction: 'in', width }]
  },
  evaluate() {
    return { outputs: {} }
  },
}
