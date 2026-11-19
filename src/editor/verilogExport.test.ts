import { describe, expect, it } from 'vitest'
import { addSubcircuit } from './document.ts'
import type { CircuitDoc } from './document.ts'
import { EXAMPLES } from './examples.ts'
import type { Machine } from './machine.ts'
import { fromProjectData } from './project.ts'
import { subRefOf } from './subcircuit.ts'
import type { Circuit, Circuits } from './subcircuit.ts'
import { gateBuilder } from './sumOfProducts.ts'
import { circuitVerilog } from './verilogExport.ts'

/** A project of circuits, each built by `draw`, the last one the open one. */
function project(...drawn: readonly (readonly [name: string, doc: CircuitDoc])[]): { circuits: Circuits; top: string } {
  const circuits: Record<string, Circuit> = {}
  drawn.forEach(([name, doc], index) => {
    circuits[`k${index}`] = { id: `k${index}`, name, doc }
  })
  return { circuits, top: `k${drawn.length - 1}` }
}

/** The Verilog of one circuit standing alone. */
function written(name: string, doc: CircuitDoc): string {
  const { circuits, top } = project([name, doc])
  const file = circuitVerilog(circuits, top, 2)
  if ('problem' in file) throw new Error(file.problem)
  return file.text
}

const pin = (component: string, port: string) => ({ component, port })

function halfAdder(): CircuitDoc {
  const { doc, place, connect } = gateBuilder(2)
  const a = place('input', { label: 'a' })
  const b = place('input', { label: 'b' })
  const xor = place('xor')
  const and = place('and')
  const sum = place('output', { label: 'sum' })
  const carry = place('output', { label: 'carry' })
  connect(pin(a, 'out'), pin(xor, 'in0'))
  connect(pin(b, 'out'), pin(xor, 'in1'))
  connect(pin(a, 'out'), pin(and, 'in0'))
  connect(pin(b, 'out'), pin(and, 'in1'))
  connect(pin(xor, 'out'), pin(sum, 'in'))
  connect(pin(and, 'out'), pin(carry, 'in'))
  return doc()
}

describe('circuitVerilog', () => {
  it('writes gates of one bit as primitives that drive the outputs themselves', () => {
    expect(written('Half adder', halfAdder())).toBe(
      [
        '// Written by Bitwise. Delays are left out.',
        '',
        '// Half adder',
        'module Half_adder (',
        '  input a,',
        '  input b,',
        '  output sum,',
        '  output carry',
        ');',
        '  xor g1 (sum, a, b);',
        '  and g2 (carry, a, b);',
        'endmodule',
        '',
      ].join('\n'),
    )
  })

  it('is written only at radix 2', () => {
    const { circuits, top } = project(['Half adder', halfAdder()])
    expect(circuitVerilog(circuits, top, 3)).toEqual({ problem: expect.stringMatching(/only at radix 2/) })
  })

  it('writes buses with operators, and an adder with its carries', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a', params: { width: 4 } })
    const b = place('input', { label: 'b', params: { width: 4 } })
    const cin = place('input', { label: 'cin' })
    const adder = place('adder', { params: { width: 4 } })
    const nand = place('nand', { params: { width: 4 } })
    const sum = place('output', { label: 'sum', params: { width: 4 } })
    const cout = place('output', { label: 'cout' })
    const both = place('output', { label: 'both', params: { width: 4 } })
    connect(pin(a, 'out'), pin(adder, 'a'))
    connect(pin(b, 'out'), pin(adder, 'b'))
    connect(pin(cin, 'out'), pin(adder, 'cin'))
    connect(pin(adder, 'sum'), pin(sum, 'in'))
    connect(pin(adder, 'cout'), pin(cout, 'in'))
    connect(pin(a, 'out'), pin(nand, 'in0'))
    connect(pin(b, 'out'), pin(nand, 'in1'))
    connect(pin(nand, 'out'), pin(both, 'in'))
    const text = written('Sum', doc())
    expect(text).toContain('  input [3:0] a,')
    expect(text).toContain('  output [3:0] sum,')
    expect(text).toContain('  assign {cout, sum} = a + b + cin;')
    expect(text).toContain('  assign both = ~(a & b);')
  })

  it('leaves out a carry nobody reads, and counts an unattached carry in as 0', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a', params: { width: 2 } })
    const subtractor = place('subtractor', { params: { width: 2 } })
    const out = place('output', { label: 'y', params: { width: 2 } })
    connect(pin(a, 'out'), pin(subtractor, 'a'))
    connect(pin(subtractor, 'diff'), pin(out, 'in'))
    expect(written('Less', doc())).toContain("  assign y = a - 2'bz;")
  })

  it('keeps a value in a reg with an always block, and reads reset only when it is wired', () => {
    const { doc, place, connect } = gateBuilder(2)
    const d = place('input', { label: 'd' })
    const clock = place('clock', { label: 'clk' })
    const reset = place('button', { label: 'rst' })
    const first = place('dff', { label: 'first' })
    const second = place('dff')
    const q = place('output', { label: 'q' })
    const nq = place('output', { label: 'nq' })
    connect(pin(d, 'out'), pin(first, 'd'))
    connect(pin(clock, 'out'), pin(first, 'clk'))
    connect(pin(clock, 'out'), pin(second, 'clk'))
    connect(pin(reset, 'out'), pin(first, 'reset'))
    connect(pin(first, 'q'), pin(second, 'd'))
    connect(pin(second, 'q'), pin(q, 'in'))
    connect(pin(second, 'nq'), pin(nq, 'in'))
    const text = written('Shift', doc())
    // A clock and a button are inputs, after the switches.
    expect(text).toContain('  input d,\n  input clk,\n  input rst,\n  output q,')
    expect(text).toContain("  reg first_q = 1'b0;")
    expect(text).toContain(
      ["  always @(posedge clk or posedge rst)", "    if (rst) first_q <= 1'b0;", '    else first_q <= d;'].join('\n'),
    )
    expect(text).toContain(['  always @(posedge clk)', '    w1 <= first_q;'].join('\n'))
    expect(text).toContain('  assign q = w1;')
    expect(text).toContain('  assign nq = ~w1;')
  })

  it('writes every circuit of every example at radix 2', () => {
    for (const example of EXAMPLES) {
      const loaded = fromProjectData(example.build())
      if (loaded.settings.radix !== 2) continue
      for (const id of loaded.order) {
        const file = circuitVerilog(loaded.circuits, id, 2)
        if ('problem' in file) throw new Error(`${example.id}: ${file.problem}`)
        expect(file.text).toContain(`module ${file.top} (`)
        expect(file.text).not.toMatch(/posedge \d/)
      }
    }
  })

  it('writes no clocked block for a part whose clock nothing drives', () => {
    const { doc, place, connect } = gateBuilder(2)
    const d = place('input', { label: 'd' })
    const reset = place('input', { label: 'rst' })
    const idle = place('dff', { label: 'idle' })
    const cleared = place('dff', { label: 'cleared' })
    const q = place('output', { label: 'q' })
    const r = place('output', { label: 'r' })
    connect(pin(d, 'out'), pin(idle, 'd'))
    connect(pin(d, 'out'), pin(cleared, 'd'))
    connect(pin(reset, 'out'), pin(cleared, 'reset'))
    connect(pin(idle, 'q'), pin(q, 'in'))
    connect(pin(cleared, 'q'), pin(r, 'in'))
    const text = written('Still', doc())
    expect(text).not.toMatch(/posedge \d/)
    expect(text.match(/always/g)).toHaveLength(1)
    expect(text).toContain(["  always @(posedge rst)", "    if (rst) cleared_q <= 1'b0;"].join('\n'))
  })

  it('writes a register, a counter, a multiplexer and a comparator', () => {
    const { doc, place, connect } = gateBuilder(2)
    const d = place('input', { label: 'd', params: { width: 4 } })
    const clock = place('clock')
    const load = place('input', { label: 'load' })
    const counter = place('counter', { label: 'count', params: { width: 4 } })
    const register = place('register', { label: 'held', params: { width: 4 } })
    const compare = place('compare', { params: { width: 4 } })
    const mux = place('mux', { params: { width: 4 } })
    const out = place('output', { label: 'y', params: { width: 4 } })
    const full = place('output', { label: 'full' })
    connect(pin(clock, 'out'), pin(counter, 'clk'))
    connect(pin(clock, 'out'), pin(register, 'clk'))
    connect(pin(load, 'out'), pin(counter, 'load'))
    connect(pin(d, 'out'), pin(counter, 'd'))
    connect(pin(counter, 'q'), pin(register, 'd'))
    connect(pin(counter, 'q'), pin(compare, 'a'))
    connect(pin(register, 'q'), pin(compare, 'b'))
    connect(pin(compare, 'gt'), pin(mux, 'sel'))
    connect(pin(counter, 'q'), pin(mux, 'in0'))
    connect(pin(register, 'q'), pin(mux, 'in1'))
    connect(pin(mux, 'out'), pin(out, 'in'))
    connect(pin(counter, 'co'), pin(full, 'in'))
    const text = written('Mixed', doc())
    expect(text).toContain("  reg [3:0] count_q = 4'd0;")
    expect(text).toContain(
      ['  always @(posedge clk)', '    if (load) count_q <= d;', "    else count_q <= count_q + 4'd1;"].join('\n'),
    )
    expect(text).toContain("  assign full = count_q == 4'b1111;")
    expect(text).toContain(['  always @(posedge clk)', '    held_q <= count_q;'].join('\n'))
    expect(text).toContain('  assign w1 = count_q > held_q;')
    expect(text).toContain('  assign y = w1 ? held_q : count_q;')
  })

  it('takes a bus apart and puts it together with selects and braces', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a', params: { width: 4 } })
    const split = place('split', { params: { width: 4, each: 2 } })
    const merge = place('merge', { params: { width: 4, each: 2 } })
    const out = place('output', { label: 'swapped', params: { width: 4 } })
    connect(pin(a, 'out'), pin(split, 'in'))
    connect(pin(split, 'd0'), pin(merge, 'd1'))
    connect(pin(split, 'd1'), pin(merge, 'd0'))
    connect(pin(merge, 'out'), pin(out, 'in'))
    const text = written('Swap', doc())
    expect(text).toContain('  assign w1 = a[1:0];')
    expect(text).toContain('  assign w2 = a[3:2];')
    expect(text).toContain('  assign swapped = {w1, w2};')
  })

  it('writes a rotating shifter as a barrel, one stage for each bit of the amount', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a', params: { width: 4 } })
    const amount = place('input', { label: 'n', params: { width: 2 } })
    const shifter = place('shifter', { params: { width: 4, select: 2, left: 1, rotate: 1 } })
    const out = place('output', { label: 'y', params: { width: 4 } })
    connect(pin(a, 'out'), pin(shifter, 'in'))
    connect(pin(amount, 'out'), pin(shifter, 'amt'))
    connect(pin(shifter, 'out'), pin(out, 'in'))
    const text = written('Turn', doc())
    expect(text).toContain('  assign turn1 = n[0] ? {a[2:0], a[3]} : a;')
    expect(text).toContain('  assign y = n[1] ? {turn1[1:0], turn1[3:2]} : turn1;')
  })

  it('writes a table gate from its answers', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a' })
    const b = place('input', { label: 'b' })
    // 1 only when a is 1 and b is 0.
    const table = place('table', { params: { inputs: 2, c0: 0, c1: 0, c16: 1, c17: 0 } })
    const out = place('output', { label: 'y' })
    connect(pin(a, 'out'), pin(table, 'in0'))
    connect(pin(b, 'out'), pin(table, 'in1'))
    connect(pin(table, 'out'), pin(out, 'in'))
    expect(written('Table', doc())).toContain('  assign y = a & ~b;')
  })

  it('writes a state machine as a case over its state, Moore and Mealy', () => {
    const machine: Machine = {
      inputs: ['go'],
      outputs: ['on'],
      states: [
        { id: 's1', name: 'Off', pos: { x: 0, y: 0 }, outputs: [0] },
        { id: 's2', name: 'On', pos: { x: 0, y: 0 }, outputs: [1] },
      ],
      rules: [
        { from: 's1', to: 's2', when: [1], outputs: [1] },
        { from: 's2', to: 's1', when: [0], outputs: [0] },
      ],
    }
    const drawn = (kind: Machine): string => {
      const { doc, place, connect } = gateBuilder(2)
      const go = place('input', { label: 'go' })
      const clock = place('clock')
      const part = place('fsm', { label: 'lamp', machine: kind } as never)
      const out = place('output', { label: 'on' })
      connect(pin(go, 'out'), pin(part, 'in0'))
      connect(pin(clock, 'out'), pin(part, 'clk'))
      connect(pin(part, 'out0'), pin(out, 'in'))
      return written('Lamp', doc())
    }
    const moore = drawn(machine)
    expect(moore).toContain("  reg lamp_state = 1'd0;")
    expect(moore).toContain(
      [
        '  always @(posedge clk)',
        '      case (lamp_state)',
        "        1'd0: begin // Off",
        "          if (go) lamp_state <= 1'd1;",
        '        end',
        "        1'd1: begin // On",
        "          if (~go) lamp_state <= 1'd0;",
        '        end',
        '        default: lamp_state <= lamp_state;',
        '      endcase',
      ].join('\n'),
    )
    expect(moore).toContain("  assign on = lamp_state == 1'd1;")

    const mealy = drawn({ ...machine, mealy: true })
    expect(mealy).toContain('  reg lamp_out0;')
    expect(mealy).toContain(
      [
        '  always @(*)',
        '    case (lamp_state)',
        "      1'd0: begin // Off",
        "        if (go) begin lamp_out0 = 1'b1; end",
        "        else begin lamp_out0 = 1'b0; end",
        '      end',
      ].join('\n'),
    )
    expect(mealy).toContain('  assign on = lamp_out0;')
  })

  it('writes a circuit used as a part as a module of its own, and hands its clock up', () => {
    const inner = gateBuilder(2)
    const d = inner.place('input', { label: 'd' })
    const clock = inner.place('clock', { label: 'clk' })
    const flop = inner.place('dff')
    const q = inner.place('output', { label: 'q' })
    inner.connect(pin(d, 'out'), pin(flop, 'd'))
    inner.connect(pin(clock, 'out'), pin(flop, 'clk'))
    inner.connect(pin(flop, 'q'), pin(q, 'in'))
    const cell: Circuit = { id: 'k0', name: 'Cell', doc: inner.doc() }

    const outer = gateBuilder(2)
    const x = outer.place('input', { label: 'x' })
    const y = outer.place('output', { label: 'y' })
    const placed = addSubcircuit(outer.doc(), subRefOf(cell), { x: 40, y: 0 })
    const { circuits, top } = project(['Cell', cell.doc], ['Top', placed.doc])
    const file = circuitVerilog(
      {
        ...circuits,
        k1: {
          ...circuits.k1,
          doc: connectAll(placed.doc, [
            [pin(x, 'out'), pin(placed.id, d)],
            [pin(placed.id, q), pin(y, 'in')],
          ]),
        },
      },
      top,
      2,
    )
    if ('problem' in file) throw new Error(file.problem)
    expect(file.top).toBe('Top')
    expect(file.text.indexOf('module Cell')).toBeLessThan(file.text.indexOf('module Top'))
    expect(file.text).toContain('module Top (\n  input x,\n  input u_Cell_clk,\n  output y\n);')
    expect(file.text).toContain('  Cell u_Cell (.d(x), .clk(u_Cell_clk), .q(y));')
  })

  it('gives every name a form Verilog takes, and each one once', () => {
    const { doc, place, connect } = gateBuilder(2)
    const first = place('input', { label: 'wire' })
    const second = place('input', { label: '2 fast' })
    const third = place('input', { label: 'a-b' })
    const fourth = place('input', { label: 'a b' })
    const or = place('or', { params: { inputs: 4 } })
    const out = place('output', { label: 'סוף' })
    ;[first, second, third, fourth].forEach((id, index) => connect(pin(id, 'out'), pin(or, `in${index}`)))
    connect(pin(or, 'out'), pin(out, 'in'))
    const text = written('module', doc())
    expect(text).toContain('module module_2 (\n  input wire_2,\n  input in_2_fast,\n  input a_b,\n  input a_b_2,\n  output out\n);')
    expect(text).toContain('  or g1 (out, wire_2, in_2_fast, a_b, a_b_2);')
  })

  it('refuses a wire that joins pins of different widths', () => {
    const { doc, place, connect } = gateBuilder(2)
    const a = place('input', { label: 'a', params: { width: 4 } })
    const not = place('not')
    connect(pin(a, 'out'), pin(not, 'in'))
    const { circuits, top } = project(['Mixed', doc()])
    expect(circuitVerilog(circuits, top, 2)).toEqual({ problem: expect.stringMatching(/different widths/) })
  })
})

/** The drawing with a wire for each pair of pins. */
function connectAll(
  doc: CircuitDoc,
  pairs: readonly (readonly [{ component: string; port: string }, { component: string; port: string }])[],
): CircuitDoc {
  let next = doc
  for (const [from, to] of pairs) {
    const id = `w${next.nextId}`
    next = {
      ...next,
      wires: { ...next.wires, [id]: { id, from: { kind: 'pin', ...from }, to: { kind: 'pin', ...to } } },
      nextId: next.nextId + 1,
    }
  }
  return next
}
