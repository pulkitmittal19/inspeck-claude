/* Inspeck — the widget a page loads with one dev-only script tag:
 *
 *   <script src="http://127.0.0.1:4848/inspeck.js"></script>
 *
 * Hover any element to see its CSS; click it to leave a note for Claude.
 */
import { App } from './app'
import { api } from './api'
import { allowedHere, pageUrl, SERVER, TAB_ID, VERSION } from './env'
import { installNetworkHold } from './hold'
import { fileNotice } from './notice'
import { sameOriginTop, topRunsInspeck } from './frames'

/** How long Inspeck waits, once the page is parsed, for its slowest files to finish before starting anyway. */
const LOAD_WAIT_MS = 3000

type Global = { app?: App; version: string; server: string; tab: string; bind(token: string): Promise<string>; destroy(): void }
declare global { interface Window { __INSPECK__?: Global } }

function boot(): void {
  /* Hot reload re-runs this script; one widget per page. */
  if (window.__INSPECK__?.app) return
  /* In a frame of a page that runs Inspeck: quietly, following that page (see frames.ts). */
  const top = sameOriginTop()
  const app = new App({ quietIn: top && topRunsInspeck(top) ? top : null })
  window.__INSPECK__ = {
    app, version: VERSION, server: SERVER, tab: TAB_ID,
    /* Called by Claude in its browser pane (the bind tool says how). */
    async bind(token: string) {
      try {
        const r = await api.bind(token)
        return `Bound: notes from this tab now go to the Claude session in ${r.project}.`
      } catch (e) {
        return `Not bound: ${(e as Error).message}`
      }
    },
    destroy() { app.destroy(); delete window.__INSPECK__ },
  }
}

if (location.protocol === 'file:') {
  /* Opened by double-click: such a page can't safely talk to Inspeck (any website can pose as one), so say
     what to do instead of staying silent. */
  fileNotice()
} else if (!allowedHere()) {
  console.info(`Inspeck: not starting on ${pageUrl().hostname || location.href}, which isn't this machine.`)
} else {
  /* Now, not at boot: a request already on its way when you freeze is held too. */
  installNetworkHold()
  /* After load and a quiet moment, so we never race the app's hydration. But not only after load: one
     image, font or tracker that never finishes would keep load from ever firing. So once the page itself
     is parsed, a few seconds is as long as Inspeck waits for the rest. */
  let started = false
  const start = () => {
    if (started) return
    started = true
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 1500 })
    else setTimeout(boot, 200)
  }
  const fallback = () => setTimeout(start, LOAD_WAIT_MS)
  if (document.readyState === 'complete') start()
  else {
    window.addEventListener('load', start, { once: true })
    if (document.readyState === 'interactive') fallback()
    else document.addEventListener('DOMContentLoaded', fallback, { once: true })
  }
}
