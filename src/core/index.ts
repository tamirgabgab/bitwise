/**
 * Simulation core: netlist model, event queue and component evaluation.
 *
 * This layer is pure TypeScript. It must not import from React, the DOM,
 * or any other layer under src/, so it can run in Node tests and later in
 * a Web Worker.
 */

export const CORE_VERSION = '0.0.0'
