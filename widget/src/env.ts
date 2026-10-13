/* Where the widget came from, and whether it should run here at all. */

declare const __INSPECK_VERSION__: string
export const VERSION = __INSPECK_VERSION__

/* Captured while the script is executing; document.currentScript is null
   once anything async has run. */
const script = document.currentScript as HTMLScriptElement | null

/** The Inspeck server that served this script, e.g. http://127.0.0.1:4848, or the app's own dev server
    when it passes Inspeck through (http://192.168.1.5:5173/__inspeck, see the Vite plugin). */
export const SERVER = (() => {
  try {
    if (script?.src) { const u = new URL(script.src); return u.origin + u.pathname.replace(/\/inspeck\.js$/, '') }
  } catch { /* fall through */ }
  return 'http://127.0.0.1:4848'
})()

/**
 * The widget is a development tool. If the script tag is left in a production
 * build, it stays quiet on any address that isn't this machine — unless the
 * tag says otherwise with data-inspeck-anywhere.
 */
export function allowedHere(): boolean {
  if (script?.hasAttribute('data-inspeck-anywhere')) return true
  const h = location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost') || h.endsWith('.test') ||
    /* The "Network" address a dev server prints, and Bonjour names: the plugin checks it's really this Mac. */
    h.endsWith('.local') || /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(h)
}

/** Per-tab memory that survives reloads but not a new tab. */
export const tabStore = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(`inspeck:${key}`) } catch { return null }
  },
  set(key: string, value: string | null): void {
    try {
      if (value == null) sessionStorage.removeItem(`inspeck:${key}`)
      else sessionStorage.setItem(`inspeck:${key}`, value)
    } catch { /* storage blocked: the widget just won't remember */ }
  },
}

/** This browser tab, stable across reloads, so its notes go to the session it's bound to. */
export const TAB_ID = (() => {
  let id = tabStore.get('tab')
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('')
    tabStore.set('tab', id)
  }
  return id
})()
