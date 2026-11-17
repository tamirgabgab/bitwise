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
export { builtinComponents, createBuiltinRegistry } from './components/index.ts'
export { MAX_DISPLAY_DIGITS, numberValue } from './components/output.ts'
export { clockLevel } from './components/sequential.ts'
export type { ClockLevel, FlipFlopState } from './components/sequential.ts'
