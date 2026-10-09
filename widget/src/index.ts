/* Inspeck — the widget a page loads with one dev-only script tag:
 *
 *   <script src="http://127.0.0.1:4848/inspeck.js"></script>
 *
 * Hover any element to see its CSS; click it to leave a note for Claude.
 */
import { App } from './app'
import { api } from './api'
import { allowedHere, SERVER, TAB_ID, VERSION } from './env'
import { installNetworkHold } from './hold'

type Global = { app?: App; version: string; server: string; tab: string; bind(token: string): Promise<string>; destroy(): void }
declare global { interface Window { __INSPECK__?: Global } }

function boot(): void {
  /* Hot reload re-runs this script; one widget per page. */
  if (window.__INSPECK__?.app) return
  const app = new App()
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

if (!allowedHere()) {
  console.info(`Inspeck: not starting on ${location.hostname}, which isn't this machine.`)
} else if (window.top !== window && !document.currentScript?.hasAttribute('data-inspeck-frames')) {
  /* Inside an iframe (Storybook, an embed): the top page's widget covers it. */
} else {
  /* Now, not at boot: a request already on its way when you freeze is held too. */
  installNetworkHold()
  /* After load and a quiet moment, so we never race the app's hydration. */
  const start = () => ('requestIdleCallback' in window ? requestIdleCallback(boot, { timeout: 1500 }) : setTimeout(boot, 200))
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
