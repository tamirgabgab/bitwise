/*
 * The Content Security Policy of the published site. A static host cannot
 * send headers, so the build writes it into index.html as a meta tag
 * (`vite.config.ts`). The dev server goes without it: its hot reload needs
 * an inline script.
 *
 * Everything comes from the site itself. Pictures may also be data or blob
 * URLs (the thumbnails of the home screen are SVG data URLs, shown through
 * <img>, where SVG cannot run script), and fonts data URLs, since the build
 * may inline a small font file.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // The service worker and the manifest of the installed app (`src/serviceWorker.ts`).
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * The policy of the desktop app (`src-tauri`). The window talks to its
 * native side through Tauri's own addresses, `ipc:` and, on Windows,
 * `http://ipc.localhost`; nothing else is added.
 */
export const DESKTOP_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace(
  "connect-src 'self'",
  "connect-src 'self' ipc: http://ipc.localhost",
)
