import { useState } from 'react'
import { useEditor } from '../editor/index.ts'
import type { Machine } from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { useChrome } from './chrome.ts'
import { inputCount, outputCount } from './parts.ts'

/** What a state machine is made of, in the language of the interface. */
function machineSize(machine: Machine): string {
  const values = {
    states: machine.states.length === 1 ? t('1 state') : t('{count} states', { count: machine.states.length }),
    rules: machine.rules.length === 1 ? t('1 rule') : t('{count} rules', { count: machine.rules.length }),
    inputs: inputCount(machine.inputs.length),
    outputs: outputCount(machine.outputs.length),
  }
  return machine.mealy
    ? t('A Mealy machine: {states}, {rules}, {inputs} and {outputs}.', values)
    : t('A Moore machine: {states}, {rules}, {inputs} and {outputs}.', values)
}

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
    <section className="machine-summary" aria-label={t('Machine')}>
      <p className="note">
        {machineSize(machine)} {t('It starts in {state}.', { state: machine.states[0].name })}
      </p>
      <div className="machine-actions">
        <button type="button" className="button" onClick={() => useChrome.getState().openMachine(id)}>
          {t('Edit machine')}
        </button>
        <button
          type="button"
          className="button"
          title={t('Make a new circuit of D flip-flops and gates that does the same')}
          onClick={build}
        >
          {t('Build from gates')}
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
