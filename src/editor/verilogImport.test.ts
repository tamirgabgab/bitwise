import { describe, expect, it } from 'vitest'
import { GATE_PRESETS, formatSignal, presetAvailable } from '../core/index.ts'
import { terminalKey } from './document.ts'
import type { DocComponent } from './document.ts'
import { EXAMPLES } from './examples.ts'
import { fromProjectData } from './project.ts'
import { SimBridge } from './simBridge.ts'
import { interfaceOf } from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'
import { gateBuilder } from './sumOfProducts.ts'
import { circuitVerilog } from './verilogExport.ts'
import { verilogCircuits } from './verilogImport.ts'
import type { VerilogBuilt } from './verilogImport.ts'
import { parseVerilog } from './verilogParse.ts'

const CLASSIC = new Set(['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buffer'])

function built(text: string, gates: ReadonlySet<string> = CLASSIC): VerilogBuilt {
  const result = verilogCircuits(text, { gates, circuits: {}, nextCircuit: 1 })
  if ('problem' in result) throw new Error(`${result.line}:${result.column} ${result.problem}`)
  return result
}

/** Why a text is refused, as "line:column message". */
function refused(text: string): string {
  const result = verilogCircuits(text, { gates: CLASSIC, circuits: {}, nextCircuit: 1 })
  if (!('problem' in result)) throw new Error('The text was read')
  return result.line === undefined ? result.problem : `${result.line}:${result.column} ${result.problem}`
}

/** A circuit running, with its switches and output parts reached by part. */
function running(circuits: Circuits, id: string) {
  const { doc } = circuits[id]
  const bridge = new SimBridge()
  bridge.sync(doc, circuits)
  return {
    parts: Object.values(doc.components),
    put(part: DocComponent, value: number): void {
      const width = part.params.width
      const done = bridge.setInput(part.id, width === 1 ? value : value.toString(2).padStart(width, '0'))
      if (!done) throw new Error(`No switch ${part.label}`)
    },
    settle: (): void => void bridge.sim.settle(),
    /** What an output part shows, written in bits, the highest first. */
    shown(part: DocComponent): string {
      const probe = bridge.probeTerminal(terminalKey({ kind: 'pin', component: part.id, port: 'in' }))
      return probe ? formatSignal(probe.value) : '?'
    },
  }
}

/** The circuit a text opens, running, with its switches and outputs reached by name. */
function bench(text: string, gates: ReadonlySet<string> = CLASSIC) {
  const result = built(text, gates)
  const circuits = Object.fromEntries(result.circuits.map((circuit) => [circuit.id, circuit]))
  const sim = running(circuits, result.top)
  const named = (type: string, label: string): DocComponent => {
    const part = sim.parts.find((item) => item.type === type && item.label === label)
    if (!part) throw new Error(`No ${type} called ${label}`)
    return part
  }
  const set = (values: Readonly<Record<string, number>>): void => {
    for (const [label, value] of Object.entries(values)) sim.put(named('input', label), value)
    sim.settle()
  }
  return {
    result,
    parts: sim.parts,
    set,
    /** One rising edge of the switch `clock`. */
    tick(clock = 'clk'): void {
      set({ [clock]: 0 })
      set({ [clock]: 1 })
    },
    text: (label: string): string => sim.shown(named('output', label)),
    get: (label: string): number => Number.parseInt(sim.shown(named('output', label)), 2),
    count: (type: string): number => sim.parts.filter((part) => part.type === type).length,
  }
}

describe('reading Verilog: modules and gates', () => {
  const HALF = `
    module half_adder (input a, input b, output sum, output carry);
      xor g1 (sum, a, b);
      and g2 (carry, a, b);
    endmodule`

  it('builds a module of gates', () => {
    const half = bench(HALF)
    expect(half.result.circuits.map((circuit) => circuit.name)).toEqual(['half_adder'])
    expect([half.count('input'), half.count('output'), half.count('xor'), half.count('and')]).toEqual([2, 2, 1, 1])
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      half.set({ a, b })
      expect([half.get('sum'), half.get('carry')]).toEqual([a ^ b, a & b])
    }
  })

  it('builds a module used in another as a part, by name and by place, with wires never declared', () => {
    const full = bench(`${HALF}
      // The full adder is written first in no particular order.
      module full_adder (a, b, cin, sum, cout);
        input a, b, cin;
        output sum, cout;
        or (cout, c1, c2);
        half_adder first (.a(a), .b(b), .sum(s1), .carry(c1));
        half_adder second (s1, cin, sum, c2);
      endmodule`)
    expect(full.result.circuits.map((circuit) => circuit.name)).toEqual(['half_adder', 'full_adder'])
    expect(full.result.top).toBe(full.result.circuits[1].id)
    expect(full.parts.filter((part) => part.sub).length).toBe(2)
    for (let n = 0; n < 8; n++) {
      const [a, b, cin] = [n & 1, (n >> 1) & 1, n >> 2]
      full.set({ a, b, cin })
      expect(2 * full.get('cout') + full.get('sum')).toBe(a + b + cin)
    }
  })

  it('gives the pins of a part the order of the header', () => {
    const { circuits } = built(`module m (output y, input b, input a); and (y, a, b); endmodule`)
    const pins = interfaceOf(circuits[0].doc)
    expect(pins.inputs.map((pin) => pin.label).sort()).toEqual(['a', 'b'])
    expect(pins.outputs.map((pin) => pin.label)).toEqual(['y'])
  })

  it('builds a loop through gates: a latch of two crossed NOR gates', () => {
    const latch = bench(`
      module latch (input s, input r, output q, output nq);
        nor (q, r, nq);
        nor (nq, s, q);
      endmodule`)
    latch.set({ s: 1, r: 0 })
    latch.set({ s: 0, r: 0 })
    expect([latch.get('q'), latch.get('nq')]).toEqual([1, 0])
    latch.set({ r: 1 })
    latch.set({ r: 0 })
    expect([latch.get('q'), latch.get('nq')]).toEqual([0, 1])
  })

  it('makes a gate of many inputs a tree, and a not of several outputs one gate', () => {
    const wide = bench(`
      module wide (input [9:0] a, output all, output n1, output n2);
        and (all, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]);
        not (n1, n2, a[0]);
      endmodule`)
    expect(wide.count('and')).toBe(3)
    expect(wide.count('not')).toBe(1)
    wide.set({ a: 0b1111111111 })
    expect([wide.get('all'), wide.get('n1'), wide.get('n2')]).toEqual([1, 0, 0])
    wide.set({ a: 0b1011111110 })
    expect([wide.get('all'), wide.get('n1'), wide.get('n2')]).toEqual([0, 1, 1])
  })

  it('builds every gate from each gate kit', () => {
    const text = `
      module gates (input a, input b, input c, output [7:0] y);
        and (y[0], a, b, c);
        or (y[1], a, b, c);
        xor (y[2], a, b, c);
        nand (y[3], a, b);
        nor (y[4], a, b);
        xnor (y[5], a, b);
        not (y[6], a);
        buf (y[7], b);
      endmodule`
    for (const preset of GATE_PRESETS.filter((item) => presetAvailable(item, 2))) {
      const kit = new Set(preset.gates)
      const gates = bench(text, kit)
      const others = gates.parts
        .map((part) => part.type)
        .filter((type) => !kit.has(type) && !['input', 'output', 'const', 'merge', 'split'].includes(type))
      expect(others, preset.id).toEqual([])
      for (let n = 0; n < 8; n++) {
        const [a, b, c] = [n & 1, (n >> 1) & 1, n >> 2]
        gates.set({ a, b, c })
        const want = [a & b & c, a | b | c, a ^ b ^ c, 1 - (a & b), 1 - (a | b), 1 - (a ^ b), 1 - a, b]
        expect(gates.get('y'), `${preset.id} ${n}`).toBe(want.reduce((sum, bit, index) => sum + (bit << index), 0))
      }
    }
  })
})

describe('reading Verilog: assign', () => {
  it('builds a gate for each operator, as wide as the bus', () => {
    const logic = bench(`
      module gates4 (input [3:0] a, input [3:0] b, input [3:0] c, output [3:0] y, output [3:0] z);
        assign y = a & b | ~c;
        wire [3:0] t = a ^ b ^ c;
        assign z = t ~^ a;
      endmodule`)
    expect([logic.count('and'), logic.count('or'), logic.count('not'), logic.count('xor'), logic.count('xnor')]).toEqual([1, 1, 1, 1, 1])
    expect(logic.parts.find((part) => part.type === 'xor')!.params).toMatchObject({ inputs: 3, width: 4 })
    logic.set({ a: 0b1100, b: 0b1010, c: 0b0110 })
    expect(logic.get('y')).toBe(((0b1100 & 0b1010) | (~0b0110 & 15)) & 15)
    expect(logic.get('z')).toBe(~(0b1100 ^ 0b1010 ^ 0b0110 ^ 0b1100) & 15)
  })

  it('builds one adder for a sum with a carry in and a carry out', () => {
    const adder = bench(`
      module add (input [3:0] a, input [3:0] b, input cin, output [3:0] sum, output cout);
        assign {cout, sum} = a + b + cin;
      endmodule`)
    expect(adder.count('adder')).toBe(1)
    expect(adder.parts.find((part) => part.type === 'adder')!.params.width).toBe(4)
    expect(adder.count('merge') + adder.count('split') + adder.count('const')).toBe(0)
    for (const [a, b, cin] of [[3, 4, 0], [15, 1, 0], [15, 15, 1], [9, 6, 1]]) {
      adder.set({ a, b, cin })
      expect(16 * adder.get('cout') + adder.get('sum')).toBe(a + b + cin)
    }
  })

  it('keeps a number written without a size as narrow as the signals around it', () => {
    const plus = bench(`
      module plus (input [3:0] a, output [3:0] y, output big, output [7:0] wide);
        assign y = a + 1;
        assign big = a > 9;
        assign wide = a + 250;
      endmodule`)
    expect(Math.max(...plus.parts.map((part) => part.params.width ?? 1))).toBe(8)
    expect(plus.parts.find((part) => part.type === 'compare')!.params.width).toBe(4)
    plus.set({ a: 15 })
    expect([plus.get('y'), plus.get('big'), plus.get('wide')]).toEqual([0, 1, (15 + 250) & 255])
    plus.set({ a: 9 })
    expect([plus.get('y'), plus.get('big'), plus.get('wide')]).toEqual([10, 0, 259 & 255])
  })

  it('works out arithmetic, comparisons, shifts and choices like the language does', () => {
    const math = bench(`
      module math (input [3:0] a, input [3:0] b, input [1:0] n, input s,
                   output [3:0] diff, output [4:0] wide_diff, output [7:0] prod, output [3:0] neg,
                   output lt, output le, output eq, output ne, output ge, output gt,
                   output [3:0] shl, output [3:0] shr, output [3:0] shl2, output [3:0] shr1,
                   output [4:0] carried, output [3:0] pick, output both, output either, output none);
        assign diff = a - b;
        assign wide_diff = a - b;
        assign prod = a * b;
        assign neg = -a;
        assign lt = a < b, le = a <= b, eq = a == b, ne = a != b, ge = a >= b, gt = a > b;
        assign shl = a << n;
        assign shr = a >> n;
        assign shl2 = a << 2;
        assign shr1 = a >> 1;
        assign carried = (a + b) >> 1;
        assign pick = s ? a : b;
        assign both = a && b;
        assign either = a || b;
        assign none = !a;
      endmodule`)
    for (const [a, b, n, s] of [[5, 3, 1, 1], [3, 5, 2, 0], [15, 15, 3, 1], [0, 9, 0, 0], [8, 8, 1, 1], [12, 0, 2, 0]]) {
      math.set({ a, b, n, s })
      const got = Object.fromEntries(
        ['diff', 'wide_diff', 'prod', 'neg', 'lt', 'le', 'eq', 'ne', 'ge', 'gt', 'shl', 'shr', 'shl2', 'shr1', 'carried', 'pick', 'both', 'either', 'none'].map(
          (name) => [name, math.get(name)],
        ),
      )
      expect(got, `${a} ${b} ${n} ${s}`).toEqual({
        diff: (a - b) & 15,
        wide_diff: (a - b) & 31,
        prod: a * b,
        neg: -a & 15,
        lt: +(a < b),
        le: +(a <= b),
        eq: +(a === b),
        ne: +(a !== b),
        ge: +(a >= b),
        gt: +(a > b),
        shl: (a << n) & 15,
        shr: a >> n,
        shl2: (a << 2) & 15,
        shr1: a >> 1,
        // The sum keeps its carry, because the left side is five bits wide.
        carried: (a + b) >> 1,
        pick: s ? a : b,
        both: +(a !== 0 && b !== 0),
        either: +(a !== 0 || b !== 0),
        none: +(a === 0),
      })
    }
    expect(math.count('subtractor')).toBe(3)
    expect(math.parts.find((part) => part.type === 'multiplier')!.params.width).toBe(4)
    expect(math.parts.filter((part) => part.type === 'shifter').map((part) => part.params.left).sort()).toEqual([0, 1])
  })

  it('picks bits and joins buses with a splitter or a merger only where one is needed', () => {
    const bus = bench(`
      module bus (input [7:0] a, input [3:0] b, output [3:0] high, output [3:0] mid, output bit5,
                  output [7:0] joined, output [7:0] twice, output [7:0] padded, output [3:0] up,
                  output all, output any, output odd, output [5:0] mixed);
        assign high = a[7:4];
        assign mid = a[5:2];
        assign bit5 = a[5];
        assign joined = {b, a[3:0]};
        assign twice = {2{b}};
        assign padded = b;
        assign up = a[2 +: 4];
        assign all = &b, any = |b, odd = ^b;
        assign mixed = {b[0], 2'b10, a[7:5]};
      endmodule`)
    bus.set({ a: 0b10110100, b: 0b1001 })
    expect(bus.get('high')).toBe(0b1011)
    expect(bus.get('mid')).toBe(0b1101)
    expect(bus.get('bit5')).toBe(1)
    expect(bus.get('joined')).toBe(0b10010100)
    expect(bus.get('twice')).toBe(0b10011001)
    expect(bus.get('padded')).toBe(0b1001)
    expect(bus.get('up')).toBe(0b1101)
    expect([bus.get('all'), bus.get('any'), bus.get('odd')]).toEqual([0, 1, 0])
    expect(bus.get('mixed')).toBe(0b110101)
    // `a` is taken apart once by fours and once bit by bit, `b` once bit by bit.
    expect(bus.count('split')).toBe(3)
  })

  it('reads numbers in every base, parameters, and expressions of numbers alone', () => {
    const numbers = bench(`
      module numbers #(parameter W = 4, parameter [3:0] K = 4'hA) (input [W-1:0] a, output [W-1:0] y, output [7:0] k);
        localparam STEP = 8'd3, MASK = (1 << W) - 1;
        assign y = (a + STEP) & MASK & 4'b1x11;
        assign k = {K, 4'o7} ^ 8'b0000_0001;
      endmodule`)
    expect(numbers.parts.find((part) => part.type === 'input')!.params.width).toBe(4)
    numbers.set({ a: 6 })
    expect(numbers.get('y')).toBe((6 + 3) & 0b1011)
    expect(numbers.get('k')).toBe(0xa7 ^ 1)
  })
})

describe('reading Verilog: always', () => {
  it('makes a reg of one bit given a value on a clock edge a D flip-flop', () => {
    const flop = bench(`
      module flop (input clk, input d, output reg q);
        always @(posedge clk) q <= d;
      endmodule`)
    expect([flop.count('dff'), flop.count('register')]).toEqual([1, 0])
    flop.set({ d: 1, clk: 0 })
    expect(flop.get('q')).toBe(0)
    flop.tick()
    expect(flop.get('q')).toBe(1)
    flop.set({ d: 0 })
    expect(flop.get('q')).toBe(1)
    flop.tick()
    expect(flop.get('q')).toBe(0)
  })

  it('makes a bus a register, with its enable and a reset that does not wait for the clock', () => {
    const reg = bench(`
      module store (input clk, input rst, input en, input [3:0] d, output [3:0] q);
        reg [3:0] q = 4'd0;
        always @(posedge clk or posedge rst)
          if (rst) q <= 4'b0;
          else if (en) q <= d;
      endmodule`)
    expect([reg.count('register'), reg.count('mux'), reg.count('dff')]).toEqual([1, 0, 0])
    reg.set({ clk: 0, rst: 0, en: 1, d: 9 })
    reg.tick()
    expect(reg.get('q')).toBe(9)
    reg.set({ en: 0, d: 5 })
    reg.tick()
    expect(reg.get('q')).toBe(9)
    reg.set({ rst: 1 })
    expect(reg.get('q')).toBe(0)
  })

  it('builds a counter from a register and an adder, with a reset on the clock', () => {
    const counter = bench(`
      module counter (input clk, input rst, output reg [2:0] count, output wrap);
        always @(posedge clk) begin
          if (rst) count <= 0;
          else count <= count + 1;
        end
        assign wrap = count == 3'd7;
      endmodule`)
    expect([counter.count('register'), counter.count('adder'), counter.count('mux')]).toEqual([1, 1, 1])
    // One is added through the carry in, so no constant has to be put together from bits.
    expect([counter.count('merge'), counter.count('split')]).toEqual([0, 0])
    counter.set({ clk: 0, rst: 1 })
    counter.tick()
    counter.set({ rst: 0 })
    const seen: number[] = []
    for (let step = 0; step < 9; step++) {
      counter.tick()
      seen.push(counter.get('count'))
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1])
    counter.set({ rst: 1 })
    expect(counter.get('count')).toBe(1)
    counter.tick()
    expect(counter.get('count')).toBe(0)
  })

  it('reads a reset on a falling edge, and a set of one bit', () => {
    const flop = bench(`
      module flop (input clk, input rst_n, input set, input d, output reg q);
        always_ff @(posedge clk or negedge rst_n or posedge set)
          if (!rst_n) q <= 1'b0;
          else if (set) q <= 1'b1;
          else q <= d;
      endmodule`)
    expect(flop.count('dff')).toBe(1)
    flop.set({ clk: 0, rst_n: 1, set: 0, d: 1 })
    flop.tick()
    expect(flop.get('q')).toBe(1)
    flop.set({ rst_n: 0 })
    expect(flop.get('q')).toBe(0)
    flop.set({ rst_n: 1, set: 1 })
    expect(flop.get('q')).toBe(1)
  })

  it('builds the multiplexers an always @(*) chooses with', () => {
    const alu = bench(`
      module alu (input [1:0] op, input [3:0] a, input [3:0] b, output reg [3:0] y, output reg zero);
        always @(*) begin
          zero = 0;
          case (op)
            2'd0: y = a + b;
            2'd1: y = a - b;
            2'd2: y = a & b;
            default: y = a | b;
          endcase
          if (y == 0) zero = 1;
        end
      endmodule`)
    expect(alu.parts.filter((part) => part.type === 'mux').map((part) => part.params.inputs).sort()).toEqual([2, 4])
    for (const [op, a, b] of [[0, 9, 9], [1, 7, 7], [1, 3, 5], [2, 12, 10], [3, 12, 3], [2, 5, 10]]) {
      alu.set({ op, a, b })
      const want = [a + b, a - b, a & b, a | b][op] & 15
      expect([alu.get('y'), alu.get('zero')], `${op} ${a} ${b}`).toEqual([want, +(want === 0)])
    }
  })

  it('builds a state machine written with a case on its state', () => {
    // Gives 1 for one clock after it has seen 1, 0, 1.
    const seen = bench(`
      module seen (input clk, input rst, input x, output found);
        localparam [1:0] IDLE = 2'd0, ONE = 2'd1, ZERO = 2'd2, HIT = 2'd3;
        reg [1:0] state, next;
        always @(posedge clk or posedge rst)
          if (rst) state <= IDLE;
          else state <= next;
        always_comb begin
          next = IDLE;
          case (state)
            IDLE: if (x) next = ONE;
            ONE: if (x) next = ONE; else next = ZERO;
            ZERO: if (x) next = HIT;
            HIT: if (x) next = ONE; else next = ZERO;
          endcase
        end
        assign found = state == HIT;
      endmodule`)
    seen.set({ clk: 0, rst: 1, x: 0 })
    seen.set({ rst: 0 })
    const out: number[] = []
    for (const x of [1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1]) {
      seen.set({ x })
      seen.tick()
      out.push(seen.get('found'))
    }
    expect(out).toEqual([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1])
  })

  it('sees at once a value given with =, and the old one after <=', () => {
    const swap = bench(`
      module swap (input clk, input load, input [1:0] d, output reg [1:0] a, output reg [1:0] b, output reg [1:0] c);
        reg [1:0] t;
        always @(posedge clk)
          if (load) begin a <= d; b <= ~d; end
          else begin
            a <= b;
            b <= a;
            t = a + 2'd1;
            c <= t;
          end
      endmodule`)
    swap.set({ clk: 0, load: 1, d: 1 })
    swap.tick()
    expect([swap.get('a'), swap.get('b')]).toEqual([1, 2])
    swap.set({ load: 0 })
    swap.tick()
    expect([swap.get('a'), swap.get('b'), swap.get('c')]).toEqual([2, 1, 2])
    swap.tick()
    expect([swap.get('a'), swap.get('b'), swap.get('c')]).toEqual([1, 2, 3])
  })

  it('gives bits of a reg their values apart, and keeps the bits a path says nothing about', () => {
    const parts = bench(`
      module parts (input clk, input hi, input [3:0] d, output reg [7:0] q);
        always @(posedge clk) begin
          q[3:0] <= d;
          if (hi) q[7:4] <= d;
        end
      endmodule`)
    parts.set({ clk: 0, hi: 1, d: 0b1010 })
    parts.tick()
    expect(parts.get('q')).toBe(0b10101010)
    parts.set({ hi: 0, d: 0b0011 })
    parts.tick()
    expect(parts.get('q')).toBe(0b10100011)
  })
})

describe('reading Verilog: what is refused', () => {
  it('says where a mistake is', () => {
    expect(refused('module m (input a, output y);\n  assign y = a\nendmodule')).toBe('2:15 “;” is expected here, not “endmodule”.')
    expect(refused('module m (input a, output y);\n  assign y = b;\nendmodule')).toBe('2:14 “b” is not declared.')
    expect(refused('module m (input a, output y);\n  assign y = a;\n  assign y = ~a;\nendmodule')).toBe(
      '3:10 “y” is given a value in two places.',
    )
    expect(refused('module m (input a, output y);\n  assign a = 1;\nendmodule')).toMatch(/^2:10 “a” is an input/)
    expect(refused('module m (input a, output y);\n  wire w;\n  assign y = a & w;\nendmodule')).toMatch(
      /Nothing gives “w” a value\.$/,
    )
    expect(refused('module m (input a, output y);\n  wire p, q;\n  assign p = q;\n  assign q = p;\n  assign y = p;\nendmodule')).toMatch(
      /is given its own value/,
    )
    expect(refused('nothing here')).toBe('1:1 “module” is expected here, not “nothing”.')
    expect(refused('')).toBe('There is no module in this text. A circuit starts with “module”.')
  })

  it('refuses a latch, and what would have to remember without a clock', () => {
    expect(refused('module m (input en, input d, output reg q);\n  always @(*)\n    if (en) q = d;\nendmodule')).toMatch(
      /^3:5 “q” is not given a value on every path/,
    )
    expect(refused('module m (input [1:0] s, output reg q);\n  always @(*) case (s) 2\'d0: q = 1; 2\'d1: q = 0; endcase\nendmodule')).toMatch(
      /not given a value on every path/,
    )
  })

  it('refuses modules that are missing, twice there, or inside themselves', () => {
    expect(refused('module m (input a, output y);\n  other u (a, y);\nendmodule')).toBe('2:9 No module is called “other”.')
    expect(refused('module m; endmodule\nmodule m; endmodule')).toBe('2:1 Two modules are called “m”.')
    expect(refused('module a (input x, output y);\n  b u (x, y);\nendmodule\nmodule b (input x, output y);\n  a u (x, y);\nendmodule')).toMatch(
      /“a” would contain itself\.$/,
    )
    expect(refused('module m (input a, output y);\n  sub u (.a(a), .z(y));\nendmodule\nmodule sub (input a, output y); assign y = a; endmodule')).toBe(
      '2:17 “sub” has no port called “z”.',
    )
  })

  it('refuses the parts of the language it does not read, by name', () => {
    expect(refused('module m (inout a); endmodule')).toMatch(/both an input and an output/)
    expect(refused('module m (input a, output y); assign y = 1\'bz; endmodule')).toMatch(/floating/)
    expect(refused('module m (input a, output y);\n  generate endgenerate\nendmodule')).toMatch(/^2:3 Generated code/)
    expect(refused('module m (input [3:0] a, output [3:0] y); assign y = a / 3; endmodule')).toMatch(/No part divides/)
    expect(refused('module m (input [0:3] a); endmodule')).toMatch(/from the high bit down/)
    expect(refused('module m (input [99:0] a); endmodule')).toMatch(/1 to 64 bits wide/)
    expect(refused('module m (input clk, input d, output reg [3:0] q);\n  always @(posedge clk or posedge d) q <= 1;\nendmodule')).toMatch(
      /With more than one edge/,
    )
    expect(refused('module m (input clk, input r, output reg [3:0] q);\n  always @(posedge clk or posedge r) if (r) q <= 3; else q <= 0;\nendmodule')).toMatch(
      /reset to something else/,
    )
    expect(refused(`module m; endmodule ${' '.repeat(1_000_001)}`)).toMatch(/longer than 1,000,000 characters/)
    expect(refused(`module m (input a, output y); assign y = ${'('.repeat(20_000)}a${')'.repeat(20_000)}; endmodule`)).toMatch(
      /nested too deeply|is expected/,
    )
  })

  it('keeps to the limits of a project', () => {
    const circuits: Record<string, Circuit> = {}
    for (let index = 0; index < 199; index++) circuits[`k${index}`] = { id: `k${index}`, name: `c${index}`, doc: gateBuilder(2).doc() }
    const two = 'module a; endmodule module b; endmodule'
    expect(verilogCircuits(two, { gates: CLASSIC, circuits, nextCircuit: 300 })).toMatchObject({
      problem: expect.stringContaining('at most 200 circuits'),
    })
    // Each module holds two of the one before: forty of them open up into far too many parts.
    const doubling = ['module m0 (input a, output y); not (y, a); endmodule']
    for (let index = 1; index < 40; index++) {
      doubling.push(`module m${index} (input a, output y); wire w; m${index - 1} p (a, w); m${index - 1} q (w, y); endmodule`)
    }
    expect(refused(doubling.join('\n'))).toMatch(/^Opened up, these modules come to more than 50,000 parts/)
  })

  it('gives a new circuit a name no circuit has, and the next ids', () => {
    const taken: Circuits = { k1: { id: 'k1', name: 'm', doc: gateBuilder(2).doc() } }
    const result = verilogCircuits('module m (input a, output y); buf (y, a); endmodule', { gates: CLASSIC, circuits: taken, nextCircuit: 7 })
    expect(result).toMatchObject({ top: 'k7', circuits: [{ id: 'k7', name: 'm 2' }] })
  })
})

describe('reading Verilog: what the export writes', () => {
  /** What every output part of a circuit shows for every setting of its switches. */
  function table(circuits: Circuits, id: string, inputs: readonly string[], outputs: readonly string[]): string[] {
    const sim = running(circuits, id)
    const byId = new Map(sim.parts.map((part) => [part.id, part]))
    const switches = inputs.map((part) => byId.get(part)!)
    const widths = switches.map((part) => part.params.width)
    const total = widths.reduce((sum, width) => sum + width, 0)
    const rows: string[] = []
    // Every setting when there are few, a spread of them otherwise.
    const step = total <= 10 ? 1 : 37
    for (let n = 0; n < 2 ** total; n += step) {
      let rest = n
      switches.forEach((part, index) => {
        sim.put(part, rest % 2 ** widths[index])
        rest = Math.floor(rest / 2 ** widths[index])
      })
      sim.settle()
      rows.push(outputs.map((part) => sim.shown(byId.get(part)!)).join(' '))
    }
    return rows
  }

  /** Writes a circuit as Verilog, reads it back, and checks the two behave alike. */
  function roundTrip(circuits: Circuits, top: string): VerilogBuilt {
    const file = circuitVerilog(circuits, top, 2)
    if ('problem' in file) throw new Error(file.problem)
    const back = built(file.text)
    const again = Object.fromEntries(back.circuits.map((circuit) => [circuit.id, circuit]))
    // The ports of the module are the pins of the circuit, in the same order.
    const header = parseVerilog(file.text).find((module) => module.name === file.top)!
    const labelled = (type: string, label: string): string =>
      Object.values(again[back.top].doc.components).find((part) => part.type === type && part.label === label.slice(0, 16))!.id
    const pins = interfaceOf(circuits[top].doc)
    const dirOf = new Map(header.decls.map((decl) => [decl.name, decl.dir]))
    const names = (dir: string): string[] => header.ports.filter((port) => dirOf.get(port) === dir)
    expect(names('input').length).toBe(pins.inputs.length)
    expect(
      table(again, back.top, names('input').map((name) => labelled('input', name)), names('output').map((name) => labelled('output', name))),
    ).toEqual(table(circuits, top, pins.inputs.map((pin) => pin.port), pins.outputs.map((pin) => pin.port)))
    return back
  }

  it('reads back the examples that have no clock', () => {
    for (const id of ['binary-adder', 'bus-adder']) {
      const project = fromProjectData(EXAMPLES.find((example) => example.id === id)!.build())
      for (const circuit of project.order) roundTrip(project.circuits, circuit)
    }
  })

  it('reads back gates on buses, a multiplexer, a comparator and the arithmetic parts', () => {
    const { doc, place, connect } = gateBuilder(2)
    const pin = (component: string, port: string) => ({ component, port })
    const a = place('input', { label: 'a', params: { width: 3 } })
    const b = place('input', { label: 'b', params: { width: 3 } })
    const s = place('input', { label: 's' })
    const out = (label: string, from: { component: string; port: string }, width = 3): void =>
      connect(from, pin(place('output', { label, params: { width } }), 'in'))
    const wired = (type: string, params: Record<string, number>, pins: Record<string, { component: string; port: string }>): string => {
      const id = place(type, { params })
      for (const [port, from] of Object.entries(pins)) connect(from, pin(id, port))
      return id
    }
    const [A, B, S] = [pin(a, 'out'), pin(b, 'out'), pin(s, 'out')]
    out('nand', pin(wired('nand', { width: 3 }, { in0: A, in1: B }), 'out'))
    out('xnor', pin(wired('xnor', { width: 3 }, { in0: A, in1: B }), 'out'))
    out('mux', pin(wired('mux', { width: 3 }, { in0: A, in1: B, sel: S }), 'out'))
    const adder = wired('adder', { width: 3 }, { a: A, b: B, cin: S })
    out('sum', pin(adder, 'sum'))
    out('cout', pin(adder, 'cout'), 1)
    const subtractor = wired('subtractor', { width: 3 }, { a: A, b: B, bin: S })
    out('diff', pin(subtractor, 'diff'))
    out('bout', pin(subtractor, 'bout'), 1)
    out('prod', pin(wired('multiplier', { width: 3 }, { a: A, b: B }), 'p'), 6)
    const compare = wired('compare', { width: 3 }, { a: A, b: B })
    out('lt', pin(compare, 'lt'), 1)
    out('gt', pin(compare, 'gt'), 1)
    const split = wired('split', { width: 3, each: 1 }, { in: A })
    out('swapped', pin(wired('merge', { width: 3, each: 1 }, { d0: pin(split, 'd2'), d1: pin(split, 'd1'), d2: pin(split, 'd0') }), 'out'))
    const back = roundTrip({ k1: { id: 'k1', name: 'Parts', doc: doc() } }, 'k1')
    const types = Object.values(back.circuits[0].doc.components).map((part) => part.type)
    for (const type of ['nand', 'xnor', 'mux', 'adder', 'subtractor', 'multiplier', 'compare']) {
      expect(types.filter((item) => item === type), type).toHaveLength(1)
    }
  })

  it('reads a chain of choices on one signal as one multiplexer, and a number asked of it through a decoder', () => {
    const picks = bench(`
      module picks (input [1:0] sel, input [2:0] a, input [2:0] b, input [2:0] c, output [2:0] y,
                    output is2, output not1, output never, input one, output on, output off);
        assign y = sel == 2'd0 ? a : sel == 2'd1 ? b : sel == 2'd2 ? c : a;
        assign is2 = sel == 2;
        assign not1 = 1 != sel;
        assign never = sel == 7;
        assign on = one == 1'b1;
        assign off = one == 1'b0;
      endmodule`)
    expect([picks.count('mux'), picks.count('decoder'), picks.count('compare'), picks.count('not')]).toEqual([1, 1, 0, 2])
    expect(picks.parts.find((part) => part.type === 'mux')!.params).toMatchObject({ inputs: 4, select: 2, width: 3 })
    for (let sel = 0; sel < 4; sel++) {
      for (const one of [0, 1]) {
        picks.set({ sel, a: 5, b: 6, c: 3, one })
        expect(
          ['y', 'is2', 'not1', 'never', 'on', 'off'].map((name) => picks.get(name)),
          `${sel} ${one}`,
        ).toEqual([[5, 6, 3, 5][sel], +(sel === 2), +(sel !== 1), 0, one, 1 - one])
      }
    }
  })

  it('keeps a wide signal that is asked for a few numbers away from a part of every way', () => {
    const few = bench(`
      module few (input [3:0] code, input [2:0] a, input [2:0] b, output [2:0] y, output reg [2:0] z, output last);
        assign y = code == 4'd3 ? a : code == 4'd9 ? b : 3'd0;
        always @(*)
          case (code)
            4'd1: z = a;
            4'd2, 4'd4: z = b;
            default: z = 3'd7;
          endcase
        assign last = code == 4'd15;
      endmodule`)
    expect(few.count('decoder')).toBe(0)
    expect(Math.max(...few.parts.filter((part) => part.type === 'mux').map((part) => part.params.inputs))).toBe(2)
    for (let code = 0; code < 16; code++) {
      few.set({ code, a: 5, b: 2 })
      expect([few.get('y'), few.get('z'), few.get('last')], String(code)).toEqual([
        code === 3 ? 5 : code === 9 ? 2 : 0,
        code === 1 ? 5 : code === 2 || code === 4 ? 2 : 7,
        +(code === 15),
      ])
    }
  })

  it('reads back a multiplexer of four ways, a decoder and a shifter as the parts they were', () => {
    const ways = bench(`
      module ways (input [1:0] in0, input [1:0] in1, input [1:0] in2, input [1:0] in3, input [1:0] sel, output [1:0] out,
                   output [3:0] hot, input [3:0] v, output [3:0] moved);
        assign out = sel == 2'd0 ? in0 : sel == 2'd1 ? in1 : sel == 2'd2 ? in2 : in3;
        assign hot = {sel == 2'd3, sel == 2'd2, sel == 2'd1, sel == 2'd0};
        assign moved = v << sel;
      endmodule`)
    expect([ways.count('mux'), ways.count('decoder'), ways.count('shifter'), ways.count('compare')]).toEqual([1, 1, 1, 0])
    for (let sel = 0; sel < 4; sel++) {
      ways.set({ in0: 1, in1: 2, in2: 3, in3: 0, sel, v: 0b1011 })
      expect([ways.get('out'), ways.get('hot'), ways.get('moved')]).toEqual([[1, 2, 3, 0][sel], 1 << sel, (0b1011 << sel) & 15])
    }
  })

  it('reads back flip-flops, a register and a counter, clock edge by clock edge', () => {
    const { doc, place, connect } = gateBuilder(2)
    const pin = (component: string, port: string) => ({ component, port })
    const clk = pin(place('input', { label: 'clk' }), 'out')
    const rst = pin(place('input', { label: 'rst' }), 'out')
    const en = pin(place('input', { label: 'en' }), 'out')
    const d = pin(place('input', { label: 'd', params: { width: 3 } }), 'out')
    const bit = pin(place('split', { params: { width: 3, each: 1 } }), 'd0')
    connect(d, pin(bit.component, 'in'))
    const wired = (type: string, params: Record<string, number>, pins: Record<string, { component: string; port: string }>, label: string, port = 'q', width = 3): void => {
      const id = place(type, { params })
      for (const [name, from] of Object.entries(pins)) connect(from, pin(id, name))
      connect(pin(id, port), pin(place('output', { label, params: { width } }), 'in'))
    }
    wired('dff', {}, { d: bit, clk, reset: rst }, 'flop', 'q', 1)
    wired('tff', {}, { t: bit, clk, reset: rst }, 'toggle', 'q', 1)
    wired('jkff', {}, { j: bit, k: en, clk, reset: rst }, 'jk', 'q', 1)
    wired('register', { width: 3 }, { d, clk, en, reset: rst }, 'kept')
    wired('counter', { width: 3 }, { clk, en, reset: rst }, 'count')
    const circuits: Circuits = { k1: { id: 'k1', name: 'Clocked', doc: doc() } }
    const file = circuitVerilog(circuits, 'k1', 2)
    if ('problem' in file) throw new Error(file.problem)
    const back = bench(file.text)
    const first = running(circuits, 'k1')
    const original = (label: string, type: string): DocComponent => first.parts.find((part) => part.type === type && part.label === label)!
    const both = (values: Readonly<Record<string, number>>): void => {
      for (const [label, value] of Object.entries(values)) first.put(original(label, 'input'), value)
      first.settle()
      back.set(values)
    }
    both({ clk: 0, rst: 1, en: 1, d: 0 })
    both({ rst: 0 })
    let state = 1
    for (let step = 0; step < 40; step++) {
      // A fixed run of numbers that looks random.
      state = (state * 1103515245 + 12345) % 2 ** 31
      both({ d: state % 8, en: (state >> 5) % 4 === 0 ? 0 : 1, rst: (state >> 9) % 11 === 0 ? 1 : 0 })
      both({ clk: 1 })
      both({ clk: 0 })
      for (const label of ['flop', 'toggle', 'jk', 'kept', 'count']) {
        expect(back.text(label), `${label} at step ${step}`).toBe(first.shown(original(label, 'output')))
      }
    }
  })
})
