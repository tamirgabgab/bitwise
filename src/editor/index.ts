/**
 * Canvas editor: the drawing (document), its geometry, hit testing,
 * rendering and pointer/keyboard interaction. Depends on src/core, never
 * the other way around.
 */

export { CanvasController } from './canvasController.ts'
export { canvasRuntime } from './runtime.ts'
export { defaultParamsOf, renderSymbolIcon } from './render.ts'
export { simBridge } from './session.ts'
export { useEditor } from './store.ts'
export type { ThemeChoice } from './store.ts'
export { readCanvasTheme } from './theme.ts'
export { MAX_ZOOM, MIN_ZOOM } from './view.ts'
