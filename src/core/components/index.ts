import { ComponentRegistry } from '../component.ts'
import { adder, alu, comparator, multiplier, shifter, subtractor } from './arith.ts'
import { merger, splitter } from './bus.ts'
import { fromBits, toBits } from './convert.ts'
import {
  addGate,
  andGate,
  bufferGate,
  isGate,
  mulGate,
  nandGate,
  norGate,
  notGate,
  orGate,
  shiftGate,
  xnorGate,
  xorGate,
} from './gates.ts'
import { buttonSource, constSource, inputSource } from './input.ts'
import { stateMachine } from './machine.ts'
import { ram, rom } from './memory.ts'
import { displaySink, outputSink } from './output.ts'
import { counter, register } from './register.ts'
import { decoder, demultiplexer, multiplexer } from './select.ts'
import { tableGate } from './table.ts'
import {
  clockSource,
  cycleSource,
  dFlipFlop,
  jkFlipFlop,
  srLatch,
  tFlipFlop,
} from './sequential.ts'

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
    .register(shiftGate)
    .register(addGate)
    .register(mulGate)
    .register(isGate)
    .register(tableGate)
    .register(inputSource)
    .register(buttonSource)
    .register(constSource)
    .register(outputSink)
    .register(displaySink)
    .register(clockSource)
    .register(srLatch)
    .register(dFlipFlop)
    .register(tFlipFlop)
    .register(jkFlipFlop)
    .register(cycleSource)
    .register(toBits)
    .register(fromBits)
    .register(splitter)
    .register(merger)
    .register(multiplexer)
    .register(demultiplexer)
    .register(decoder)
    .register(adder)
    .register(subtractor)
    .register(multiplier)
    .register(alu)
    .register(shifter)
    .register(comparator)
    .register(register)
    .register(counter)
    .register(rom)
    .register(ram)
    .register(stateMachine)
}

/** The registry a simulator uses unless it is given another one. */
export const builtinComponents = createBuiltinRegistry()
