/** A keyboard shortcut such as "Ctrl+Z", drawn as one keycap per key. */
export function Keys({ combo }: { combo: string }) {
  return (
    <span className="keys">
      {combo.split('+').map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  )
}
