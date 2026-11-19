import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { CONTENT_SECURITY_POLICY, DESKTOP_CONTENT_SECURITY_POLICY } from './src/csp.ts'
import { precached, serviceWorkerSource } from './src/serviceWorker.ts'

/** Writes the Content Security Policy into the built index.html; see `src/csp.ts`. */
function contentSecurityPolicy(policy: string): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

/**
 * Writes the service worker of the release, `sw.js`, with the files it
 * fetches ahead; see `src/serviceWorker.ts`. Its version is a hash of their
 * names, which carry hashes of their contents.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((file) => file !== 'index.html')
      const kept = readdirSync('public', { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative('public', join(entry.parentPath, entry.name)).split(sep).join('/'))
      const files = precached([...built, ...kept]).map((file) => `./${file}`)
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, files) })
    },
  }
}

// https://vite.dev/config/
// The mode `desktop` builds the window of the desktop app (`src-tauri`): it
// talks to its native side and keeps no service worker. The mode `e2e` is
// the site for the end-to-end tests (`e2e/`).
export default defineConfig(({ mode }) => ({
  // Relative paths, so the built site works under any folder, such as
  // /bitwise/ on GitHub Pages.
  base: './',
  plugins:
    mode === 'desktop'
      ? [react(), contentSecurityPolicy(DESKTOP_CONTENT_SECURITY_POLICY)]
      : [react(), contentSecurityPolicy(CONTENT_SECURITY_POLICY), serviceWorker()],
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
}))
