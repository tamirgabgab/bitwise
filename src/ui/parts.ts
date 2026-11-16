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
}

export function partName(type: string): string {
  return NAMES[type] ?? type
}

export function partHint(type: string, radix: number): string {
  const hint = HINTS[type]
  if (!hint) return ''
  return radix === 2 ? hint[0] : hint[1]
}
