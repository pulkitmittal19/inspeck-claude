/* Pages inside pages: iframes, Storybook's preview, embeds.
 *
 * While the pointer is over an iframe, the page around it hears nothing: every
 * move and click goes to the frame's own document. So Inspeck can't reach in
 * from outside; it runs inside each frame instead.
 *
 *  - The top page's Inspeck puts itself into every frame it can (same-origin,
 *    a real page, not about:blank), and into frames added later.
 *  - Inside a frame whose top page runs Inspeck, it runs quietly: no pill, no
 *    tour, open when the top one is. It does the hovering, the CSS card and
 *    the notes for its own frame; the top page leaves that frame to it.
 *  - Inside a frame whose top page doesn't (Storybook's preview, where the
 *    manager page around it has no tag), it runs as usual, pill and all.
 *
 * A frame from another site can't be reached by anyone's script; it stays a
 * box you can note as a whole.
 */
import { SERVER } from './env'

/** The parts of a page's Inspeck another frame uses. */
export interface Peer { open: boolean; setOpen(open: boolean): void }

/** The top window, if it's this page's own origin (so it can be talked to); else null. */
export function sameOriginTop(): Window | null {
  if (window.top === window) return null
  try {
    const top = window.top!
    void top.document.documentElement
    return top
  } catch {
    return null
  }
}

/** The top page's Inspeck, once it has started. */
export function peerIn(win: Window): Peer | undefined {
  try { return (win as Window & { __INSPECK__?: { app?: Peer } }).__INSPECK__?.app } catch { return undefined }
}

/** Whether the top page runs Inspeck (started, or its tag is there and it soon will be). */
export function topRunsInspeck(top: Window): boolean {
  try { return !!peerIn(top) || !!top.document.querySelector('script[src*="inspeck.js"]') } catch { return false }
}

/** Whether a frame runs its own Inspeck: then it, not the page around it, answers for what's inside. */
export function framedByInspeck(el: Element): boolean {
  if (!(el instanceof HTMLIFrameElement)) return false
  try { return !!(el.contentWindow as (Window & { __INSPECK__?: unknown }) | null)?.__INSPECK__ } catch { return false }
}

/** Put Inspeck into a frame that doesn't have it yet. */
function reach(frame: HTMLIFrameElement): void {
  try {
    const win = frame.contentWindow, doc = frame.contentDocument
    if (!win || !doc || !/^https?:$/.test(doc.location.protocol)) return
    if ((win as Window & { __INSPECK__?: unknown }).__INSPECK__ || doc.querySelector('script[src*="inspeck.js"]')) return
    const s = doc.createElement('script')
    s.src = `${SERVER}/inspeck.js`
    s.async = true
    s.setAttribute('data-inspeck-frames', '')
    ;(doc.head ?? doc.documentElement).appendChild(s)
  } catch { /* another site's frame: out of reach */ }
}

/** Reach every frame on the page now, each again when it loads a new page, and frames added later. */
export function reachFrames(): () => void {
  const watch = (frame: HTMLIFrameElement) => {
    reach(frame)
    frame.addEventListener('load', () => reach(frame))
  }
  document.querySelectorAll('iframe').forEach(watch)
  const seen = new MutationObserver(records => {
    for (const r of records) for (const n of Array.from(r.addedNodes)) {
      if (n instanceof HTMLIFrameElement) watch(n)
      else if (n instanceof Element) n.querySelectorAll('iframe').forEach(watch)
    }
  })
  seen.observe(document.documentElement, { childList: true, subtree: true })
  return () => seen.disconnect()
}
