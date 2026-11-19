import { msg, t } from '../i18n/index.ts'

/**
 * The pieces of a combination that are things the mouse does, not keys, and
 * so are said in the language of the interface. Key names stay as they are.
 */
const ACTIONS: Readonly<Record<string, string>> = {
  Click: msg('Click'),
  'Right-click': msg('Right-click'),
  'Double-click': msg('Double-click'),
  Drag: msg('Drag'),
  Scroll: msg('Scroll'),
  'A key you chose': msg('A key you chose'),
}

/** A keyboard shortcut such as "Ctrl+Z", drawn as one keycap per key. */
export function Keys({ combo }: { combo: string }) {
  return (
    <span className="keys">
      {combo.split('+').map((key) => (
        <kbd key={key}>{Object.hasOwn(ACTIONS, key) ? t(ACTIONS[key]) : key}</kbd>
      ))}
    </span>
  )
}
