import { useId } from 'react'
import {
  MAX_NOTE,
  MAX_STEPS,
  addStepHere,
  showStep,
  updateStepHere,
  useEditor,
} from '../editor/index.ts'
import { t } from '../i18n/index.ts'
import { ask } from './dialogs.ts'
import { CloseIcon, DeleteIcon, NextIcon, PreviousIcon } from './icons.tsx'

/**
 * The presentation steps of the open circuit: saved states of its switches,
 * each with a note, to walk an audience through what the circuit does.
 */
export function StepsPanel() {
  const open = useEditor((state) => state.stepsOpen)
  const steps = useEditor((state) => state.circuits[state.active].steps)
  const index = useEditor((state) => state.stepIndex)
  const noteId = useId()
  if (!open) return null

  const count = steps?.length ?? 0
  const step = steps?.[index]
  const { setStepNote, deleteStep, setStepsOpen } = useEditor.getState()
  const full = count >= MAX_STEPS

  return (
    <section className="steps" aria-label={t('Presentation steps')}>
      <h2>{t('Steps')}</h2>
      <button
        type="button"
        className="tool"
        aria-label={t('Previous step')}
        title={t('Previous step (Left arrow)')}
        disabled={index <= 0}
        onClick={() => showStep(index - 1)}
      >
        <PreviousIcon />
      </button>
      <output className="steps-count" aria-live="polite">
        {count === 0 ? t('None yet') : t('{index} of {count}', { index: index + 1, count })}
      </output>
      <button
        type="button"
        className="tool"
        aria-label={t('Next step')}
        title={t('Next step (Right arrow)')}
        disabled={index >= count - 1}
        onClick={() => showStep(index + 1)}
      >
        <NextIcon />
      </button>
      {step ? (
        <>
          <label className="steps-label" htmlFor={noteId}>
            {t('Note')}
          </label>
          <input
            id={noteId}
            className="steps-note"
            value={step.note}
            maxLength={MAX_NOTE}
            placeholder={t('What this step shows')}
            autoComplete="off"
            onChange={(event) => setStepNote(index, event.target.value)}
          />
        </>
      ) : (
        <p className="steps-hint">
          {t(
            'Set the switches the way you want to show them, then add a step. The arrow keys move from step to step.',
          )}
        </p>
      )}
      <button
        type="button"
        className="button"
        title={
          full
            ? t('A circuit keeps at most {max} steps', { max: MAX_STEPS })
            : t('Keep the switches as they are now as a new step')
        }
        disabled={full}
        onClick={addStepHere}
      >
        {t('Add step')}
      </button>
      {step && (
        <>
          <button
            type="button"
            className="button"
            title={t('Put the switches as they are now into this step')}
            onClick={updateStepHere}
          >
            {t('Update step')}
          </button>
          <button
            type="button"
            className="tool"
            aria-label={t('Delete this step')}
            title={t('Delete this step')}
            onClick={() => {
              // Steps are not part of undo, so a delete is asked about first.
              void ask({
                title: t('Delete step {number}?', { number: index + 1 }),
                body: t('Its note and the switch values it holds go with it. This cannot be undone.'),
                confirm: t('Delete step'),
                cancel: t('Keep it'),
                danger: true,
              }).then((yes) => {
                if (yes) deleteStep(index)
              })
            }}
          >
            <DeleteIcon />
          </button>
        </>
      )}
      <button
        type="button"
        className="tool"
        aria-label={t('Close the steps')}
        title={t('Close the steps')}
        onClick={() => setStepsOpen(false)}
      >
        <CloseIcon />
      </button>
    </section>
  )
}
