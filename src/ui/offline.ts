import { t } from '../i18n/index.ts'
import { toast } from './toasts.ts'

/*
 * Registers the service worker (`src/serviceWorker.ts`), so the site opens
 * without a network and can be installed as an app. Only the built site
 * has one; the dev server and the desktop app go without.
 *
 * A new release takes over at once. A page that was already open keeps its
 * code until it is loaded again, so it says that a new version is ready.
 */
export function startOffline(): void {
  if (!('serviceWorker' in navigator)) return
  const workers = navigator.serviceWorker
  // A page that had no worker yet gets its first one: nothing new to tell.
  let told = workers.controller === null
  workers.addEventListener('controllerchange', () => {
    if (told) return
    told = true
    toast(t('A new version of Bitwise is ready.'), {
      action: t('Reload'),
      run: () => location.reload(),
    })
  })
  window.addEventListener('load', () => {
    workers.register('./sw.js').catch(() => {
      // Without a worker the site still works, only not without a network.
    })
  })
}
