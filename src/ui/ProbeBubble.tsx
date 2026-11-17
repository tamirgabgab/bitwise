import type { CSSProperties } from 'react'
import {
  SUB_TYPE,
  canvasRuntime,
  describeNode,
  signalText,
  useEditor,
  useProbe,
  useSim,
} from '../editor/index.ts'
import type { ProbedPin, ProjectSettings } from '../editor/index.ts'
import { partTitle, pinName, portLabel } from './probeText.ts'

/** The bubble is this wide at most, so it knows when to open to the left. */
const WIDTH = 248

/**
 * The pin under the pointer, when the probe sits on one: its part, its name,
 * and the value of the pin itself, which differs from the wire's in a conflict.
 */
function PinLine({
  component,
  port,
  here,
  settings,
}: {
  component: string
  port: string
  here: ProbedPin | undefined
  settings: ProjectSettings
}) {
  const part = useEditor.getState().doc.components[component]
  if (!part) return null
  let owner = partTitle(part.type, part.label)
  let name = portLabel(port)
  let way = here ? (here.drives ? 'output' : 'input') : 'pin'
  if (part.type === SUB_TYPE && part.sub) {
    // The pin inside drives what comes in, so the way is the circuit's own.
    const input = part.sub.inputs.find((pin) => pin.port === port)
    const output = part.sub.outputs.find((pin) => pin.port === port)
    owner = part.sub.name
    name = (input ?? output)?.label ?? port
    way = input ? 'input' : output ? 'output' : 'pin'
  }
  return (
    <p className="probe-pin-line">
      <span>
        {owner}, {way} {name}
      </span>
      {here && <span className="probe-pin-value">{signalText(here.signal, settings)}</span>}
    </p>
  )
}

/**
 * The probe: a small bubble beside the pointer that says what the wire under
 * it carries, what the wire is called and which outputs drive it. Over a pin
 * it also names the pin and gives the pin's own value.
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
  const pin = at.terminal.kind === 'pin' ? at.terminal : null
  // The pin under the pointer has a line of its own, so it is not listed again.
  const drivers = pin ? info.drivers.filter((driver) => driver !== info.here) : info.drivers

  return (
    <div className="probe" role="status" style={style}>
      {pin && (
        <PinLine component={pin.component} port={pin.port} here={info.here} settings={settings} />
      )}
      <p className="probe-head">
        <span className="probe-value">{signalText(info.signal, settings)}</span>
        <span className="probe-name">{info.name}</span>
      </p>
      {info.conflict && <p className="probe-conflict">Conflict: its outputs disagree</p>}
      {info.mixed && (
        <p className="probe-conflict">Pins of different widths are wired together here</p>
      )}
      {info.drivers.length === 0 ? (
        <p className="probe-note">Nothing drives this wire, so it floats.</p>
      ) : (
        drivers.length > 0 && (
          <ul className="probe-pins">
            {drivers.map((driver) => (
              <li key={`${driver.part}:${driver.port}`}>
                <span>{pinName(driver)}</span>
                <span className="probe-pin-value">{signalText(driver.signal, settings)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
