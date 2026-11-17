import { create } from 'zustand'

/*
 * Short messages that confirm something happened, such as a file being
 * saved. They show for a few seconds above the status bar and go away by
 * themselves; nothing has to be answered.
 */

export interface Toast {
  readonly id: number
  readonly message: string
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

/** Shows a message for a few seconds. Returns its id. */
export function toast(message: string): number {
  const id = nextId++
  useToasts.setState((state) => ({
    toasts: [...state.toasts, { id, message }].slice(-TOAST_LIMIT),
  }))
  setTimeout(() => dismissToast(id), TOAST_TIME)
  return id
}
