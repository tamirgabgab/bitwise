import { create } from 'zustand'

/*
 * On a phone the inspector is a sheet at the bottom of the screen. It comes
 * up low, showing only what is selected, so the canvas stays in sight; a tap
 * or a swipe up opens it to all the settings. Desktop shows it whole.
 */
interface SheetState {
  open: boolean
  setOpen(open: boolean): void
}

export const useSheet = create<SheetState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
