import { create } from 'zustand'

/*
 * Short messages that confirm something happened, such as a file being
 * saved. They show for a few seconds above the status bar and go away by
 * themselves; nothing has to be answered.
 */

/** A button on a message, for the one thing it offers to do. */
export interface ToastAction {
  readonly action: string
  readonly run: () => void
}

export interface Toast {
  readonly id: number
  readonly message: string
  readonly offer?: ToastAction
}

/** How many messages are on screen at once. A new one pushes the oldest out. */
export const TOAST_LIMIT = 3

/** How long a message stays, in milliseconds. */
export const TOAST_TIME = 4000

export const useToasts = create<{ toasts: readonly Toast[] }>()(() => ({ toasts: [] }))

let nextId = 1

/** Takes a message off the screen. */
export function dismissToast(id: number): void {
  useToasts.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}

/**
 * Shows a message for a few seconds, or, with a button that offers
 * something, until it is answered or dismissed. Returns its id.
 */
export function toast(message: string, offer?: ToastAction): number {
  const id = nextId++
  useToasts.setState((state) => ({
    toasts: [...state.toasts, { id, message, offer }].slice(-TOAST_LIMIT),
  }))
  if (!offer) setTimeout(() => dismissToast(id), TOAST_TIME)
  return id
}
