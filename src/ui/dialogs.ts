import { create } from 'zustand'

/** A question put to the user in a window over the app, or a plain message. */
export interface DialogRequest {
  readonly title: string
  /** One paragraph per line. */
  readonly body: string
  /** What the main button says, as the action it performs. */
  readonly confirm: string
  /** The button that backs out. A message without a choice leaves it out. */
  readonly cancel?: string
  /** The main button destroys something that cannot be brought back. */
  readonly danger?: boolean
}

interface OpenDialog extends DialogRequest {
  resolve(answer: boolean): void
}

export const useDialog = create<{ open: OpenDialog | null }>()(() => ({ open: null }))

/**
 * Shows a dialog and resolves with true when the user picks the main button,
 * false when they back out. A dialog that is already open counts as backed
 * out of.
 */
export function ask(request: DialogRequest): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.getState().open?.resolve(false)
    useDialog.setState({ open: { ...request, resolve } })
  })
}

/** Closes the open dialog with the user's choice. */
export function answerDialog(answer: boolean): void {
  const { open } = useDialog.getState()
  if (!open) return
  useDialog.setState({ open: null })
  open.resolve(answer)
}
