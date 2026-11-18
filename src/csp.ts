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
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')
