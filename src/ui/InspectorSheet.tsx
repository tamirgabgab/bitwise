import { useRef } from 'react'
import type { ReactNode } from 'react'
import { t } from '../i18n/index.ts'
import { ChevronIcon } from './icons.tsx'
import { useSheet } from './sheet.ts'

/** How far a finger swipes the head of the sheet to open or close it, in pixels. */
const SWIPE = 24

interface InspectorSheetProps {
  label: string
  title: ReactNode
  /** A button kept in sight even while the sheet is low, such as connecting the part. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The frame of every inspector panel. On a phone only its head shows until
 * it is opened (`sheet.ts`); on a larger screen the head is a plain heading.
 */
export function InspectorSheet({ label, title, action, children }: InspectorSheetProps) {
  const open = useSheet((state) => state.open)
  const setOpen = useSheet((state) => state.setOpen)
  const start = useRef<number | null>(null)
  const swiped = useRef(false)
  return (
    <aside className={open ? 'inspector open' : 'inspector'} aria-label={label}>
      <div
        className="sheet-head"
        onPointerDown={(event) => {
          start.current = event.clientY
          swiped.current = false
        }}
        onPointerUp={(event) => {
          if (start.current === null) return
          const dy = event.clientY - start.current
          start.current = null
          if (Math.abs(dy) < SWIPE) return
          swiped.current = true
          setOpen(dy < 0)
        }}
        onClick={() => {
          if (swiped.current) swiped.current = false
          else setOpen(!open)
        }}
      >
        <h2>{title}</h2>
        {action}
        <button
          type="button"
          className="sheet-toggle"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation()
            setOpen(!open)
          }}
        >
          <span>{open ? t('Hide settings') : t('Show settings')}</span>
          <ChevronIcon />
        </button>
      </div>
      {children}
    </aside>
  )
}
