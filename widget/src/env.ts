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

/** A hash that's a route (`#/settings`, `#!/settings`) is a page of its own; a plain anchor (`#pricing`) isn't. */
export const isHashRoute = (hash: string) => /^#!?\//.test(hash)

/**
 * The address this document stands for. A web page is its own. A frame with no address of its own (an inline
 * `srcdoc` frame, or a blank one a script wrote into, which takes on the page's address) is part of the page
 * around it: that page's address, with the frame as a route of its own (`#/frame/preview`), so its notes are
 * kept apart from the page's: each document puts its markers on its own elements.
 */
export function pageHref(): string {
  return hrefOf(window)
}

function hrefOf(w: Window): string {
  const own = w.location.href
  if (w === w.parent) return own
  let around: string
  try { around = w.parent.location.href } catch { return own /* a page around it from another site */ }
  if (/^https?:$/.test(w.location.protocol) && own !== around) return own
  /* Named the most lasting way the frame has: its id, name or title, so its notes stay with it when frames are
     added or moved around it; its place among the page's frames only when it has none. */
  const f = w.frameElement
  const label = f && (f.id || f.getAttribute('name') || f.getAttribute('title')?.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40))
  const name = encodeURIComponent(label || (f ? String(Array.from(w.parent.document.querySelectorAll('iframe')).indexOf(f as HTMLIFrameElement)) : 'frame'))
  const outer = hrefOf(w.parent)
  return /#\/frame\//.test(outer) ? `${outer}/${name}` : `${outer.split('#')[0]}#/frame/${name}`
}

/** pageHref, as a URL. */
export const pageUrl = (): URL => new URL(pageHref())

/**
 * The widget is a development tool. If the script tag is left in a production
 * build, it stays quiet on any address that isn't this machine — unless the
 * tag says otherwise with data-inspeck-anywhere.
 */
export function allowedHere(): boolean {
  if (script?.hasAttribute('data-inspeck-anywhere')) return true
  const h = pageUrl().hostname
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

/**
 * This browser tab, so its notes go to the session it's bound to: stable across reloads, and across the local
 * addresses the tab moves between. Another port is another origin, with session storage of its own, so the id
 * also rides in the tab's window name, which Chromium (and so Claude's browser pane, where tabs are linked) keeps
 * going from localhost:5173 to localhost:3000; Firefox and Safari clear it between origins. Only in the top page
 * (a frame's name may be in use), and only when the page leaves the name empty or it's ours.
 */
const TAB_NAME = 'inspeck-tab:'
export const TAB_ID = (() => {
  const top = window === window.top
  const named = top && window.name.startsWith(TAB_NAME) ? window.name.slice(TAB_NAME.length) : ''
  const id = named || tabStore.get('tab') || Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('')
  tabStore.set('tab', id)
  if (top && (!window.name || named)) try { window.name = TAB_NAME + id } catch { /* not ours to set */ }
  return id
})()
