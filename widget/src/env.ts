/* Where the widget came from, and whether it should run here at all. */

declare const __INSPECK_VERSION__: string
export const VERSION = __INSPECK_VERSION__

/* Captured while the script is executing; document.currentScript is null
   once anything async has run. */
const script = document.currentScript as HTMLScriptElement | null

/** The Inspeck server that served this script, e.g. http://127.0.0.1:4848. */
export const SERVER = (() => {
  try { if (script?.src) return new URL(script.src).origin } catch { /* fall through */ }
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
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost') || h.endsWith('.test')
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
