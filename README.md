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
- **Simulation core.** Unknown (X) and floating (Z) values next to the
  digits, driver conflicts, and an event-driven engine with per-component
  delays.

Saving a project and reusing named circuits is next, then clocks and
flip-flops; see [docs/PLAN.md](docs/PLAN.md) for the roadmap and
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
