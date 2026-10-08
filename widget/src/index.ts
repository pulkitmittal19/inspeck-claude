/* Inspeck — the widget a page loads with one dev-only script tag:
 *
 *   <script src="http://127.0.0.1:4848/inspeck.js"></script>
 *
 * Hover any element to see its CSS; click it to leave a note for Claude.
 */
import { App } from './app'
import { allowedHere, SERVER, VERSION } from './env'

type Global = { app?: App; version: string; server: string; destroy(): void }
declare global { interface Window { __INSPECK__?: Global } }

function boot(): void {
  /* Hot reload re-runs this script; one widget per page. */
  if (window.__INSPECK__?.app) return
  const app = new App()
  window.__INSPECK__ = {
    app, version: VERSION, server: SERVER,
    destroy() { app.destroy(); delete window.__INSPECK__ },
  }
}

if (!allowedHere()) {
  console.info(`Inspeck: not starting on ${location.hostname}, which isn't this machine.`)
} else if (window.top !== window && !document.currentScript?.hasAttribute('data-inspeck-frames')) {
  /* Inside an iframe (Storybook, an embed): the top page's widget covers it. */
} else {
  /* After load and a quiet moment, so we never race the app's hydration. */
  const start = () => ('requestIdleCallback' in window ? requestIdleCallback(boot, { timeout: 1500 }) : setTimeout(boot, 200))
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
