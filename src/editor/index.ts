/**
 * Canvas editor: the drawing (document), its geometry, hit testing,
 * rendering and pointer/keyboard interaction. Depends on src/core, never
 * the other way around.
 */

export { CanvasController } from './canvasController.ts'
export { canvasRuntime } from './runtime.ts'
export { minimapPan, minimapScene } from './minimap.ts'
export type { MinimapScene } from './minimap.ts'
export { defaultParamsOf, renderSymbolIcon } from './render.ts'
export {
  MAX_DELAY,
  MAX_LABEL,
  MAX_TEXT,
  SUB_TYPE,
  TEXT_TYPE,
  isSwitchKey,
  keyName,
  takesKey,
} from './document.ts'
export type { AlignEdge, Axis } from './arrange.ts'
export { extractable } from './extract.ts'
export type { Terminal } from './document.ts'
export type { Point } from './geometry.ts'
export { useProbe } from './probeStore.ts'
export { EXAMPLES } from './examples.ts'
export type { Example } from './examples.ts'
export { isBlankProject } from './project.ts'
export type { ProjectData } from './project.ts'
export { MAX_NOTE, MAX_STEPS } from './steps.ts'
export type { InputValue, Step } from './steps.ts'
export {
  addStepHere,
  showStep,
  updateStepHere,
  breakpointOn,
  currentScope,
  describeNode,
  projectSnapshot,
  readPart,
  toggleWatch,
  unwatchRow,
  restartSimulation,
  setBreakpoint,
  setSwitch,
  stepBack,
  stepSimulation,
  stepToClockEdge,
  switchValue,
} from './session.ts'
export type { NodeInfo, ProbedPin } from './session.ts'
export type { PartReading, PinReading } from './simBridge.ts'
export type { BreakHit, BreakWhen } from './simStore.ts'
export type { ScopeSignal, Span } from './scope.ts'
export {
  DEFAULT_SCOPE_VIEW,
  SCOPE_NAMES,
  SCOPE_ZOOMS,
  renderScope,
  scopeHeight,
  scopeRowAt,
  scopeStart,
  scopeTickAt,
  scopeTicks,
  scopePan,
  scopeZoom,
} from './scopeRender.ts'
export type { ScopeView } from './scopeRender.ts'
export { MAX_CIRCUIT_NAME, canPlace, interfaceOf, usersOf } from './subcircuit.ts'
export { SIM_SPEEDS } from './simRunner.ts'
export type { SimSpeed } from './simRunner.ts'
export { useSim } from './simStore.ts'
export { useEditor } from './store.ts'
export type { ProjectSettings, ThemeChoice } from './store.ts'
export {
  digitColor,
  gradientColor,
  inkOn,
  makeValueStyle,
  signalText,
  valueText,
} from './valueStyle.ts'
export type { ValueStyle } from './valueStyle.ts'
export { readCanvasTheme } from './theme.ts'
export type { CanvasTheme } from './theme.ts'
export { MAX_ZOOM, MIN_ZOOM } from './view.ts'
