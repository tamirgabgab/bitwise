import { builtinComponents, gateTable } from '../core/index.ts'

/** What a part is called in the palette and the inspector. */
const NAMES: Readonly<Record<string, string>> = {
  and: 'AND',
  or: 'OR',
  not: 'NOT',
  nand: 'NAND',
  nor: 'NOR',
  xor: 'XOR',
  xnor: 'XNOR',
  buffer: 'Buffer',
  shift: 'Shift',
  add: 'ADD',
  mul: 'MUL',
  is: 'IS',
  const: 'Constant',
  input: 'Input',
  button: 'Button',
  output: 'Output',
  display: 'Number',
  clock: 'Clock',
  sr: 'SR latch',
  dff: 'D flip-flop',
  tff: 'T flip-flop',
  jkff: 'JK flip-flop',
  cycle: 'Cycle',
  tobits: 'To bits',
  frombits: 'From bits',
  split: 'Splitter',
  merge: 'Merger',
  mux: 'Multiplexer',
  demux: 'Demultiplexer',
  decoder: 'Decoder',
  adder: 'Adder',
  compare: 'Comparator',
  register: 'Register',
  counter: 'Counter',
  text: 'Text',
}

/** What each part does, in one line. Binary first, then the general rule. */
const HINTS: Readonly<Record<string, readonly [binary: string, general: string]>> = {
  and: ['1 when every input is 1', 'The smallest of its inputs (min)'],
  or: ['1 when any input is 1', 'The largest of its inputs (max)'],
  not: ['Inverts its input', 'Mirrors its input: x becomes (n − 1) − x'],
  nand: ['0 only when every input is 1', 'The smallest input plus 1, wrapping around'],
  nor: ['1 only when every input is 0', 'The largest input plus 1, wrapping around'],
  xor: ['1 when an odd number of inputs are 1', 'The sum of its inputs modulo n'],
  xnor: ['1 when an even number of inputs are 1', 'The mirrored sum of its inputs modulo n'],
  buffer: ['Passes its input through', 'Passes its input through'],
  shift: [
    'Adds 1, wrapping around. With two values this is NOT',
    'Adds 1, wrapping around: n − 1 becomes 0',
  ],
  add: ['The sum of its inputs modulo 2, which is XOR', 'The sum of its inputs modulo n'],
  mul: ['The product of its inputs, which is AND', 'The product of its inputs modulo n'],
  is: [
    'Gives 1 when its input is the chosen value, otherwise 0',
    'Gives the top value when its input is the chosen value, otherwise 0',
  ],
  const: ['Always gives the chosen value', 'Always gives the chosen value'],
  input: [
    'Click it to switch between 0 and 1',
    'Click it to step through the values. Shift-click or right-click steps back',
  ],
  button: ['Gives 1 while you hold it down', 'Gives the top value while you hold it down'],
  output: ['Shows the value that reaches it', 'Shows the value that reaches it'],
  display: [
    'Shows its inputs as one binary number, and what it is worth in decimal',
    'Shows its inputs as one number in base n, and what it is worth in decimal',
  ],
  clock: [
    'Switches between 0 and 1 on its own, at a steady pace',
    'Switches between 0 and the top value on its own, at a steady pace',
  ],
  sr: [
    'Remembers one bit: S sets it to 1, R clears it to 0',
    'Remembers a value: S at the top value sets it to the top value, R at the top value clears it to 0',
  ],
  dff: [
    'Takes the value of D each time the clock rises, and keeps it until the next',
    'Takes the value of D each time the clock rises past the middle, and keeps it until the next',
  ],
  tff: [
    'Flips each time the clock rises while T is 1',
    'Adds the value of T, wrapping around, each time the clock rises past the middle',
  ],
  jkff: [
    'When the clock rises: J sets it to 1, K clears it to 0, and both together flip it',
    'When the clock rises past the middle: J at the top value sets it to the top value, K clears it to 0, and both together add 1',
  ],
  cycle: [
    'Switches between 0 and 1 on its own, like a slow clock',
    'Steps through every value from 0 to the top on its own, then starts again',
  ],
  tobits: [
    'Writes a number in binary. With two values a digit is one bit already',
    'Writes a digit in binary, one wire per bit. A bit is 0 or the top value',
  ],
  frombits: [
    'Reads bits as one number. With two values a digit is one bit already',
    'Reads bits as one digit. A bit is 0 or the top value',
  ],
  split: [
    'Takes a bus apart into its wires. Set the width of a part in its settings to make a bus',
    'Takes a bus apart into its wires. Set the width of a part in its settings to make a bus',
  ],
  merge: [
    'Puts wires together into one bus, the lowest digit on top',
    'Puts wires together into one bus, the lowest digit on top',
  ],
  mux: [
    'Passes on input 0 or input 1, whichever Sel names',
    'Passes on the input that Sel names. One select digit chooses among n inputs',
  ],
  demux: [
    'Sends its input to output 0 or output 1, whichever Sel names. The other gives 0',
    'Sends its input to the output that Sel names. The others give 0',
  ],
  decoder: [
    'Gives 1 on the output that Sel names and 0 on the others',
    'Gives the top value on the output that Sel names and 0 on the others',
  ],
  adder: [
    'Adds two binary numbers on buses, with a carry in and a carry out',
    'Adds two numbers in base n on buses. A carry is 0 or the top value',
  ],
  compare: [
    'Compares two numbers on buses: less, equal or greater',
    'Compares two numbers in base n on buses. The answer that holds gives the top value',
  ],
  register: [
    'Takes the bus at D each time the clock rises while En is 1, and keeps it',
    'Takes the bus at D each time the clock rises past the middle while En is at the top value',
  ],
  counter: [
    'Goes one up each time the clock rises. Load takes D instead, R clears it',
    'Goes one up in base n each time the clock rises past the middle. Load takes D instead, R clears it',
  ],
  text: [
    'Writing on the canvas. It is not part of the circuit',
    'Writing on the canvas. It is not part of the circuit',
  ],
}

export function partName(type: string): string {
  return NAMES[type] ?? type
}

export function partHint(type: string, radix: number): string {
  const hint = HINTS[type]
  if (!hint) return ''
  return radix === 2 ? hint[0] : hint[1]
}

/** True for a part the palette can show a table for. */
export function hasGateTable(type: string): boolean {
  return builtinComponents.has(type) && gateTable(builtinComponents.get(type), 2) !== undefined
}
