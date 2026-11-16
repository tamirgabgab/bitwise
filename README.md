# Cedar Logic

A digital logic simulator that runs in the browser, inspired by
[CedarLogic](https://github.com/CedarvilleCS/CedarLogic): build a circuit from
gates and flip-flops and watch it simulate as you wire it.

What works today:

- **Circuit editor.** Drag gates onto a canvas, wire them, move, rotate,
  delete, undo and redo, copy and paste, pan and zoom. Light and dark themes.
- **Simulation core.** Four-valued signals, buses, the basic gates and an
  event-driven engine with per-component delays. It stays in step with the
  drawing as you edit.

Showing the simulation on the canvas (switches, LEDs, colored wires) is next;
see [docs/PLAN.md](docs/PLAN.md) for the roadmap.

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
