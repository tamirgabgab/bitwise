import { ComponentRegistry } from '../component.ts'
import {
  andGate,
  bufferGate,
  nandGate,
  norGate,
  notGate,
  orGate,
  xnorGate,
  xorGate,
} from './gates.ts'
import { inputSource } from './input.ts'

/** A fresh registry holding every built-in component type. */
export function createBuiltinRegistry(): ComponentRegistry {
  return new ComponentRegistry()
    .register(andGate)
    .register(orGate)
    .register(notGate)
    .register(nandGate)
    .register(norGate)
    .register(xorGate)
    .register(xnorGate)
    .register(bufferGate)
    .register(inputSource)
}

/** The registry a simulator uses unless it is given another one. */
export const builtinComponents = createBuiltinRegistry()
