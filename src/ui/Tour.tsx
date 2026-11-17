import { useLayoutEffect, useRef, useState } from 'react'
import { useChrome } from './chrome.ts'
import { TOUR_STEPS, placeCard } from './tour.ts'
import type { Box } from './tour.ts'
import { useModal } from './useModal.ts'

/** Pixels the ring stands off the piece it is drawn around. */
const RING = 4

/**
 * The tour of a first visit: four cards, each beside the piece of the app it
 * is about, with a ring around that piece. It can be left at any step and
 * started again from the File menu.
 */
export function Tour() {
  const open = useChrome((state) => state.overlay === 'tour')
  const modal = useModal(open, useChrome.getState().endTour, false)

  return (
    <dialog {...modal} className="tour" aria-labelledby="tour-title" aria-describedby="tour-text">
      {open && <TourSteps />}
    </dialog>
  )
}

function TourSteps() {
  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState<Box | null>(null)
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const { endTour } = useChrome.getState()

  useLayoutEffect(() => {
    const measure = (): void => {
      const target = document.querySelector(step.target)
      const size = card.current?.getBoundingClientRect()
      if (!size) return
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const rect = target?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) {
        // The piece is not on screen: the card stands alone, mid-window.
        setHole(null)
        setSpot(placeCard({ left: 0, top: 0, ...viewport }, size, viewport))
        return
      }
      const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      setHole(box)
      setSpot(placeCard(box, size, viewport))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])

  return (
    <>
      {hole && (
        <div
          className="tour-ring"
          style={{
            left: hole.left - RING,
            top: hole.top - RING,
            width: hole.width + 2 * RING,
            height: hole.height + 2 * RING,
          }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        style={spot ? { left: spot.left, top: spot.top } : { visibility: 'hidden' }}
      >
        <p className="tour-count">
          Step {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="link" onClick={endTour}>
            Skip the tour
          </button>
          <span className="tour-space" />
          {index > 0 && (
            <button type="button" className="button" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button
            // A new key puts the focus on the main button of every step.
            key={index}
            autoFocus
            type="button"
            className="button button-main"
            onClick={() => (last ? endTour() : setIndex(index + 1))}
          >
            {last ? 'Start building' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}
