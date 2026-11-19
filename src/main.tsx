import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
// Plex Sans has no Hebrew letters; its Hebrew sibling fills them in, fetched only when a page shows one.
import '@fontsource/ibm-plex-sans-hebrew/400.css'
import '@fontsource/ibm-plex-sans-hebrew/500.css'
import '@fontsource/ibm-plex-sans-hebrew/600.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import { preferredLanguage, speak } from './ui/language.ts'
import { startOffline } from './ui/offline.ts'
import { openLinkInAddress, startPersistence } from './ui/persistence.ts'
import { Root } from './ui/Root.tsx'

// The canvases draw values in Plex Mono but cannot ask for a face themselves;
// they redraw when it arrives.
for (const weight of [500, 600]) void document.fonts.load(`${weight} 12px "IBM Plex Mono"`)

// The built site opens without a network; the desktop app has its files with it.
if (import.meta.env.PROD && import.meta.env.MODE !== 'desktop') startOffline()
// The desktop app saves and opens real files, and opens the file it was started with.
if (import.meta.env.MODE === 'desktop') void import('./ui/desktop.ts').then((desktop) => desktop.startDesktop())

// Only the build for the end-to-end tests can say where parts are drawn.
if (import.meta.env.MODE === 'e2e') void import('./ui/e2eHook.ts').then((hook) => hook.installE2EHook())

// The messages of the language are in place before the first word is said.
void speak(preferredLanguage())
  .catch(() => undefined)
  .then(() => {
    // The project from the last visit is in place before anything is drawn.
    startPersistence()
    // A share link opens as a new project, now and whenever one is pasted into the address.
    void openLinkInAddress()
    window.addEventListener('hashchange', () => void openLinkInAddress())
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    )
  })
