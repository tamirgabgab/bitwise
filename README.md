# Cedar Logic

A digital logic simulator that runs in the browser, inspired by
[CedarLogic](https://github.com/CedarvilleCS/CedarLogic): build a circuit from
gates and watch it simulate as you wire it. A wire is not limited to two
values: pick a radix n from 2 to 16 and every wire carries a digit from 0 to
n-1.

What works today:

- **Circuit editor.** Drag gates onto a canvas, wire them, move, rotate,
  delete, undo and redo, copy and paste, pan and zoom. Light and dark themes.
- **Live simulation.** Switches, push buttons and outputs, wires colored by
  the value they carry, and Run, Pause, Step and Restart with a speed
  setting. The circuit keeps running while you edit it.
- **n-valued logic.** AND is the minimum, OR the maximum, NOT the mirror
  (n-1)-x, and Shift adds a constant modulo n (at radix 2 it is NOT). You
  choose the kit of universal gates to build with: NAND, NOR (Webb),
  Post (Shift + AND), Kleene + Shift, detectors, or field arithmetic when n
  is prime. At radix 2 every kit behaves exactly like Boolean logic.
- **Named circuits.** A project holds several circuits in tabs. Any circuit
  can be used as a part of another: its switches become input pins and its
  outputs output pins. A change to a circuit shows everywhere it is used.
- **Clocks and memory.** A clock, an SR latch and D, T and JK flip-flops
  with Set and Reset, all defined for any radix: a T flip-flop adds its
  input modulo n, so it is one digit of a counter. A number display shows
  several wires as one number.
- **Timing diagram.** A panel under the canvas follows the clocks, switches
  and outputs over the last ticks, and any wire you right-click. Zoom in
  time, freeze the view while the circuit runs on, and point at a tick to
  read every row. A step button runs to the next clock edge, and a circuit
  that oscillates without a clock is pointed out.
- **Saving.** The browser keeps a list of projects as you work: switch
  between them, rename, copy or delete. A project can be saved to and opened
  from a JSON file. Six ready-made examples are in the File menu, two of
  them on buses, and each opens as a project of its own.
- **Finding out what a circuit does.** Point at a wire to see its value and
  what drives it, pause the run when a wire takes a chosen value, step one
  tick back, and read the gate count and the longest delay in the status
  bar; click the delay to see that path on the canvas. The inspector shows
  what every pin of a part carries and what a memory part keeps. A switch
  can have a keyboard key.
- **More parts for n-valued logic.** A switch that cycles through every
  value, converters between one digit and several bits, and the table of
  any gate at the current radix when you point at it in the palette.
- **Buses and larger parts.** Give any part a width and its wires become a
  bus, drawn heavy with the value beside it. A splitter and a merger go
  between a bus and its digits, and a multiplexer, demultiplexer, decoder,
  adder, comparator, register and counter work on whole buses at any radix.
- **Editing help.** Align and spread parts, copy by dragging with Alt, turn
  a selection into a named circuit, and write notes on the canvas. Wires
  find their way around parts, and a selected wire can be dragged aside.
  The slash key adds a part where the pointer is.
- **Showing a circuit.** Save a list of steps, each with switch values and
  a note, and walk through them with the arrow keys. Export the drawing as
  SVG.
- **Finding your way.** Ctrl+K searches every action, part and example,
  and "?" lists the keyboard shortcuts. The palette has a search field and
  sections that fold. A first visit starts with a short tour, an overview
  map appears when the drawing runs off screen, and a wire shows a brief
  wave when its value changes.
- **Simulation core.** Unknown (X) and floating (Z) values next to the
  digits, driver conflicts, and an event-driven engine with per-component
  delays.

See [docs/PLAN.md](docs/PLAN.md) for the roadmap and
[docs/n_ary_logic_sim_spec.md](docs/n_ary_logic_sim_spec.md) (in Hebrew) for
the mathematics behind the gate kits.

## Development

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build to `dist/` |

## License

[MIT](LICENSE)
