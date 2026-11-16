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

export const RestartIcon = () => (
  <Icon>
    <path d="M14 3.5v11L6.5 9ZM4.5 3.5v11" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
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
