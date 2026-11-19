import { describe, expect, it } from 'vitest'
import { CACHE_PREFIX, precached, serviceWorkerSource } from './serviceWorker.ts'

describe('the files a release keeps for use without a network', () => {
  it('fetches ahead the code, the styles, the pictures and the Latin and Hebrew faces', () => {
    expect(
      precached([
        'assets/index-a1.js',
        'assets/index-a1.js.map',
        'assets/index-b2.css',
        'favicon.svg',
        'icons/icon-192.png',
        'manifest.webmanifest',
        'assets/ibm-plex-sans-latin-400-normal-c3.woff2',
        'assets/ibm-plex-sans-hebrew-hebrew-400-normal-d4.woff2',
        'assets/ibm-plex-sans-cyrillic-400-normal-e5.woff2',
        'assets/ibm-plex-sans-latin-400-normal-f6.woff',
        'index.html',
      ]),
    ).toEqual([
      'assets/ibm-plex-sans-hebrew-hebrew-400-normal-d4.woff2',
      'assets/ibm-plex-sans-latin-400-normal-c3.woff2',
      'assets/index-a1.js',
      'assets/index-b2.css',
      'favicon.svg',
      'icons/icon-192.png',
      'manifest.webmanifest',
    ])
  })
})

describe('the source of the worker', () => {
  const source = serviceWorkerSource('abc123', ['assets/index-a1.js'])

  it('is a script that runs', () => {
    expect(() => new Function('self', 'caches', 'fetch', 'Response', source)).not.toThrow()
  })

  it('names its cache after the release and keeps the page and the files', () => {
    expect(source).toContain(JSON.stringify(CACHE_PREFIX + 'abc123'))
    expect(source).toContain(JSON.stringify(['./', 'assets/index-a1.js']))
  })

  it('finds a kept file whatever headers asked for it', () => {
    expect(source).toContain('ignoreVary: true')
  })
})
