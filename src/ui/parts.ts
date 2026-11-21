import { builtinComponents, gateTable } from '../core/index.ts'
import type { DocComponent } from '../editor/index.ts'
import { msg, t } from '../i18n/index.ts'

/**
 * Names that stay as they are in every language: the gates, written as
 * symbols, and the names of standards.
 */
const FIXED_NAMES: Readonly<Record<string, string>> = {
  and: 'AND',
  or: 'OR',
  not: 'NOT',
  nand: 'NAND',
  nor: 'NOR',
  xor: 'XOR',
  xnor: 'XNOR',
  shift: 'Shift',
  add: 'ADD',
  mul: 'MUL',
  is: 'IS',
  alu: 'ALU',
  rom: 'ROM',
  ram: 'RAM',
}

/** What a part is called in the palette and the inspector, translated where it is shown. */
const NAMES: Readonly<Record<string, string>> = {
  buffer: msg('Buffer'),
  table: msg('Table'),
  const: msg('Constant'),
  input: msg('Input'),
  button: msg('Button'),
  output: msg('Output'),
  display: msg('Number'),
  clock: msg('Clock'),
  sr: msg('SR latch'),
  dff: msg('D flip-flop'),
  tff: msg('T flip-flop'),
  jkff: msg('JK flip-flop'),
  cycle: msg('Cycle'),
  tobits: msg('To bits'),
  frombits: msg('From bits'),
  split: msg('Splitter'),
  merge: msg('Merger'),
  mux: msg('Multiplexer'),
  demux: msg('Demultiplexer'),
  decoder: msg('Decoder'),
  adder: msg('Adder'),
  subtractor: msg('Subtractor'),
  multiplier: msg('Multiplier'),
  shifter: msg('Shifter'),
  compare: msg('Comparator'),
  register: msg('Register'),
  counter: msg('Counter'),
  fsm: msg('State machine'),
  text: msg('Text'),
  frame: msg('Frame'),
  net: msg('Net label'),
}

/** What each part does, in one line. Binary first, then the general rule. */
const HINTS: Readonly<Record<string, readonly [binary: string, general: string]>> = {
  and: [msg('1 when every input is 1'), msg('The smallest of its inputs (min)')],
  or: [msg('1 when any input is 1'), msg('The largest of its inputs (max)')],
  not: [msg('Inverts its input'), msg('Mirrors its input: x becomes (n − 1) − x')],
  nand: [msg('0 only when every input is 1'), msg('The smallest input plus 1, wrapping around')],
  nor: [msg('1 only when every input is 0'), msg('The largest input plus 1, wrapping around')],
  xor: [msg('1 when an odd number of inputs are 1'), msg('The sum of its inputs modulo n')],
  xnor: [msg('1 when an even number of inputs are 1'), msg('The mirrored sum of its inputs modulo n')],
  buffer: [msg('Passes its input through'), msg('Passes its input through')],
  shift: [
    msg('Adds 1, wrapping around. With two values this is NOT'),
    msg('Adds 1, wrapping around: n − 1 becomes 0'),
  ],
  add: [msg('The sum of its inputs modulo 2, which is XOR'), msg('The sum of its inputs modulo n')],
  mul: [msg('The product of its inputs, which is AND'), msg('The product of its inputs modulo n')],
  is: [
    msg('Gives 1 when its input is the chosen value, otherwise 0'),
    msg('Gives the top value when its input is the chosen value, otherwise 0'),
  ],
  table: [
    msg('Gives what you write in its table for each input'),
    msg('Gives what you write in its table for each input, at any radix'),
  ],
  const: [msg('Always gives the chosen value'), msg('Always gives the chosen value')],
  input: [
    msg('Click it to switch between 0 and 1'),
    msg('Click it to step through the values. Shift-click or right-click steps back'),
  ],
  button: [msg('Gives 1 while you hold it down'), msg('Gives the top value while you hold it down')],
  output: [msg('Shows the value that reaches it'), msg('Shows the value that reaches it')],
  display: [
    msg('Shows its inputs as one binary number, and what it is worth in decimal'),
    msg('Shows its inputs as one number in base n, and what it is worth in decimal'),
  ],
  clock: [
    msg('Switches between 0 and 1 on its own, at a steady pace'),
    msg('Switches between 0 and the top value on its own, at a steady pace'),
  ],
  sr: [
    msg('Remembers one bit: S sets it to 1, R clears it to 0'),
    msg('Remembers a value: S at the top value sets it to the top value, R at the top value clears it to 0'),
  ],
  dff: [
    msg('Takes the value of D each time the clock rises, and keeps it until the next'),
    msg('Takes the value of D each time the clock rises past the middle, and keeps it until the next'),
  ],
  tff: [
    msg('Flips each time the clock rises while T is 1'),
    msg('Adds the value of T, wrapping around, each time the clock rises past the middle'),
  ],
  jkff: [
    msg('When the clock rises: J sets it to 1, K clears it to 0, and both together flip it'),
    msg('When the clock rises past the middle: J at the top value sets it to the top value, K clears it to 0, and both together add 1'),
  ],
  cycle: [
    msg('Switches between 0 and 1 on its own, like a slow clock'),
    msg('Steps through every value from 0 to the top on its own, then starts again'),
  ],
  tobits: [
    msg('Writes a number in binary. With two values a digit is one bit already'),
    msg('Writes a digit in binary, one wire per bit. A bit is 0 or the top value'),
  ],
  frombits: [
    msg('Reads bits as one number. With two values a digit is one bit already'),
    msg('Reads bits as one digit. A bit is 0 or the top value'),
  ],
  split: [
    msg('Takes a bus apart into its wires. Set the width of a part in its settings to make a bus'),
    msg('Takes a bus apart into its wires. Set the width of a part in its settings to make a bus'),
  ],
  merge: [
    msg('Puts wires together into one bus, the lowest digit on top'),
    msg('Puts wires together into one bus, the lowest digit on top'),
  ],
  mux: [
    msg('Passes on input 0 or input 1, whichever Sel names'),
    msg('Passes on the input that Sel names. One select digit chooses among n inputs'),
  ],
  demux: [
    msg('Sends its input to output 0 or output 1, whichever Sel names. The other gives 0'),
    msg('Sends its input to the output that Sel names. The others give 0'),
  ],
  decoder: [
    msg('Gives 1 on the output that Sel names and 0 on the others'),
    msg('Gives the top value on the output that Sel names and 0 on the others'),
  ],
  adder: [
    msg('Adds two binary numbers on buses, with a carry in and a carry out'),
    msg('Adds two numbers in base n on buses. A carry is 0 or the top value'),
  ],
  subtractor: [
    msg('Takes B and a borrow in from A, on buses. Bout is 1 when B was more'),
    msg('Takes B and a borrow in from A, in base n on buses. Bout is the top value when B was more'),
  ],
  multiplier: [
    msg('Multiplies two binary numbers on buses. The product is twice as wide'),
    msg('Multiplies two numbers in base n on buses. The product is twice as wide'),
  ],
  alu: [
    msg('Op picks what to do with A and B: add, subtract, AND, OR, XOR, NOT, shift up or down'),
    msg('Op picks what to do with A and B in base n: add, subtract, AND, OR, XOR, NOT, shift up or down'),
  ],
  shifter: [
    msg('Moves the bits of its input by as many places as Amt says, bringing in zeros or wrapping around'),
    msg('Moves the digits of its input by as many places as Amt says, bringing in zeros or wrapping around'),
  ],
  compare: [
    msg('Compares two numbers on buses: less, equal or greater'),
    msg('Compares two numbers in base n on buses. The answer that holds gives the top value'),
  ],
  register: [
    msg('Takes the bus at D each time the clock rises while En is 1, and keeps it'),
    msg('Takes the bus at D each time the clock rises past the middle while En is at the top value'),
  ],
  counter: [
    msg('Goes one up each time the clock rises. Load takes D instead, R clears it'),
    msg('Goes one up in base n each time the clock rises past the middle. Load takes D instead, R clears it'),
  ],
  rom: [
    msg('Gives the word kept at the address on A. The words are filled in the inspector'),
    msg('Gives the word kept at the address on A, in base n. The words are filled in the inspector'),
  ],
  ram: [
    msg('Gives the word at the address on A, and writes D there when the clock rises while WE is 1'),
    msg('Gives the word at the address on A, and writes D there when the clock rises past the middle while WE is at the top value'),
  ],
  fsm: [
    msg('Moves between the states you draw when the clock rises, Moore or Mealy. Double-click it to draw them'),
    msg('Moves between the states you draw when the clock rises past the middle, Moore or Mealy. Double-click it to draw them'),
  ],
  text: [
    msg('Writing on the canvas. It is not part of the circuit'),
    msg('Writing on the canvas. It is not part of the circuit'),
  ],
  frame: [
    msg('A titled box around part of the drawing. What lies inside moves with it'),
    msg('A titled box around part of the drawing. What lies inside moves with it'),
  ],
  net: [
    msg('Labels with the same name are connected, with no wire between them'),
    msg('Labels with the same name are connected, with no wire between them'),
  ],
}

/** The name of a part in English, the language of the code. */
function englishName(type: string): string {
  return FIXED_NAMES[type] ?? NAMES[type] ?? type
}

/** The line that says what a part does, in English. */
function englishHint(type: string, radix: number): string {
  const hint = HINTS[type]
  if (!hint) return ''
  return radix === 2 ? hint[0] : hint[1]
}

/** What a part is called, in the language of the interface. */
export function partName(type: string): string {
  return Object.hasOwn(NAMES, type) ? t(NAMES[type]) : englishName(type)
}

/** What a part does, in one line in the language of the interface. */
export function partHint(type: string, radix: number): string {
  const hint = englishHint(type, radix)
  return hint === '' ? '' : t(hint)
}

/**
 * Other words a part is looked for by, beyond its name: what it is for and
 * what people call it. Translated like the names, so a search in Hebrew
 * finds it by Hebrew words too.
 */
const KEYWORDS: Readonly<Record<string, string>> = {
  and: msg('both all conjunction'),
  or: msg('either any disjunction'),
  not: msg('invert inverter negate'),
  nand: msg('not and universal'),
  nor: msg('not or universal'),
  xor: msg('exclusive odd parity different'),
  xnor: msg('equal same equivalence'),
  buffer: msg('repeater delay'),
  shift: msg('rotate step'),
  add: msg('sum plus'),
  mul: msg('product times'),
  is: msg('equals detect'),
  table: msg('truth table custom function'),
  const: msg('fixed value'),
  input: msg('switch toggle source'),
  button: msg('push press momentary'),
  output: msg('light lamp led probe'),
  display: msg('number digits hex decimal'),
  clock: msg('tick pulse oscillator timer'),
  sr: msg('latch set reset memory'),
  dff: msg('flip-flop memory register'),
  tff: msg('flip-flop toggle memory'),
  jkff: msg('flip-flop memory'),
  cycle: msg('sequence steps'),
  tobits: msg('bus bits binary'),
  frombits: msg('bus bits binary'),
  split: msg('bus wires apart'),
  merge: msg('bus wires join'),
  mux: msg('select selector choose'),
  demux: msg('route distribute'),
  decoder: msg('address one hot select'),
  adder: msg('sum plus addition carry'),
  subtractor: msg('minus difference borrow'),
  multiplier: msg('times product multiply'),
  shifter: msg('shift rotate'),
  compare: msg('equal greater less'),
  alu: msg('arithmetic logic unit'),
  register: msg('store memory word'),
  counter: msg('count up increment'),
  rom: msg('memory read only'),
  ram: msg('memory read write'),
  fsm: msg('states automaton'),
  text: msg('label note comment'),
  frame: msg('box group'),
  net: msg('name tag'),
}

/**
 * Everything a search may find a part by: its name, what it does and the
 * words people call it by, in the language of the interface and in English,
 * so both languages find it.
 */
export function partWords(type: string, radix: number): string {
  const keywords = Object.hasOwn(KEYWORDS, type) ? KEYWORDS[type] : ''
  const shown = `${partName(type)} ${partHint(type, radix)} ${keywords === '' ? '' : t(keywords)}`
  const english = `${englishName(type)} ${englishHint(type, radix)} ${keywords}`
  return shown === english ? shown : `${shown} ${english}`
}

/** "1 input" or "3 inputs", in the language of the interface. */
export function inputCount(count: number): string {
  return count === 1 ? t('1 input') : t('{count} inputs', { count })
}

/** "1 output" or "3 outputs", in the language of the interface. */
export function outputCount(count: number): string {
  return count === 1 ? t('1 output') : t('{count} outputs', { count })
}

/** True for a part the palette can show a table for. */
export function hasGateTable(type: string): boolean {
  // A table gate answers X until it is filled in: its table is in the inspector.
  if (type === 'table') return false
  return builtinComponents.has(type) && gateTable(builtinComponents.get(type), 2) !== undefined
}

/** What a part is called in a problem: the name of its kind, and its label if it has one. */
export function problemName(part: DocComponent): string {
  const kind = part.sub?.name ?? partName(part.type)
  return part.label ? `${kind} ${part.label}` : kind
}
