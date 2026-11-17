import { useEffect, useRef } from 'react'
import {
  GATE_PRESETS,
  MAX_RADIX,
  MIN_RADIX,
  presetAvailable,
  presetUniversal,
} from '../core/index.ts'
import type { GatePreset } from '../core/index.ts'
import { useEditor, valueText } from '../editor/index.ts'
import { ask } from './dialogs.ts'
import { CloseIcon, ZoomInIcon, ZoomOutIcon } from './icons.tsx'
import { hasOwnColors, swatchStyle, usesClassicColors } from './swatch.ts'

/** Why a kit cannot be picked at this radix. */
function unavailableReason(preset: GatePreset): string {
  return preset.needs === 'binary' ? 'Radix 2 only' : 'Prime radix only'
}

function RadixSection() {
  const radix = useEditor((state) => state.settings.radix)
  const hasParts = useEditor((state) => Object.keys(state.doc.components).length > 0)
  const { setRadix } = useEditor.getState()

  return (
    <section>
      <h3 id="radix-heading">Values per wire</h3>
      <div className="stepper" role="group" aria-labelledby="radix-heading">
        <button
          type="button"
          className="tool"
          aria-label="Fewer values"
          title="Fewer values"
          disabled={radix <= MIN_RADIX}
          onClick={() => setRadix(radix - 1)}
        >
          <ZoomOutIcon />
        </button>
        <output className="stepper-value" aria-live="polite">
          {radix}
        </output>
        <button
          type="button"
          className="tool"
          aria-label="More values"
          title="More values"
          disabled={radix >= MAX_RADIX}
          onClick={() => setRadix(radix + 1)}
        >
          <ZoomInIcon />
        </button>
        <span className="stepper-note">
          {radix === 2 ? 'Binary: 0 and 1' : `Values 0 to ${valueTop(radix)}`}
        </span>
      </div>
      {hasParts && (
        <p className="note">
          Changing the radix restarts the circuit: inputs return to 0, and a value the new radix
          lacks reads as unknown.
        </p>
      )}
    </section>
  )
}

function valueTop(radix: number): string {
  return (radix - 1).toString(16).toUpperCase()
}

function KitSection() {
  const radix = useEditor((state) => state.settings.radix)
  const presetId = useEditor((state) => state.settings.preset)
  const sandbox = useEditor((state) => state.settings.sandbox)
  const { setPreset, updateSettings } = useEditor.getState()

  return (
    <section>
      <h3 id="kit-heading">Gate kit</h3>
      <div className="kits" role="radiogroup" aria-labelledby="kit-heading">
        {GATE_PRESETS.map((preset) => {
          const available = presetAvailable(preset, radix)
          return (
            <label key={preset.id} className={available ? 'kit' : 'kit kit-off'}>
              <input
                type="radio"
                name="gate-kit"
                checked={preset.id === presetId}
                disabled={!available}
                onChange={() => setPreset(preset.id)}
              />
              <span className="kit-text">
                <span className="kit-name">
                  {preset.name}
                  {!available && <span className="tag">{unavailableReason(preset)}</span>}
                  {available && !presetUniversal(preset, radix) && (
                    <span className="tag tag-warn">Not universal</span>
                  )}
                </span>
                <span className="kit-summary">{preset.summary}</span>
              </span>
            </label>
          )
        })}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={sandbox}
          onChange={(event) => updateSettings({ sandbox: event.target.checked })}
        />
        Sandbox: offer every gate, whatever the kit
      </label>
    </section>
  )
}

function ColorSection() {
  const settings = useEditor((state) => state.settings)
  const { updateSettings, setPaletteColor, resetPalette } = useEditor.getState()
  const { radix, classicColors, palette } = settings

  const classic = usesClassicColors(settings)
  const editable = hasOwnColors(settings)
  const digits = Array.from({ length: radix }, (_, digit) => digit)

  return (
    <section>
      <h3>Wire colors</h3>
      {radix === 2 && (
        <label className="check">
          <input
            type="checkbox"
            checked={classicColors}
            onChange={(event) => updateSettings({ classicColors: event.target.checked })}
          />
          Classic colors: dark for 0, red for 1
        </label>
      )}
      <div className="swatches">
        {digits.map((digit) => {
          const text = valueText(digit, settings)
          return editable ? (
            <label
              key={digit}
              className="swatch"
              style={swatchStyle(settings, digit)}
              title={`Color of value ${text}`}
            >
              {text}
              <input
                type="color"
                aria-label={`Color of value ${text}`}
                value={palette[digit]}
                onChange={(event) => setPaletteColor(digit, event.target.value)}
              />
            </label>
          ) : (
            <span key={digit} className="swatch" style={swatchStyle(settings, digit)}>
              {text}
            </span>
          )
        })}
      </div>
      {editable && (
        <p className="note">
          Click a color to change it.{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              // Settings are not part of undo, so the reset is asked about first.
              void ask({
                title: 'Reset the wire colors?',
                body: 'Every value goes back to its default color. The colors you picked cannot be brought back.',
                confirm: 'Reset colors',
                cancel: 'Keep my colors',
                danger: true,
              }).then((yes) => {
                if (yes) resetPalette()
              })
            }}
          >
            Reset colors
          </button>
        </p>
      )}
      {!classic && !editable && (
        <p className="note">Above {palette.length} values the colors follow a gradient.</p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={settings.showDigits}
          onChange={(event) => updateSettings({ showDigits: event.target.checked })}
        />
        Write each output&apos;s value next to its pin
      </label>
      {radix % 2 === 1 && (
        <label className="check">
          <input
            type="checkbox"
            checked={settings.balanced}
            onChange={(event) => updateSettings({ balanced: event.target.checked })}
          />
          Balanced digits: write values around zero (−1, 0, +1)
        </label>
      )}
    </section>
  )
}

interface SettingsPanelProps {
  onClose: () => void
}

/** The project's logic settings: radix, gate kit and how values look. */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Focus moves into the panel when it opens and back to its button when it
  // closes, unless the user has already put it somewhere else.
  useEffect(() => {
    const panel = ref.current
    panel?.querySelector<HTMLElement>(
      'section button:not(:disabled), section input, section select',
    )?.focus()
    return () => {
      const active = document.activeElement
      if (active === null || active === document.body || panel?.contains(active)) {
        document.querySelector<HTMLElement>('.logic-button')?.focus()
      }
    }
  }, [])

  useEffect(() => {
    // A question asked from the panel (a dialog) must not close it.
    const inDialog = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('dialog') !== null
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' && !inDialog(event.target)) onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (ref.current?.contains(target) || target?.closest('.logic-button') || inDialog(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      id="logic-settings"
      className="settings"
      role="dialog"
      aria-label="Logic settings"
    >
      <header className="settings-head">
        <h2>Logic settings</h2>
        <button
          type="button"
          className="tool"
          aria-label="Close settings"
          title="Close settings (Esc)"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <RadixSection />
      <KitSection />
      <ColorSection />
    </div>
  )
}
