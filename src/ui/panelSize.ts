/* How tall the panel under the canvas may be dragged. */

/** The least height a panel keeps, in pixels: its heading and one row. */
export const MIN_PANEL = 96

/** The share of the window a panel may take at most. */
const MAX_SHARE = 0.7

/** A wanted panel height, kept within what the window allows. */
export function clampPanelHeight(height: number, windowHeight: number): number {
  const most = Math.max(MIN_PANEL, Math.floor(windowHeight * MAX_SHARE))
  return Math.round(Math.min(most, Math.max(MIN_PANEL, height)))
}
