import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const UndoIcon = () => (
  <Icon>
    <path d="M6.5 4 3 7.5 6.5 11" />
    <path d="M3 7.5h7.5a4 4 0 0 1 0 8H8" />
  </Icon>
)

export const RedoIcon = () => (
  <Icon>
    <path d="M11.5 4 15 7.5 11.5 11" />
    <path d="M15 7.5H7.5a4 4 0 0 0 0 8H10" />
  </Icon>
)

export const RotateIcon = () => (
  <Icon>
    <path d="M14.5 9a5.5 5.5 0 1 1-1.9-4.2" />
    <path d="M13 1.8v3.4H9.6" />
  </Icon>
)

export const DeleteIcon = () => (
  <Icon>
    <path d="M3.5 5h11M7 5V3.2h4V5M5 5l.6 9.3h6.8L13 5M7.6 7.8v4M10.4 7.8v4" />
  </Icon>
)

export const ZoomOutIcon = () => (
  <Icon>
    <path d="M4.5 9h9" />
  </Icon>
)

export const ZoomInIcon = () => (
  <Icon>
    <path d="M4.5 9h9M9 4.5v9" />
  </Icon>
)

export const SunIcon = () => (
  <Icon>
    <circle cx="9" cy="9" r="3" />
    <path d="M9 2v1.6M9 14.4V16M2 9h1.6M14.4 9H16M4.05 4.05l1.13 1.13M12.82 12.82l1.13 1.13M4.05 13.95l1.13-1.13M12.82 5.18l1.13-1.13" />
  </Icon>
)

export const MoonIcon = () => (
  <Icon>
    <path d="M14.8 10.6A6 6 0 0 1 7.4 3.2a6 6 0 1 0 7.4 7.4Z" />
  </Icon>
)

export const PlayIcon = () => (
  <Icon>
    <path d="M5.5 3.5v11l8.5-5.5Z" />
  </Icon>
)

export const PauseIcon = () => (
  <Icon>
    <path d="M6 3.5v11M12 3.5v11" />
  </Icon>
)

export const StepIcon = () => (
  <Icon>
    <path d="M4 3.5v11l7-5.5ZM13.5 3.5v11" />
  </Icon>
)

/** A rising edge with an arrow running up to it. */
export const StepEdgeIcon = () => (
  <Icon>
    <path d="M9.5 14.5h3v-11h3" />
    <path d="M2.5 5.5 7 9l-4.5 3.5Z" />
  </Icon>
)

/** Two square waves, one under the other. */
export const TimingIcon = () => (
  <Icon>
    <path d="M2.5 7.5h3v-4h4v4h3v-4h3" />
    <path d="M2.5 14.5h5v-4h4v4h4" />
  </Icon>
)

/** The step icon turned round: one tick back. */
export const StepBackIcon = () => (
  <Icon>
    <path d="M14 3.5v11L7 9ZM4.5 3.5v11" />
  </Icon>
)

/** Back to the start: an arrow going round, against the clock. */
export const RestartIcon = () => (
  <Icon>
    <path d="M3.5 9a5.5 5.5 0 1 0 1.9-4.2" />
    <path d="M5 1.8v3.4h3.4" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
  </Icon>
)

export const PlusIcon = ZoomInIcon

export const NewIcon = () => (
  <Icon>
    <path d="M10.5 2.5H5v13h9V6Z" />
    <path d="M10.5 2.5V6H14M9.5 8.8v4M7.5 10.8h4" />
  </Icon>
)

export const OpenIcon = () => (
  <Icon>
    <path d="M2.5 14.5v-10h4.2l1.5 1.8h7.3v8.2Z" />
  </Icon>
)

export const SaveIcon = () => (
  <Icon>
    <path d="M9 2.5v8.5M5.5 7.6 9 11l3.5-3.4M3 12.5v3h12v-3" />
  </Icon>
)

export const ExamplesIcon = () => (
  <Icon>
    <path d="M9 5v10M9 5a2 2 0 0 0-2-1.5H2.5v10H7A2 2 0 0 1 9 15M9 5a2 2 0 0 1 2-1.5h4.5v10H11A2 2 0 0 0 9 15" />
  </Icon>
)

/** A box with pins: a circuit used as a part. */
export const ChipIcon = () => (
  <Icon>
    <path d="M5.5 3.5h7v11h-7Z" />
    <path d="M2.5 6.5h3M2.5 11.5h3M12.5 9h3" />
  </Icon>
)

/** The AND gate that stands for the app itself. */
export const BrandMark = () => (
  <svg
    width="22"
    height="18"
    viewBox="0 0 22 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 2.5h4.5a6.5 6.5 0 0 1 0 13H6Z" />
    <path d="M1.5 6H6M1.5 12H6M17 9h3.5" />
  </svg>
)

export const AlignLeftIcon = () => (
  <Icon>
    <path d="M3 2.5v13M5.5 4.5h9v3.5h-9zM5.5 10h5.5v3.5H5.5z" />
  </Icon>
)

export const AlignCenterXIcon = () => (
  <Icon>
    <path d="M9 2.5v13M4 4.5h10v3.5H4zM6 10h6v3.5H6z" />
  </Icon>
)

export const AlignRightIcon = () => (
  <Icon>
    <path d="M15 2.5v13M3.5 4.5h9v3.5h-9zM7 10h5.5v3.5H7z" />
  </Icon>
)

export const AlignTopIcon = () => (
  <Icon>
    <path d="M2.5 3h13M4.5 5.5h3.5v9H4.5zM10 5.5h3.5V11H10z" />
  </Icon>
)

export const AlignCenterYIcon = () => (
  <Icon>
    <path d="M2.5 9h13M4.5 4h3.5v10H4.5zM10 6h3.5v6H10z" />
  </Icon>
)

export const AlignBottomIcon = () => (
  <Icon>
    <path d="M2.5 15h13M4.5 3.5h3.5v9H4.5zM10 7h3.5v5.5H10z" />
  </Icon>
)

export const SpreadXIcon = () => (
  <Icon>
    <path d="M2.5 2.5v13M15.5 2.5v13M7.5 5h3v8h-3z" />
  </Icon>
)

export const SpreadYIcon = () => (
  <Icon>
    <path d="M2.5 2.5h13M2.5 15.5h13M5 7.5h8v3H5z" />
  </Icon>
)

export const PictureIcon = () => (
  <Icon>
    <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" />
    <circle cx="6.3" cy="7.2" r="1.2" />
    <path d="m3 13 3.6-3.4 2.6 2.3 2.4-2.9 3.6 3.9" />
  </Icon>
)

export const PreviousIcon = () => (
  <Icon>
    <path d="M11 4 6 9l5 5" />
  </Icon>
)

export const NextIcon = () => (
  <Icon>
    <path d="m7 4 5 5-5 5" />
  </Icon>
)

export const StepsIcon = () => (
  <Icon>
    <rect x="2.5" y="3.5" width="13" height="9" rx="1.5" />
    <path d="M6 15.5h6M7.5 6.5v3l2.8-1.5Z" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="4.5" />
    <path d="M11.4 11.4 15 15" />
  </Icon>
)

/** Points down; a folded section turns it to point right. */
export const ChevronIcon = () => (
  <svg
    className="chevron"
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 3.5 5 6.5 8 3.5" />
  </svg>
)
