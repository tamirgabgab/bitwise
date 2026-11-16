# Work plan

Goal: a comfortable, good-looking logic simulator that runs in the browser,
in the spirit of CedarLogic. You can build architectures out of gates,
flip-flops and (later) state-diagram components, and save the circuits.

Status: Phases 0 and 1 are done. Phase 2 is next.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Web app. A Tauri desktop wrapper can be added later on the same code. |
| Stack | TypeScript, Vite, React, Canvas 2D for the circuit, Vitest, oxlint |
| UI language | English |
| First version (MVP) | Gates, flip-flops and a clock, with save/load |
| License | MIT, as a clean implementation (see "Licensing") |
| Package manager | npm |

State management (Zustand) is added in Phase 2, when the editor first needs it.

## What the research showed

### CedarLogic

- C++ with wxWidgets and OpenGL, GPL-3.0. The last stable release is from
  2011/12; later versions added buses and a black-box feature but were
  less stable.
- Its defining idea is build-and-simulate: there is no separate edit mode and
  run mode. Wires are colored by value: red for high, black for low, green
  for high impedance.
- The logic core (`logic/`) is separate from the GUI (`src/gui`), and the
  component library is data in `cl_gatedefs.xml`, not code.
- Components: basic gates, buses, JK and D flip-flops, multiplexers, decoders,
  adders, counters, registers, RAM/ROM and a Z80. Students have used it to
  build a full Mano machine.

### Ideas worth taking from other simulators

- Digital: event-based simulation, an FSM editor, test cases for circuits.
- Logisim Evolution: hierarchical circuits and a timing chronogram.
- CircuitVerse: subcircuits, testbench, sharing a circuit by URL.
- DigiSim and Falstad: signal-propagation animation, an oscilloscope, and
  instant use with no account.

### Licensing

CedarLogic, Logisim Evolution and Digital are all GPL. This project copies
none of their code. It reimplements behavior and ideas, which keeps the
license choice open.

## Architecture

- **Layers.** `src/core` is the simulation engine in pure TypeScript with no
  browser dependency. `src/editor` draws and edits the circuit on a canvas.
  `src/ui` holds the React panels. `src/io` owns the file format.
- **Engine.** Event-driven, with a time-ordered event queue and an integer
  gate delay (default 1). Delays are what make latches and flip-flops built
  from gates settle correctly.
- **Signal values.** Four values: 0, 1, X (unknown) and Z (high impedance),
  plus detection of two outputs driving one wire to different values.
- **Component library.** Each component is data (pins, shape) plus an
  evaluation function, so a new component is one file.
- **File format.** JSON with a `version` field, so old circuits keep loading
  after the format changes.

## Phases to the MVP

### Phase 0: project scaffold (done)

Vite + React + TypeScript, oxlint, Vitest, GitHub Actions CI, MIT license,
`CLAUDE.md`, and the four-layer folder layout.

### Phase 1: simulation core (done)

Built in `src/core`:

- `signal.ts`: the four bit values, bus signals, gate logic per bit, and
  resolution of several drivers on one net.
- `component.ts`: the component definition format (ports, integer
  parameters, a pure `evaluate` function) and the registry.
- `eventQueue.ts`: a min-heap of scheduled output changes.
- `simulator.ts`: components, nets, live editing and the event loop.
- `components/`: AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, and an input
  source that tests and later switches use to drive a circuit.

Choices made with the owner before building:

- **Bus-ready from the start.** Every pin and net has a width. Gates take a
  `width` parameter and work bit by bit.
- **A floating input is unknown.** An unattached input reads Z and gates
  treat it as X, unless the other inputs already decide the output.
- **A delay per component.** Default 1 tick, minimum 1, changeable at any
  time.
- **2 to 8 inputs per gate.** XOR with more than two inputs is odd parity.

Covered by unit tests: full truth tables over 0, 1, X and Z for every gate,
an SR latch from two NOR gates (set, hold, reset, hold, and the race when
both inputs are released together), a ring oscillator that the engine stops
at the tick limit, driver conflicts, buses, and editing a running circuit.

Not built yet, on purpose: a way for a component to wake itself up later.
The clock in Phase 4 needs it.

### Phase 2: canvas editor

- Grid with snapping, pan and zoom.
- Drag components from a palette.
- Select, move, rotate, delete.
- Orthogonal wiring between pins.
- Undo/redo and copy/paste.

### Phase 3: live simulation

- Inputs and outputs: toggle switch, push button, LED.
- Wires colored by value while the circuit runs.
- Run, Pause and Step controls with a speed setting.

### Phase 4: sequential logic

- Engine support for a component that schedules its own next evaluation.
- Clock with adjustable frequency.
- SR latch, and D, JK and T flip-flops with asynchronous Set/Reset.

### Phase 5: save and load

- Save to and load from a JSON file.
- Autosave in the browser.
- Export the circuit as an image.
- A few ready-made example circuits.

### Phase 6: polish

- Dark and light themes.
- Keyboard shortcuts.
- Properties panel for the selected component.
- Text labels on the canvas.

### MVP done when

You can build a 4-bit counter from JK flip-flops with a clock, watch it
count, save it, close the browser, and load it back.

## After the MVP

- **Subcircuits.** Package a circuit as a component (black box). This is the
  basis for building large architectures.
- **Buses and larger components.** Multi-bit wires, multiplexer, decoder,
  adder, register, counter, RAM, ROM.
- **Timing diagram.** Signals over time, oscilloscope style.
- **State-diagram (FSM) editor.** Draw states and transitions, run them as a
  component, and later convert them to a flip-flop circuit automatically.
- **Testing and sharing.** Automatic truth table, testbench, share by URL.
- **Desktop build.** A Tauri wrapper around the same code.

## Sources

- [The Best Digital Logic Simulators in 2026 (DigiSim)](https://digisim.io/blog/best-digital-logic-simulators-2026)
- [CedarvilleCS/CedarLogic](https://github.com/CedarvilleCS/CedarLogic)
- [CedarLogic: A New Graphical Digital Logic CAD Tool (ASEE 2007)](https://peer.asee.org/cedarlogic-a-new-graphical-digital-logic-cad-tool)
- [A Simulated Mano Machine (ASEE)](https://peer.asee.org/a-simulated-mano-machine-an-novel-project-for-computer-architecture-class)
- [hneemann/Digital](https://github.com/hneemann/digital)
- [Survey of Simple Logic Simulators (Hackaday)](https://hackaday.com/2021/06/10/survey-of-simple-logic-simulators)
