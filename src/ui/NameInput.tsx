import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

interface NameInputProps {
  readonly name: string
  /** What the field is called for screen readers, such as "Circuit name". */
  readonly label: string
  readonly maxLength: number
  readonly className: string
  readonly style?: (draft: string) => CSSProperties
  /** Called once, with the name typed, or with null when the user gives up. */
  onDone(name: string | null): void
}

/**
 * A name edited in place. Enter or leaving the field keeps it; Escape gives
 * up, and goes no further, so a window around the field stays open.
 */
export function NameInput({ name, label, maxLength, className, style, onDone }: NameInputProps) {
  const [draft, setDraft] = useState(name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (value: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(value)
  }

  return (
    <input
      ref={ref}
      className={`name-input ${className}`}
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      spellCheck={false}
      style={style?.(draft)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(event) => {
        if (event.code === 'Enter' || event.code === 'NumpadEnter') finish(draft)
        else if (event.code === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(null)
        }
      }}
    />
  )
}
