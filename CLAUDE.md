# Cedar Logic

A browser-based digital logic simulator inspired by CedarLogic: build a
circuit and watch it simulate at the same time. The roadmap and the
reasoning behind the architecture live in `docs/PLAN.md`.

## Commands

- `npm run dev` — start the dev server
- `npm test` — run unit tests once (`npm run test:watch` to watch)
- `npm run lint` — oxlint
- `npm run build` — type-check, then build to `dist/`

Run lint, test and build before calling a change done. CI runs the same three.

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
- The simulator generates numeric component and net ids. The editor keeps
  its own ids and maps them.

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
- `CanvasController` owns pointer and keyboard input for the canvas. React
  draws only the chrome around it and reaches the editor through the
  `useEditor` store.
- Project settings (radix, gate kit, sandbox, value colors) live in the
  `useEditor` store next to the document. They are not part of undo.
- The value of a switch lives in the simulator, not in the document, so
  toggling one is not an edit and is not undone.
- `session.ts` owns the one `SimBridge` and the run loop. `SimRunner` turns
  wall-clock time into ticks; time moves only while a change is waiting, and
  a frame simulates at most 2000 ticks. `useSim` holds what the chrome shows
  (running, speed, tick, conflicts).
- `liveValues.ts` reads what each wire carries and `valueStyle.ts` decides
  how it is drawn: the classic look at radix 2, a palette up to 10 values,
  a gradient above. Z is dashed, X dotted, a conflict thick and dashed.
- Canvas colors come from CSS variables in `src/index.css`. Amber is the
  only accent color; the other hues are reserved for signal values.
- Keyboard shortcuts match on `event.code`, so they work on any layout.

## Conventions

- Every behavior in `src/core` gets a unit test next to it (`*.test.ts`).
  Editor logic that is not drawing or input handling is tested the same way.
- Components (gates, flip-flops, ...) are defined as data plus a pure
  `evaluate` function, one file per component family under
  `src/core/components`, and registered in `components/index.ts`. Adding one
  must not touch the engine.
- Saved files carry `FILE_FORMAT_VERSION`. A breaking format change bumps it
  and adds a migration from the previous version.
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
