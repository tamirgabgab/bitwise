/*
 * Presentation steps. A step is a state of the circuit worth showing: what
 * every switch is on, and a line of explanation. A circuit keeps a list of
 * them, and stepping through the list walks an audience through the circuit.
 */

/**
 * What a switch is on: a digit, or for a switch on a bus its digits as
 * text, the most significant first.
 */
export type InputValue = number | string

/** The value as it came in, if a switch can be on it at this radix. */
export function cleanInputValue(value: unknown, radix: number): InputValue | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value < radix ? value : undefined
  }
  if (typeof value !== 'string' || !/^[0-9A-F]{2,64}$/.test(value)) return undefined
  return [...value].every((char) => Number.parseInt(char, 16) < radix) ? value : undefined
}

export interface Step {
  /** What the presenter wants to say at this step. */
  readonly note: string
  /** The value of each switch, by part id. */
  readonly inputs: Readonly<Record<string, InputValue>>
}

/** The most steps a circuit can keep. */
export const MAX_STEPS = 60

/** The longest note a step can have. */
export const MAX_NOTE = 200

export function cleanNote(note: unknown): string {
  return typeof note === 'string' ? note.replace(/\s+/g, ' ').slice(0, MAX_NOTE) : ''
}

/**
 * Steps that are safe to use, whatever came in: only values a switch of the
 * drawing can take at this radix are kept. `isSwitch` says which part ids
 * are switches.
 */
export function cleanSteps(
  value: unknown,
  isSwitch: (id: string) => boolean,
  radix: number,
): Step[] {
  if (!Array.isArray(value)) return []
  const steps: Step[] = []
  for (const item of value.slice(0, MAX_STEPS)) {
    if (typeof item !== 'object' || item === null) continue
    const given = (item as { inputs?: unknown }).inputs
    const inputs: Record<string, InputValue> = {}
    if (typeof given === 'object' && given !== null && !Array.isArray(given)) {
      for (const [id, raw] of Object.entries(given)) {
        if (!isSwitch(id)) continue
        const value = cleanInputValue(raw, radix)
        if (value !== undefined) inputs[id] = value
      }
    }
    steps.push({ note: cleanNote((item as { note?: unknown }).note).trim(), inputs })
  }
  return steps
}

/** The list with a new step put in after position `after`. */
export function insertStep(steps: readonly Step[], after: number, step: Step): Step[] {
  if (steps.length >= MAX_STEPS) return [...steps]
  const at = Math.max(0, Math.min(steps.length, after + 1))
  return [...steps.slice(0, at), step, ...steps.slice(at)]
}

/** The list with the step at `index` changed. */
export function changeStep(
  steps: readonly Step[],
  index: number,
  changes: Partial<Step>,
): readonly Step[] {
  if (index < 0 || index >= steps.length) return steps
  return steps.map((step, i) => (i === index ? { ...step, ...changes } : step))
}

/** The list without the step at `index`. */
export function removeStep(steps: readonly Step[], index: number): readonly Step[] {
  if (index < 0 || index >= steps.length) return steps
  return steps.filter((_step, i) => i !== index)
}
