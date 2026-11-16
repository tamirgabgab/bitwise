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
export { builtinComponents, createBuiltinRegistry } from './components/index.ts'
