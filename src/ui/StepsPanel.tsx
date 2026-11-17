import { useId } from 'react'
import {
  MAX_NOTE,
  MAX_STEPS,
  addStepHere,
  showStep,
  updateStepHere,
  useEditor,
} from '../editor/index.ts'
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
    <section className="steps" aria-label="Presentation steps">
      <h2>Steps</h2>
      <button
        type="button"
        className="tool"
        aria-label="Previous step"
        title="Previous step (Left arrow)"
        disabled={index <= 0}
        onClick={() => showStep(index - 1)}
      >
        <PreviousIcon />
      </button>
      <output className="steps-count" aria-live="polite">
        {count === 0 ? 'None yet' : `${index + 1} of ${count}`}
      </output>
      <button
        type="button"
        className="tool"
        aria-label="Next step"
        title="Next step (Right arrow)"
        disabled={index >= count - 1}
        onClick={() => showStep(index + 1)}
      >
        <NextIcon />
      </button>
      {step ? (
        <>
          <label className="steps-label" htmlFor={noteId}>
            Note
          </label>
          <input
            id={noteId}
            className="steps-note"
            value={step.note}
            maxLength={MAX_NOTE}
            placeholder="What this step shows"
            autoComplete="off"
            onChange={(event) => setStepNote(index, event.target.value)}
          />
        </>
      ) : (
        <p className="steps-hint">
          Set the switches the way you want to show them, then add a step. The arrow keys move
          from step to step.
        </p>
      )}
      <button
        type="button"
        className="button"
        title={
          full
            ? `A circuit keeps at most ${MAX_STEPS} steps`
            : 'Keep the switches as they are now as a new step'
        }
        disabled={full}
        onClick={addStepHere}
      >
        Add step
      </button>
      {step && (
        <>
          <button
            type="button"
            className="button"
            title="Put the switches as they are now into this step"
            onClick={updateStepHere}
          >
            Update step
          </button>
          <button
            type="button"
            className="tool"
            aria-label="Delete this step"
            title="Delete this step"
            onClick={() => deleteStep(index)}
          >
            <DeleteIcon />
          </button>
        </>
      )}
      <button
        type="button"
        className="tool"
        aria-label="Close the steps"
        title="Close the steps"
        onClick={() => setStepsOpen(false)}
      >
        <CloseIcon />
      </button>
    </section>
  )
}
