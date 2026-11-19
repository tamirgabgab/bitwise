/**
 * Canvas editor: the drawing (document), its geometry, hit testing,
 * rendering and pointer/keyboard interaction. Depends on src/core, never
 * the other way around.
 */

export { CanvasController } from './canvasController.ts'
export { canvasHooks, canvasRuntime } from './runtime.ts'
export { minimapPan, minimapScene } from './minimap.ts'
export type { MinimapScene } from './minimap.ts'
export { defaultParamsOf, renderSymbolIcon } from './render.ts'
export {
  MAX_COORD,
  MAX_DELAY,
  MAX_ITEMS,
  MAX_LABEL,
  MAX_TEXT,
  SUB_TYPE,
  FRAME_TYPE,
  NET_TYPE,
  TEXT_TYPE,
  isAnnotation,
  isSwitchKey,
  keyName,
  takesKey,
} from './document.ts'
export type { AlignEdge, Axis } from './arrange.ts'
export { extractable } from './extract.ts'
export type { DocComponent, Terminal } from './document.ts'
export { digitOfKey } from './digitKeys.ts'
export { describeEdit } from './editNames.ts'
export { MAX_TRUTH_ROWS, rowOf, truthTable } from './truthTable.ts'
export {
  MAX_EXPRESSION_LENGTH,
  isExpressionError,
  karnaughMap,
  parseExpression,
  tableExpression,
  variableNames,
} from './expression.ts'
export type { KarnaughMap, TableExpression } from './expression.ts'
export type { TruthColumn, TruthRow, TruthTable } from './truthTable.ts'
export type { Point } from './geometry.ts'
export { useProbe } from './probeStore.ts'
export { EXAMPLES } from './examples.ts'
export type { Example } from './examples.ts'
export { MAX_CIRCUITS, MAX_ID_NUMBER, fromProjectData, isBlankProject, isSafeId } from './project.ts'
export { projectSvg } from './svgExport.ts'
export { scopeSvg, scopeVcd } from './scopeExport.ts'
export {
  MACHINE_SPACE,
  MACHINE_TYPE,
  MAX_PIN_NAME,
  MAX_STATE_NAME,
  freeStateId,
  freeStateName,
  shadowedRules,
} from './machine.ts'
export type { Machine, MachineNode, MachineRule } from './machine.ts'
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
  isWatched,
  toggleWatch,
  currentProblems,
  isMetered,
  meterReadings,
  toggleMeter,
  unpinMeter,
  unwatchRow,
  restartSimulation,
  setBreakpoint,
  setSwitch,
  stepBack,
  stepSimulation,
  stepToClockEdge,
  switchValue,
} from './session.ts'
export type { MeterReading, NodeInfo, ProbedPin } from './session.ts'
export { busFormatName, busFormatsFor, formatAt } from './busFormat.ts'
export type { BusFormat } from './document.ts'
export type { PartReading, PinReading } from './simBridge.ts'
export type { BreakHit, BreakWhen } from './simStore.ts'
export type { ScopeSignal, Span } from './scope.ts'
export {
  DEFAULT_SCOPE_VIEW,
  NO_MARKERS,
  SCOPE_NAMES,
  markerAt,
  markerText,
  markersBefore,
  placeMarker,
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
export type { ScopeMarkers, ScopeView } from './scopeRender.ts'
export { MAX_CIRCUIT_NAME, MAX_FLAT_PARTS, canPlace, interfaceOf, usersOf } from './subcircuit.ts'
export { SIM_SPEEDS } from './simRunner.ts'
export type { SimSpeed } from './simRunner.ts'
export { useSim } from './simStore.ts'
export { CANVAS_LOOKS, useEditor } from './store.ts'
export type { CanvasLook, ProjectSettings, ThemeChoice } from './store.ts'
export type { GateStyle } from './symbols.ts'
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
export { MAX_ZOOM, MIN_ZOOM, centerOn } from './view.ts'
export { drawingProblems } from './problems.ts'
export { describeCircuit } from './describe.ts'
export type { Problem, ProblemKind } from './problems.ts'
