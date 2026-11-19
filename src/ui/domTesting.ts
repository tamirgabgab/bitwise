import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/*
 * What every test of a React component needs on top of jsdom. Import it
 * first in a `*.test.tsx` that starts with `// @vitest-environment jsdom`.
 * Only those tests import it; the app never does.
 */

// jsdom knows <dialog> but may not open it as a modal window.
const dialog = HTMLDialogElement.prototype
if (typeof dialog.showModal !== 'function') {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}
if (typeof dialog.close !== 'function') {
  dialog.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}

// jsdom lays nothing out, so it has nothing to scroll.
Element.prototype.scrollIntoView ??= function scrollIntoView() {}

// The theme follows the system's; jsdom has no system to ask.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList

// Testing Library cleans up by itself only when vitest's globals are on.
afterEach(cleanup)
