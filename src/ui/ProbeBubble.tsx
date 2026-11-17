import type { CSSProperties } from 'react'
import { canvasRuntime, describeNode, useEditor, useProbe, useSim, valueText } from '../editor/index.ts'
import { pinName } from './probeText.ts'

/** The bubble is this wide at most, so it knows when to open to the left. */
const WIDTH = 248

/**
 * The probe: a small bubble beside the pointer that says what the wire under
 * it carries, what the wire is called and which outputs drive it.
 */
export function ProbeBubble() {
  const at = useProbe((state) => state.at)
  const settings = useEditor((state) => state.settings)
  // The simulator moving is what changes the reading.
  useSim((state) => state.revision)
  if (!at) return null

  const info = describeNode(at.terminal)
  const center = canvasRuntime.current?.screenCenter() ?? { x: 0, y: 0 }
  const style: CSSProperties = {}
  if (at.x + WIDTH + 24 > center.x * 2) style.right = center.x * 2 - at.x + 12
  else style.left = at.x + 14
  if (at.y > center.y * 1.4) style.bottom = center.y * 2 - at.y + 12
  else style.top = at.y + 18

  return (
    <div className="probe" role="status" style={style}>
      <p className="probe-head">
        <span className="probe-value">{valueText(info.value, settings)}</span>
        <span className="probe-name">{info.name}</span>
      </p>
      {info.conflict && <p className="probe-conflict">Conflict: its outputs disagree</p>}
      {info.drivers.length === 0 ? (
        <p className="probe-note">Nothing drives this wire, so it floats.</p>
      ) : (
        <ul className="probe-pins">
          {info.drivers.map((pin) => (
            <li key={`${pin.part}:${pin.port}`}>
              <span>{pinName(pin)}</span>
              <span className="probe-pin-value">{valueText(pin.value, settings)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
