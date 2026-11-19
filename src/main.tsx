import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import { App } from './ui/App.tsx'
import { openLinkInAddress, startPersistence } from './ui/persistence.ts'

// The canvases draw values in Plex Mono but cannot ask for a face themselves;
// they redraw when it arrives.
for (const weight of [500, 600]) void document.fonts.load(`${weight} 12px "IBM Plex Mono"`)

// The project from the last visit is in place before anything is drawn.
startPersistence()
// A share link opens as a new project, now and whenever one is pasted into the address.
void openLinkInAddress()
window.addEventListener('hashchange', () => void openLinkInAddress())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
