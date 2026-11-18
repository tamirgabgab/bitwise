/**
 * Simulation core: signal values, component definitions and the
 * event-driven simulator.
 *
 * This layer is pure TypeScript. It must not import from React, the DOM,
 * or any other layer under src/, so it can run in Node tests and later in
 * a Web Worker.
 */

export const CORE_VERSION = '0.1.0'

export * from './signal.ts'
export * from './component.ts'
export * from './simulator.ts'
export * from './presets.ts'
export * from './cost.ts'
export * from './table.ts'
export { branchWidths } from './components/bus.ts'
export { MAX_BITS } from './components/convert.ts'
export { MAX_WAYS } from './components/select.ts'
export { TABLE_CELLS, tableCell } from './components/table.ts'
export {
  MAX_ADDRESS,
  MAX_WORDS,
  MAX_WORD_WIDTH,
  addressOf,
  memoryCell,
  packWord,
  unpackWord,
  wordCount,
} from './components/memory.ts'
export type { RamState } from './components/memory.ts'
export {
  ANY,
  MAX_MACHINE_INPUTS,
  MAX_MACHINE_OUTPUTS,
  MAX_RULES,
  MAX_STATES,
  nextState,
  ruleFrom,
  ruleTo,
  ruleWhen,
  stateOutput,
} from './components/machine.ts'
export type { MachineState } from './components/machine.ts'
export type { RegisterState } from './components/register.ts'
export { builtinComponents, createBuiltinRegistry } from './components/index.ts'
export { MAX_DISPLAY_DIGITS, numberValue } from './components/output.ts'
export { clockLevel } from './components/sequential.ts'
export type { ClockLevel, FlipFlopState } from './components/sequential.ts'
