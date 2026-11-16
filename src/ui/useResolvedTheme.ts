import { useSyncExternalStore } from 'react'
import { useEditor } from '../editor/index.ts'

const darkQuery = '(prefers-color-scheme: dark)'

function subscribeToSystem(onChange: () => void): () => void {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** The theme actually on screen, with "follow the system" worked out. */
export function useResolvedTheme(): 'light' | 'dark' {
  const choice = useEditor((state) => state.theme)
  const systemDark = useSyncExternalStore(subscribeToSystem, () =>
    window.matchMedia(darkQuery).matches,
  )
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}
