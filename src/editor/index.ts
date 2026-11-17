/**
 * Canvas editor: the drawing (document), its geometry, hit testing,
 * rendering and pointer/keyboard interaction. Depends on src/core, never
 * the other way around.
 */

export { CanvasController } from './canvasController.ts'
export { canvasRuntime } from './runtime.ts'
export { defaultParamsOf, renderSymbolIcon } from './render.ts'
export { MAX_DELAY, MAX_LABEL, SUB_TYPE, isSwitchKey, keyName, takesKey } from './document.ts'
export type { Terminal } from './document.ts'
export { useProbe } from './probeStore.ts'
export { EXAMPLES } from './examples.ts'
export type { Example } from './examples.ts'
export type { ProjectData } from './project.ts'
export {
  breakpointOn,
  currentScope,
  describeNode,
  projectSnapshot,
  restartSimulation,
  setBreakpoint,
  stepBack,
  stepSimulation,
  stepToClockEdge,
} from './session.ts'
export type { NodeInfo, ProbedPin } from './session.ts'
export type { BreakHit, BreakWhen } from './simStore.ts'
export type { ScopeSignal, Span } from './scope.ts'
export { renderScope, scopeHeight, scopeTicks } from './scopeRender.ts'
export { MAX_CIRCUIT_NAME, canPlace, interfaceOf, usersOf } from './subcircuit.ts'
export { SIM_SPEEDS } from './simRunner.ts'
export type { SimSpeed } from './simRunner.ts'
export { useSim } from './simStore.ts'
export { useEditor } from './store.ts'
export type { ProjectSettings, ThemeChoice } from './store.ts'
export { digitColor, gradientColor, inkOn, valueText } from './valueStyle.ts'
export { readCanvasTheme } from './theme.ts'
export { MAX_ZOOM, MIN_ZOOM } from './view.ts'
