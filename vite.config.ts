import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { CONTENT_SECURITY_POLICY } from './src/csp.ts'

/** Writes the Content Security Policy into the built index.html; see `src/csp.ts`. */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the built site works under any folder, such as
  // /bitwise/ on GitHub Pages.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  build: {
    rolldownOptions: {
      output: {
        // The libraries change less often than the app, so a browser keeps
        // them cached across releases. The large windows are split off by
        // their dynamic imports (`src/ui/LazyOverlays.tsx`).
        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
  test: {
    // The simulation core is pure TypeScript, so tests run in plain Node.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The canvas looks are checked against the colors written in index.css.
    css: { include: [/index\.css/] },
  },
})
