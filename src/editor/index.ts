/**
 * Canvas editor: the drawing (document), its geometry, hit testing,
 * rendering and pointer/keyboard interaction. Depends on src/core, never
 * the other way around.
 */

export { CanvasController } from './canvasController.ts'
export { canvasRuntime } from './runtime.ts'
export { defaultParamsOf, renderSymbolIcon } from './render.ts'
export { restartSimulation, simBridge, stepSimulation } from './session.ts'
export { SIM_SPEEDS } from './simRunner.ts'
export type { SimSpeed } from './simRunner.ts'
export { useSim } from './simStore.ts'
export { useEditor } from './store.ts'
export type { ProjectSettings, ThemeChoice } from './store.ts'
export { gradientColor, inkOn, valueText } from './valueStyle.ts'
export { readCanvasTheme } from './theme.ts'
export { MAX_ZOOM, MIN_ZOOM } from './view.ts'
