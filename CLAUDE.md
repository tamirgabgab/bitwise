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

## Conventions

- Every behavior in `src/core` gets a unit test next to it (`*.test.ts`).
- Components (gates, flip-flops, ...) are defined as data plus an evaluation
  function, one file per component, so adding one does not touch the engine.
- Saved files carry `FILE_FORMAT_VERSION`. A breaking format change bumps it
  and adds a migration from the previous version.
- TypeScript runs with `erasableSyntaxOnly`: no enums, namespaces or
  parameter properties. Use union types and `as const` objects.
- Relative imports include the `.ts` / `.tsx` extension.

## Licensing

This project is MIT. CedarLogic, Logisim Evolution and Digital are GPL: take
ideas and behavior from them, never code.
