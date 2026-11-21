import { terminalEnd } from '../editor/document.ts'
import { useEditor } from '../editor/store.ts'
import { worldToScreen } from '../editor/view.ts'

/*
 * What the end-to-end tests (`e2e/`) need to know and cannot read off the
 * page: where a part and its pins are drawn on the canvas. Only the build
 * for those tests has it (`vite build --mode e2e`); the published site does
 * not. Everything the tests check, they read from what the page shows.
 */

interface PartSeen {
  readonly id: string
  readonly type: string
  readonly label?: string
}

interface Point {
  readonly x: number
  readonly y: number
}

export interface E2EHook {
  /** The parts of the open circuit, in the order they were added. */
  parts(): PartSeen[]
  /** The wires of the open circuit, each as the keys of its two ends, `c1:out`. */
  wires(): string[][]
  /** Where a part's position is on the page, in CSS pixels. */
  part(id: string): Point | null
  /** Where a pin of a part is on the page, in CSS pixels. */
  pin(id: string, port: string): Point | null
}

declare global {
  interface Window {
    bitwise?: E2EHook
  }
}

function onPage(world: Point): Point | null {
  const canvas = document.querySelector('canvas.canvas')
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const at = worldToScreen(useEditor.getState().view, world)
  return { x: rect.left + at.x, y: rect.top + at.y }
}

export function installE2EHook(): void {
  window.bitwise = {
    parts: () =>
      Object.entries(useEditor.getState().doc.components).map(([id, part]) => ({
        id,
        type: part.type,
        label: part.label,
      })),
    wires: () =>
      Object.values(useEditor.getState().doc.wires).map((wire) =>
        [wire.from, wire.to].map((end) => (end.kind === 'pin' ? `${end.component}:${end.port}` : end.junction)),
      ),
    part(id) {
      const part = useEditor.getState().doc.components[id]
      return part ? onPage(part.pos) : null
    },
    pin(id, port) {
      const end = terminalEnd(useEditor.getState().doc, { kind: 'pin', component: id, port })
      return end ? onPage(end.pos) : null
    },
  }
}
