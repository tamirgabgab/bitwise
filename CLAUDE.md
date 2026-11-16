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

- A bit is 0, 1, X (unknown) or Z (floating). A `Signal` is an array of bits
  with the least significant bit at index 0. Text form (`parseSignal`,
  `formatSignal`) puts the most significant bit first.
- Every pin and net has a width. Width 1 is a plain wire, more is a bus.
- A net is one electrical node. Several outputs may drive it: Z drivers are
  ignored, and a 0 against a 1 reads as X and sets the net's `conflict` flag.
- An unattached input floats (Z), and gates treat Z like X.
- Time is integer ticks. A component is evaluated when one of its inputs
  changes, and its outputs take effect `delay` ticks later. Delay is per
  component and at least 1, which is what keeps oscillating circuits from
  hanging the engine. Do not allow a delay of 0.
- An output is X until its first evaluation takes effect.
- The simulator generates numeric component and net ids. The editor keeps
  its own ids and maps them.

## Conventions

- Every behavior in `src/core` gets a unit test next to it (`*.test.ts`).
- Components (gates, flip-flops, ...) are defined as data plus a pure
  `evaluate` function, one file per component family under
  `src/core/components`, and registered in `components/index.ts`. Adding one
  must not touch the engine.
- Saved files carry `FILE_FORMAT_VERSION`. A breaking format change bumps it
  and adds a migration from the previous version.
- TypeScript runs with `erasableSyntaxOnly`: no enums, namespaces or
  parameter properties. Use union types and `as const` objects.
- Relative imports include the `.ts` / `.tsx` extension.

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
