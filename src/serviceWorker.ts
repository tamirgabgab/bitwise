/*
 * The service worker that lets the site open without a network and be
 * installed as an app. The build writes it as `sw.js` next to index.html
 * (`vite.config.ts`), with the list of files it keeps; `src/ui/offline.ts`
 * registers it.
 *
 * A page is fetched from the network first, so a new release shows on the
 * next visit, and from the cache when there is no network. Everything else
 * is cached as it is fetched, and the files of the release are fetched
 * ahead, when the worker is installed. Each release has a cache of its own,
 * named by `version`; the old ones are deleted when the new worker takes
 * over, which it does at once.
 */

/** The prefix of the caches the worker owns. */
export const CACHE_PREFIX = 'bitwise-'

/** The source of the worker for one release: `files` are fetched ahead, relative to the worker. */
export function serviceWorkerSource(version: string, files: readonly string[]): string {
  return `/* Bitwise ${version}. Written by the build; see src/serviceWorker.ts. */
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)}
const FILES = ${JSON.stringify(['./', ...files])}
const HOME = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(${JSON.stringify(CACHE_PREFIX)}) && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

const keep = (request, response) => {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone()
    void caches.open(CACHE).then((cache) => cache.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // The page itself: the newest one when the network answers, the kept one when it does not.
    event.respondWith(
      fetch(request)
        .then((response) => keep(HOME, response))
        .catch(() => caches.match(HOME, { ignoreVary: true }).then((kept) => kept ?? Response.error())),
    )
    return
  }
  // A file of a release never changes, whatever headers asked for it: a module script asks
  // with an Origin header the file fetched ahead did not have, and a server may answer Vary: Origin.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((kept) => kept ?? fetch(request).then((response) => keep(request, response))),
  )
})
`
}

/**
 * Which files of a build the worker fetches ahead: the code, the styles,
 * the pictures of the app and the faces of its Latin and Hebrew letters.
 * Other faces are kept when a page first needs them.
 */
export function precached(files: readonly string[]): string[] {
  return files
    .filter((file) => {
      if (/\.(js|css|svg|png|webmanifest)$/.test(file)) return !file.endsWith('.map')
      if (file.endsWith('.woff2')) return /-(latin|hebrew)-\d+-normal/.test(file)
      return false
    })
    .sort()
}
