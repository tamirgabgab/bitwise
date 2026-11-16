# Work plan

Goal: a comfortable, good-looking logic simulator that runs in the browser,
in the spirit of CedarLogic. You can build architectures out of gates,
flip-flops and (later) state-diagram components, and save the circuits.

Status: Phases 0 to 4 are done. Phase 5 (sequential logic) is next.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Web app. A Tauri desktop wrapper can be added later on the same code. |
| Stack | TypeScript, Vite, React, Canvas 2D for the circuit, Vitest, oxlint |
| UI language | English |
| First version (MVP) | Gates, flip-flops and a clock, with save/load |
| License | MIT, as a clean implementation (see "Licensing") |
| Package manager | npm |

State management is Zustand, added in Phase 2 when the editor first needed it.

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
- **Signal values.** A wire carries one of n digits, 0 to n-1, where the
  radix n is a setting of the whole circuit (2 to 16, default 2). On top of
  the digits there are X (unknown) and Z (high impedance), plus detection of
  two outputs driving one wire to different values.
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
The clock in Phase 5 needs it.

### Phase 2: canvas editor (done)

Built in `src/editor` and `src/ui`:

- `document.ts`: the drawing as an immutable document of parts, junctions
  and wires. Every edit returns a new document, which is what undo steps
  through.
- `routing.ts` and `wireLayout.ts`: wire paths. They are computed from the
  whole drawing and never stored, so wires follow the parts they connect.
- `connectivity.ts` and `simBridge.ts`: nets derived from the wires, and a
  bridge that applies only the difference to the simulator, so a running
  circuit keeps its state while it is edited.
- `symbols.ts` and `render.ts`: gate shapes, pin positions and canvas drawing.
- `canvasController.ts`: pointer and keyboard input for the canvas.
- `store.ts`: the editor state (document, history, selection, view,
  clipboard, theme) as a Zustand store.
- `src/ui`: top bar, parts palette, canvas and status bar.

Choices made with the owner before building:

- **Classic ANSI gate shapes**, as in CedarLogic.
- **Wires route themselves** in horizontal and vertical runs and follow the
  parts when they move. A junction, made by ending a wire on another wire,
  branches a net and can be dragged to steer the wires around it.
- **Light and dark themes** that follow the system, with a toggle.

What works: drag or click a part in from the palette; select by click,
shift-click or marquee; move by dragging or with the arrow keys; rotate (R);
delete; wire pin to pin, pin to wire and wire to wire; undo and redo; copy,
cut and paste; pan (Space or middle button) and zoom (wheel or the top bar).
The engine gained `Simulator.batch`, which applies several edits as one.

Known limits, left for later phases:

- Wire layout is greedy: each wire avoids the wires placed before it, and
  nothing routes around parts. A dense drawing can still look crowded.
- Mouse and keyboard only. Touch works for single-pointer drags, with no
  pinch zoom.

### Phase 3: live simulation and n-valued logic (done)

The owner widened this phase: besides showing the simulation on the canvas,
a wire can now carry n values instead of two. The mathematics, and the
reasoning behind every gate kit, are in
[n_ary_logic_sim_spec.md](n_ary_logic_sim_spec.md) (in Hebrew).

Built in `src/core`:

- `signal.ts`: a digit is 0 to radix-1, or X, or Z. The gate operations are
  the usual generalizations: AND is the minimum, OR the maximum, NOT the
  mirror (n-1)-x, and there are sum and product modulo n.
- `component.ts`: `evaluate` receives the radix through a fourth argument.
- `components/`: NAND is min+1 and NOR is max+1 (the Webb function), both
  modulo n. New parts: Shift (x+k mod n, which is NOT at radix 2), Add, Mul,
  Is (a detector: n-1 when the input equals a chosen digit, else 0),
  Constant, Push button and Output.
- `presets.ts`: the gate kits a project can use, and for which radix each is
  available and universal.
- `simulator.ts`: `radix` and `setRadix`, `restart` (a power cycle), `probe`
  (the resolved value on a pin) and the count of conflicting nets.

Built in `src/editor` and `src/ui`:

- `simRunner.ts`, `simStore.ts` and `session.ts`: the run loop. Wall-clock
  time becomes ticks at 1, 5, 25 or 100 ticks a second, or everything at
  once. Time only moves while a change is waiting, and a frame simulates at
  most 2000 ticks, so an oscillator cannot freeze the page.
- `liveValues.ts` and `valueStyle.ts`: what each wire carries and how it is
  drawn.
- Switches, push buttons, constants and outputs show their value on a face.
  Click a switch to step it to the next value (Shift-click or right-click
  steps back). A push button gives n-1 while it is held.
- Top bar: Run or Pause, Step, Restart and speed. Settings panel: radix,
  gate kit, colors. Inspector: the parameters of the selected part.

Choices made with the owner before building:

- **One round per part.** This round is live simulation and n values.
  Saving with named circuits, and then clocks with flip-flops, each get
  their own round.
- **X and Z stay** next to the digits. The spec's "an unattached wire is 0"
  is therefore replaced: an unattached input floats, as in Phase 1.
- **Kits by default, a sandbox on request.** The palette shows the gates of
  the chosen kit. A "sandbox" setting shows every gate.
- **Saving will be both** autosave in the browser and a JSON file.

Choices made while building, open to change:

- The kits are Classic (radix 2 only), NAND, Kleene + Shift, Post
  (Shift + AND), NOR (Webb), Detectors (Is, AND, OR, Constant), Field (Add,
  Mul, Constant; prime radix only) and Pure Kleene (not universal above
  radix 2, and marked so).
- Radix 2 starts with the Classic kit, a higher radix with NAND. A kit that
  still fits the new radix is kept when the radix changes.
- Changing the radix restarts the circuit: switches go back to 0.
- A switch value lives in the simulator, not in the drawing, so it is not
  part of undo. Saving will have to store it separately.
- Colors: at radix 2 the classic CedarLogic look (dark, red, green for Z,
  blue for X). Above that an editable 10-color palette, and a blue-to-red
  gradient above 10 values. Z is a dashed line, X dotted, a conflict thick
  and dashed. A color too close to the canvas gets an outline.
- Digits next to output pins are on by default above radix 2. An odd radix
  can be shown balanced (-1, 0, +1); that changes the display only.

Covered by unit tests: tables for every gate at several radixes, De Morgan
for radix 2 to 16, backward compatibility of every kit at radix 2, and
universality of each universal kit for radix 2 to 5, shown by building
mirror, OR, constants, detectors and an arbitrary table from the kit's own
gates. Also the run loop, live values, value styling and the settings.

Known limits:

- Derived gates from section 4 of the spec (MOD-SUM, threshold, literal
  gates and others) are not parts of their own yet. They can be built from
  a kit, and they belong with named circuits in Phase 4.
- No truth-table view yet.
- Buses are simulated but cannot be drawn: every part in the editor is one
  digit wide.

### Phase 4: saving and named circuits (done)

- Save to and load from a JSON file, and autosave in the browser. The file
  stores the radix, the kit and the palette. A file without a radix loads
  as radix 2.
- Named circuits: package a drawing under a name and use it as a part. A
  named circuit is valid for the radix it was built in.
- A few ready-made example circuits.

The owner's decisions, asked before the work started:

- A project holds several circuits, each in its own tab. Every other circuit
  of the project shows in the palette and can be dragged in as a part.
- A circuit's pins are its switches (inputs) and its output parts
  (outputs), named by the labels the user gives them.
- Every use is a reference to the original: a change to the circuit shows
  everywhere it is used. A wire on a pin that is deleted is disconnected.
- Named circuits live inside the project file; one file holds everything.

How it was built, and choices made along the way:

- The core is untouched. `src/editor/flatten.ts` expands every named-circuit
  part, as deep as it goes, into plain parts keyed by path (`c7/c3`) before
  `SimBridge` diffs it into the simulator. Inside a circuit, its switches
  and outputs are nodes, not parts.
- A named-circuit part caches its circuit's name and pins (`SubRef`) in the
  document, and `reconcileAll` updates every drawing after each edit, so
  the symbol of a part stays a pure function of the part.
- A circuit can never contain itself, directly or through others: placing,
  pasting and loading all check it.
- A push button inside a circuit stays inside; only switches become pins.
  Unlabeled pins are named `in1`, `out1` and so on, ordered top to bottom,
  then left to right.
- Each circuit has its own simulator, undo history and view; only the open
  one runs. Changing the radix restarts every circuit.
- Deleting a circuit removes its uses elsewhere and cannot be undone, so it
  asks first. Circuit names and project settings are not part of undo.
- The file (format version 1) also keeps each circuit's view and switch
  values. `src/io` parses strictly with messages meant for the user; the
  editor loads leniently. The two describe the same shapes without importing
  each other and meet in `src/ui`, where a test holds them together.
- Two examples: a two-bit binary adder built from half and full adders, and
  ternary Max, Is zero and Equal built from the Kleene + Shift kit, each
  checked against its truth table.

### Phase 5: sequential logic

- Engine support for a component that schedules its own next evaluation.
- Clock with adjustable frequency.
- SR latch, and D, JK and T flip-flops with asynchronous Set/Reset. How a
  clock edge and a flip-flop behave above radix 2 is a question for the
  owner at the start of this phase.

### Phase 6: polish

- Width and delay in the inspector, next to the parameters it has now.
- Text labels on the canvas.
- Wire routing that goes around parts.
- Pinch zoom and other touch gestures.
- Export the circuit as an image.

Dark and light themes and the keyboard shortcuts were planned here and
arrived early, in Phase 2.

### MVP done when

You can build a 4-bit counter from JK flip-flops with a clock, watch it
count, save it, close the browser, and load it back.

## After the MVP

- **Buses and larger components.** Multi-bit wires, multiplexer, decoder,
  adder, register, counter, RAM, ROM.
- **Timing diagram.** Signals over time, oscilloscope style.
- **State-diagram (FSM) editor.** Draw states and transitions, run them as a
  component, and later convert them to a flip-flop circuit automatically.
- **Testing and sharing.** Automatic truth table (n^k rows), testbench, share
  by URL.
- **Desktop build.** A Tauri wrapper around the same code.

## Sources

- [The Best Digital Logic Simulators in 2026 (DigiSim)](https://digisim.io/blog/best-digital-logic-simulators-2026)
- [CedarvilleCS/CedarLogic](https://github.com/CedarvilleCS/CedarLogic)
- [CedarLogic: A New Graphical Digital Logic CAD Tool (ASEE 2007)](https://peer.asee.org/cedarlogic-a-new-graphical-digital-logic-cad-tool)
- [A Simulated Mano Machine (ASEE)](https://peer.asee.org/a-simulated-mano-machine-an-novel-project-for-computer-architecture-class)
- [hneemann/Digital](https://github.com/hneemann/digital)
- [Survey of Simple Logic Simulators (Hackaday)](https://hackaday.com/2021/06/10/survey-of-simple-logic-simulators)
