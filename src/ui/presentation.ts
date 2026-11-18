import { canvasRuntime, useEditor } from '../editor/index.ts'
import { useChrome } from './chrome.ts'

/*
 * Presentation mode: the chrome steps aside, the canvas fills the screen
 * (the browser's full screen when it allows it), the steps stay, and the
 * pointer becomes a laser. Esc, or leaving full screen, ends it.
 */

/** Fits the open circuit to the canvas once the layout has settled. */
function fitSoon(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const size = canvasRuntime.current?.size()
      if (size) useEditor.getState().fitToScreen(size.width, size.height)
    }),
  )
}

export function startPresenting(): void {
  const editor = useEditor.getState()
  useChrome.getState().setPresenting(true)
  // A circuit with steps is presented through them.
  if ((editor.circuits[editor.active]?.steps?.length ?? 0) > 0) editor.setStepsOpen(true)
  try {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
  } catch {
    // Full screen is refused in some frames; the window is used as it is.
  }
  fitSoon()
}

export function stopPresenting(): void {
  useChrome.getState().setPresenting(false)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

/**
 * Ends presentation mode when the browser leaves full screen (its own Esc),
 * and on Esc when there was no full screen. Returns a function that stops
 * listening.
 */
export function listenForPresentation(): () => void {
  const onFullscreen = (): void => {
    if (!useChrome.getState().presenting) return
    if (document.fullscreenElement) fitSoon()
    else stopPresenting()
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && useChrome.getState().presenting && !document.fullscreenElement) {
      stopPresenting()
    }
  }
  document.addEventListener('fullscreenchange', onFullscreen)
  window.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('fullscreenchange', onFullscreen)
    window.removeEventListener('keydown', onKey)
  }
}
