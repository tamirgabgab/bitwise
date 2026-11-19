import { App } from './App.tsx'
import { useLanguageStore } from './language.ts'

/** The app, drawn again from scratch in a new language. The stores keep the project and its history. */
export function Root() {
  const language = useLanguageStore((state) => state.language)
  return <App key={language} />
}
