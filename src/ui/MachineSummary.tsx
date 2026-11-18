import { useState } from 'react'
import { useEditor } from '../editor/index.ts'
import type { Machine } from '../editor/index.ts'
import { useChrome } from './chrome.ts'

const count = (number: number, one: string, many: string): string => `${number} ${number === 1 ? one : many}`

/**
 * What the inspector says about a state machine: how large it is, and the
 * way into its editor and to a circuit of gates that does the same.
 */
export function MachineSummary({ id, machine }: { id: string; machine: Machine }) {
  const [problem, setProblem] = useState<string | null>(null)
  const build = (): void => {
    const result = useEditor.getState().machineToCircuit(id)
    setProblem('problem' in result ? result.problem : null)
  }
  return (
    <section className="machine-summary" aria-label="Machine">
      <p className="note">
        {count(machine.states.length, 'state', 'states')}, {count(machine.rules.length, 'rule', 'rules')},{' '}
        {count(machine.inputs.length, 'input', 'inputs')} and {count(machine.outputs.length, 'output', 'outputs')}.
        It starts in {machine.states[0].name}.
      </p>
      <div className="machine-actions">
        <button type="button" className="button" onClick={() => useChrome.getState().openMachine(id)}>
          Edit machine
        </button>
        <button
          type="button"
          className="button"
          title="Make a new circuit of D flip-flops and gates that does the same"
          onClick={build}
        >
          Build from gates
        </button>
      </div>
      {problem && (
        <p className="note" role="status">
          {problem}
        </p>
      )}
    </section>
  )
}
