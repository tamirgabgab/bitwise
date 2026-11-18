# Bitwise

A browser-based digital logic simulator inspired by CedarLogic: build a
circuit and watch it simulate at the same time. The roadmap and the
reasoning behind the architecture live in `docs/PLAN.md`.

The app was called Cedar Logic until November 2026. The browser storage
keys (`cedar-logic.*`) and the file format mark (`FILE_FORMAT`) keep the old
name, so saved projects and files still open; do not rename them. A saved
file is now `.bitwise.json`, and `.cedar.json` still opens.

## Commands

- `npm run dev` — start the dev server
- `npm test` — run unit tests once (`npm run test:watch` to watch)
- `npm run lint` — oxlint
- `npm run build` — type-check, then build to `dist/`
- `npm run pictures` — draw the README pictures again (`scripts/readme-pictures.ts`
  into `docs/pictures`); run it after a change to how circuits look

Run lint, test and build before calling a change done. CI runs the same three.

Every push to `main` that passes them is published to GitHub Pages
(`.github/workflows/pages.yml`), at https://tamirgabgab.github.io/bitwise/.
The build uses relative paths (`base: './'`), so it works under that folder.

## Layers

- `src/core` — simulation engine. Pure TypeScript: no React, no DOM, no
  imports from other `src/` layers. It must run in Node and in a Web Worker.
- `src/editor` — canvas rendering and interaction. May import `core`.
- `src/ui` — React panels and app shell. May import `core`, `editor`, `io`.
- `src/io` — file format, save/load, export. May import `core`.

## Core model

- A wire carries a digit: 0 to radix-1, or X (unknown), or Z (floating). The
  radix (2 to 16, default 2) belongs to the whole circuit, `Simulator.radix`.
  Changing it restarts the circuit. A `Signal` is an array of digits with
  the least significant at index 0. Text form (`parseSignal`,
  `formatSignal`) puts the most significant first and uses 0-9, A-F, X, Z.
- Gates are defined for any radix and must reduce to Boolean logic at radix
  2: AND is min, OR is max, NOT is (n-1)-x, NAND is min+1 and NOR is max+1
  modulo n, XOR is the sum modulo n, Shift is x+k modulo n. `evaluate` gets
  the radix through its fourth argument, `env`. A digit the radix has no
  room for reads as X.
- `presets.ts` lists the gate kits and says for which radix each one is
  available and universal. `presets.test.ts` proves it by construction;
  the mathematics is in `docs/n_ary_logic_sim_spec.md`.
- Every pin and net has a width. Width 1 is a plain wire, more is a bus.
  A net has one width: the editor never joins pins of different widths.
- Larger parts work on buses and follow the flip-flop rules at radix n:
  `components/bus.ts` (splitter, merger), `select.ts` (multiplexer,
  demultiplexer, decoder: one select digit chooses among n ways),
  `arith.ts` (adder, comparator) and `register.ts` (register, counter). A
  flag such as a carry is 0 or the top value, and a control input is on
  only at the top value. Unattached, `cin` is 0, `en` is on, and `load` and
  `reset` are off.
- A net is one electrical node. Several outputs may drive it: Z drivers are
  ignored, and two different digits read as X and set the net's `conflict`
  flag.
- An unattached input floats (Z), and gates treat Z like X.
- Time is integer ticks. A component is evaluated when one of its inputs
  changes, and its outputs take effect `delay` ticks later. Delay is per
  component and at least 1, which is what keeps oscillating circuits from
  hanging the engine. Do not allow a delay of 0.
- An output is X until its first evaluation takes effect. `restart()` puts
  the whole circuit back in that state.
- A component can wake itself: `evaluate` returns `wake: k` to be evaluated
  again in k ticks (at least 1), and that evaluation gets `env.woke`. One
  request per component at a time. Only the clock uses it. A circuit with a
  running clock never settles: `pendingEvents` stays above 0 and `settle()`
  returns false, so tests of clocked circuits use `run`. A clock whose `on`
  parameter is 0 is stopped: it gives 0 and never wakes.
- Sequential parts (`components/sequential.ts`) follow the owner's rules for
  radix n: the clock alternates between 0 and the top value; a clock input
  is high when 2 * value >= radix, and a rising edge is low to high, never
  out of X or Z; J, K, S, R, Set and Reset are on only at the top value; T
  adds its value modulo n; Q starts at 0. An unknown control input makes the
  outputs X but must not destroy the stored value. A part that keeps a
  value says what it is through `stored` in its `ComponentDef`; the
  inspector shows it.
- The simulator generates numeric component and net ids. The editor keeps
  its own ids and maps them.
- The core knows nothing about named circuits. The editor flattens them
  first (`flatten.ts`), so do not add hierarchy to the engine.

## Editor model

- The drawing is an immutable `CircuitDoc` (`src/editor/document.ts`): parts
  with a position and rotation, junctions, and wires between terminals. An
  edit returns a new document, and undo and redo step through old ones.
- Positions are in grid units. Pins and junctions sit on whole numbers. One
  unit is 16 px at 100% zoom.
- A wire stores only its two ends, each a pin or a junction. Its path is
  never saved: `wireLayout.ts` routes all wires of a document together, so
  wires of different nets do not touch, and caches the result per document.
- Nets are derived from the wires (`connectivity.ts`). `SimBridge` applies
  only the difference to the simulator, inside `sim.batch`, so untouched
  parts keep their state while the user edits. Do not rebuild the simulator
  from scratch on an edit.
- Symbols (`symbols.ts`) own the pin positions. Pin names must match the
  port names in `src/core`; a test checks this for every built-in type.
- A symbol does not draw the leads of its pins. Each pin says how long its
  lead is (`lead`, 1 by default), and `drawPart` in `render.ts` draws it
  under the body: in the look of the wire on the pin when it has one, so a
  value's color runs up to the part, otherwise like the outline.
- `CanvasController` owns pointer and keyboard input for the canvas. React
  draws only the chrome around it and reaches the editor through the
  `useEditor` store.
- Project settings (radix, gate kit, sandbox, value colors) live in the
  `useEditor` store next to the document. They are not part of undo.
- A project holds several circuits (`circuits`, `order`, `active`). The open
  one's drawing is `doc`, and `circuits[active].doc` is always the same
  object. Each circuit has its own undo history and view.
- A part of type `SUB_TYPE` stands for another circuit of the project. It
  caches that circuit's name and pins as a `SubRef`; `reconcileAll`
  (`subcircuit.ts`) brings every drawing up to date after each edit. Its
  pins are the circuit's switches and output parts, by part id. A circuit
  must never contain itself: check `canPlace` before adding one.
- The value of a switch lives in the simulator, not in the document, so
  toggling one is not an edit and is not undone.
- A part gets its width from its `width` parameter (`widths.ts`, at most
  `MAX_BUS` in the inspector). When a wire joins pins of different widths,
  `SimBridge` keeps each width on a net of its own and reports the wire as
  `mixed`; it is drawn like a conflict. The value of a wide switch is a
  string of digits (`InputValue`), in steps and in the saved file.
- A bus is drawn heavy and in the neutral wire color, with its value written
  beside the longest straight run of the net. Value colors are for wires of
  one digit.
- Larger parts are drawn by `blockSymbol` in `symbols.ts`: a titled box with
  inputs on the left, outputs on the right and steering pins underneath.
  `placement.ts` says what a part starts with: a choosing part gets one way
  for every value of the radix.
- `session.ts` owns one `SimBridge` per circuit and the run loop; only the
  open circuit runs. `SimRunner` turns
  wall-clock time into ticks; time moves only while a change is waiting, and
  a frame simulates at most 2000 ticks. It advances one tick at a time so
  the timing diagram misses nothing. `useSim` holds what the chrome shows
  (running, speed, tick, conflicts, clocks, oscillating).
- The timing diagram (`scope.ts`, `scopeRender.ts`) picks its own rows: the
  clocks, switches and outputs of the open circuit, plus any wire the user
  right-clicked (`toggleWatch` in `session.ts`). Each circuit has its own
  `Recorder`, which keeps only the changes. Zoom, freeze and the cursor are
  a `ScopeView` that lives in `TimingPanel`; freezing stops only the
  scrolling, never the simulation. It is drawn like the screen of a scope:
  every fifth mark is a major division down the rows, the others are small
  crosses at the row edges, and a bus is a lane with crossed ends. This is
  the one bold place of the chrome; the top bar and the empty canvas stay
  quiet.
- The simulation controls (run, steps, restart, speed) sit in one framed
  strip, `.transport`. Under `pointer: coarse` every target is at least
  40px; those rules sit last in `App.css` so they win.
- A destructive action asks first and names what it destroys. Inside a
  dialog (the projects window) the question is asked in place, in the row,
  never as a second dialog.
- `liveValues.ts` reads what each wire carries and `valueStyle.ts` decides
  how it is drawn: the classic look at radix 2, a palette up to 10 values,
  a gradient above. Z is dashed, X dotted, a conflict thick and dashed.
- A wire must not run through a part. `wireLayout.ts` first tries the simple
  channels of `routing.ts`; when all of them touch a part or another net,
  `mazeRoute.ts` searches the grid for a way around. Text labels are not
  obstacles. The search is bounded (`MARGIN`, `MAX_AREA`, `MAX_VISITS`), and
  the layout runs for every drag preview, so keep it cheap.
- A text label is a part of type `TEXT_TYPE` with a `text` field and no
  pins. `flatten.ts` skips it, so the simulator never sees it.
- `arrange.ts` aligns and spreads parts; `extract.ts` turns a selection
  into a named circuit (switches and outputs stay behind, and every wire
  that crosses the edge of the selection becomes a pin).
- Presentation steps (`steps.ts`) belong to a circuit: a note and the
  values of its switches. They are saved with the project but are not part
  of undo. While the steps panel is open, the arrow keys walk the steps.
- `svgExport.ts` draws a circuit through the same `render.ts` code as the
  screen, into `SvgContext`, which records the canvas calls as SVG. A new
  canvas call in `render.ts` needs its counterpart there.
- The longest path (`criticalPath` in `core/cost.ts`) is marked on the
  canvas while `useSim.criticalShown` is on. `criticalMarks` in
  `session.ts` maps it to parts and wires, cached until the next edit.
- Dragging a selected wire moves the straight stretch under the pointer
  (`runAt` in `wireLayout.ts`): `bendWire` puts a junction at each end of
  it and moves them, so the file format has no bends of its own.
- ROM and RAM (`components/memory.ts`) hold up to `MAX_WORDS` words of up
  to `MAX_WORD_WIDTH` digits, in the parameters `m0` to `m255`, written for
  radix 16 like a table gate. The address pin is `address` digits wide; an
  address past the words reads X. A RAM writes `d` on the rising edge of
  `clk` while `we` is on (unattached, off), starts from the same words and
  goes back to them on a restart; `memory` in its `ComponentDef` gives the
  inspector every word (`MemoryEditor.tsx`).
- A state machine (`components/machine.ts`, type `fsm`) is Moore: on the
  rising edge of `clk` it follows the first rule of its state whose
  conditions the inputs meet, and `reset` at the top value takes it at once
  to state 0, the start. The engine reads it from parameters; the drawing
  keeps the `Machine` on the part (`editor/machine.ts`: inputs, outputs,
  states with a name and a place, rules), and `compileMachine` makes the
  parameters again on every change and on load. `MachineEditor.tsx` draws
  it in a window of its own (double-click the part). `machineCircuit.ts`
  builds it from D flip-flops and gates as a new circuit: state k is kept
  as the digits of k, and each function is a sum of products minimized in
  the manner of Quine and McCluskey at any radix, up to `MAX_MACHINE_ROWS`
  rows. A test proves the result behaves like the part.
- A table gate (`components/table.ts`, type `table`) keeps its answers in
  the parameters `c0` to `c255`, laid out for radix 16 (`tableCell`), so it
  keeps them when the radix changes; one it has no room for reads as X. The
  inspector edits them (`TableEditor.tsx`).
- `truthTable.ts` gives the truth table of a part with no memory: a
  built-in part from its `evaluate`, a named circuit by running it once a
  row. At most `MAX_TRUTH_ROWS`; otherwise it gives a reason.
- While parts are dragged, `guides.ts` finds where their box or pins line
  up with a part that stays put, and `render.ts` draws the guides.
- With the pointer on a switch, a digit key (`digitKeys.ts`) puts it on
  that value and the wheel steps it; elsewhere the wheel zooms. This wins
  over a key the user gave a switch.
- The cone of influence (`cone.ts`, `useSim.coneShown`) lights what the
  selection drives and fades what has nothing to do with it.
- Undo keeps only drawings. `describeEdit` (`editNames.ts`) names a step
  from the difference between the drawing before and after it ("Add AND",
  "Connect wire"), and `jumpHistory` goes straight to any step; the edit
  history window (`HistoryDialog.tsx`) lists them.
- A part with no wires that is dropped onto a wire, by a drag or from the
  palette, goes into it (`splice.ts`): the side with a driver goes to an
  input, an output takes the rest. Only a wire of the width of its pins.
- A frame is a part of type `FRAME_TYPE` with a title (`text`) and a
  `size`; its `pos` is its top left corner. Like a text label it is not in
  the circuit and wires may pass it. Whatever lies wholly inside it moves
  and copies with it (`withFrameContents`). It is picked up by its title
  band or its edge, resized from its lower right corner, and drawn under
  everything in tints of the ink, never a value color or amber unless it
  is selected.
- A net label is a part of type `NET_TYPE` with one pin, `NET_PIN`, and
  its name in `label`. Labels with the same name in one drawing are one
  node: `terminalNets` and `flatten` join them, each within its own
  drawing, so a name never reaches into or out of a named circuit. The wire
  layout asks `terminalNets(doc, false)`, so two tagged groups are never
  drawn touching. `extract.ts` leaves labels behind, and the new pin takes
  the label's name.
- How a bus is written (`busFormat.ts`): digits, decimal, balanced with a
  sign, or hex. The choice is `format` on the wires of the net, saved with
  the drawing; any wire of a net gives it to the whole net, and new wires
  cut from one keep it. The canvas, the inspector, the meter board and the
  timing diagram all write a bus through it.
- The meter board (`MeterBoard.tsx`) and the timing diagram's markers A and
  B live only for the session: the board in `session.ts` next to the
  watched wires, the markers in `TimingPanel`.
- `problems.ts` lists what is likely a mistake: unattached inputs (not
  `cin`, `en`, `load`, `set` or `reset`), wires nothing drives, loops with
  no memory part, parts that drive nothing, and from the running circuit
  conflicts and mixed widths. The status bar counts the ones read off the
  drawing; the strip under the canvas lists them all.
- `layout.ts` (`autoLayout`) arranges the whole open circuit as one edit:
  each part a column after what feeds it (longest path, back edges of a
  loop cut), switches first and outputs last, rows by where the feeders
  sit. A top-level frame moves as one block with what it holds, a net
  label with its part, a text with the part beside it. Bend junctions are
  dropped; branch junctions go to the middle of their neighbours.
- `describe.ts` tells a circuit in words: what it is made of, what each
  output depends on, and the first problem. The same text is the canvas's
  `aria-description` and the "Describe the circuit" window. A named
  circuit is not a built-in type: check `builtinComponents.has` before
  `get`, which throws.
- Breakpoints (`session.ts`, `SimRunner`) and the probe (`probeStore.ts`)
  live only for the session. Step back uses a short history of simulator
  states, `HISTORY_TICKS` in `simRunner.ts`.
- The canvas look (`canvasLook`: classic, blueprint, chalk, scope) and the
  gate style (`gateStyle`: ANSI or IEC) are app preferences in `useEditor`,
  next to the theme, each under its own storage key. A look is
  `data-canvas` on the page and repaints only the canvases (`.canvas`,
  `.minimap`, the timing diagram), never the chrome; an SVG picture keeps
  the plain look. An IEC face is `iec` on a gate's symbol, picked by
  `inStyle`, and shares its pins and bounds, so nothing moves.
  `canvasLooks.test.ts` reads `index.css` and checks every look's signal
  colors against its background.
- Canvas colors come from CSS variables in `src/index.css`. Amber is the
  only accent color; the other hues are reserved for signal values.
- Keyboard shortcuts match on `event.code`, so they work on any layout.

## App chrome

- `useChrome` (`src/ui/chrome.ts`) holds what belongs to the app and not to
  the project: the open overlay (command search, shortcuts, tour, home,
  versions), presentation mode, folded
  palette sections, parts used lately, the height of the timing panel and
  whether the tour was shown. It is saved under its own storage key.
- The slash key opens the command search as quick add (`quickAdd` in
  `useChrome`): it lists only commands with `place`, and puts the part at
  `canvasRuntime.pointerGrid()`, or mid-canvas when the pointer is away.
- `listCommands()` (`commands.ts`) is the one list of actions behind the
  command search. A command with a shortcut must also be in `shortcuts.ts`;
  a test checks it.
- Overlays are native `<dialog>` elements opened with `showModal()`
  through `useModal` (`src/ui/useModal.ts`). The
  canvas ignores keys whose target is inside a dialog.
- The inspector is docked on the right and is there only while something
  is selected. On a phone it is a bottom sheet. Its numbers are `Stepper`s:
  a typed field between − and +, checked by `readWholeNumber`
  (`wholeNumber.ts`) against the range, with a note naming the range when
  a value is refused.
- `paletteModel.ts` decides the palette sections and the search;
  `minimap.ts` the overview map, shown only when part of the drawing is out
  of sight; `toasts.ts` the short messages; `tour.ts` the steps of the tour
  and where its card goes.
- `pulses.ts` notes which wires changed and which way a wire carries its
  value. `render.ts` draws the wave only when the scene has `pulse`: never
  in an SVG export, and never under `prefers-reduced-motion`.
- The base calculator (`BaseCalculator.tsx`, `calculator.ts`) is an
  overlay; it starts at the project's radix.
- A chip for a value gets its colors from `swatch.ts`, in the settings
  panel and in the legend alike.
- Values (wire and probe readouts, digits and buses on the canvas, the
  timing diagram) are set in IBM Plex Mono: `--font-mono` in CSS,
  `drawValue` in `render.ts`, `VALUE_FONT` in `scopeRender.ts`. Both
  canvases redraw on `document.fonts` `loadingdone`.
- Font sizes come from the four `--text-*` variables in `src/index.css`.
  Do not write a pixel size in `App.css`.
- `.ux-profile.md` at the root is the visual and copy standard ("Instrument",
  on a Linear base) that the UX skills and `ux-audit` read. Read it before
  changing UI, CSS or microcopy.
- The home screen (`HomeScreen.tsx`, overlay `home`) is where every visit
  but the first starts (the first starts with the tour). It lists the
  projects the browser keeps and the examples, each with a picture
  (`Thumbnail.tsx`, from `projectSvg` in `svgExport.ts`), drawn one at a
  time after the screen shows and kept in memory.
- Presentation mode (`presentation.ts`, `useChrome.presenting`) hides the
  chrome with the `.presenting` class, asks for the browser's full screen,
  opens the steps when the circuit has some, and draws the pointer as an
  amber laser (`LaserPointer.tsx`). Esc or leaving full screen ends it;
  clicks still reach the canvas.

## Conventions

- Every behavior in `src/core` gets a unit test next to it (`*.test.ts`).
  Editor logic that is not drawing or input handling is tested the same way.
- Components (gates, flip-flops, ...) are defined as data plus a pure
  `evaluate` function, one file per component family under
  `src/core/components`, and registered in `components/index.ts`. Adding one
  must not touch the engine.
- Saved files carry `FILE_FORMAT_VERSION`. A breaking format change bumps it
  and adds a migration from the previous version.
- The file shape is described twice: `src/io/projectFile.ts` (strict parse
  with user-facing errors) and `src/editor/project.ts` (lenient load). They
  do not import each other and meet in `src/ui` (`persistence.ts`); change
  both together, and `projectRoundTrip.test.ts` checks they still match.
- A file can come from anyone, and the site is public. Both readers keep
  the same limits (`MAX_COORD`, `MAX_ITEMS`, `MAX_CIRCUITS`,
  `MAX_FLAT_PARTS`, the delay, `MAX_FILE_LENGTH`): the strict one refuses,
  the lenient one cuts, and `store.ts` makes no edit that would go past
  them. An id must pass `isSafeId`, and a record keyed by a value from a
  file is read with `Object.hasOwn`, never `in`. SVG text goes through
  `escapeXml`. The built page carries a Content Security Policy
  (`src/csp.ts`): no inline script or style, nothing from another site.
- The browser keeps a list of projects (`src/io/storage.ts`): an index under
  `cedar-logic.projects` and each project's text under its own key. New
  projects, opened files and examples join the list instead of replacing the
  open one; `persistence.ts` asks before replacing only when storage is off.
  Each tab has its own open project; the index remembers only the one
  opened last, where a new tab starts.
- Versions of a project (`src/io/versions.ts`) are kept in the browser under
  `cedar-logic.versions.<id>`, never in the project file: one by hand, one
  each time the project is opened, and one before going back to an older
  version. At most `MAX_VERSIONS`, the oldest automatic ones going first;
  a full storage drops the oldest. Deleting a project deletes its versions.
- TypeScript runs with `erasableSyntaxOnly`: no enums, namespaces or
  parameter properties. Use union types and `as const` objects.
- Relative imports include the `.ts` / `.tsx` extension.

## Starting a session

- Each task usually starts in a fresh session. Before starting work, read
  `HANDOFF.md` from the top through the end of section 2 (goals and current
  state). Read the decisions log after it only when the task touches those
  areas. Do not load the whole file by default; it is long.

## Git workflow

- Work directly on `main` and push to `origin/main` after every completed
  change. No feature branches or pull requests unless the owner asks.
- Push only when everything is green: `npm run lint`, `npm test` and
  `npm run build` all pass with no errors or warnings that indicate a real
  problem. If anything fails, fix it first or stop and report. Never push a
  failing tree.
- Keep `HANDOFF.md` (written in Hebrew) current at the end of a work session,
  and update the status line in `docs/PLAN.md` when a phase is finished.
- The push rule wins over any other instruction that says not to commit. In
  particular, the handoff skill's "do not commit" line does not apply here:
  `HANDOFF.md` is committed and pushed like everything else.

## Licensing

This project is MIT. CedarLogic, Logisim Evolution and Digital are GPL: take
ideas and behavior from them, never code.
