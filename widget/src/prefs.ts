/* Settings: whether a note goes to Claude as soon as it's placed or waits
 * for you to send it.
 *
 * Kept by the plugin, so a choice made in one app holds in every app and
 * browser on this machine; a copy in this site's storage means the card
 * shows them straight away, before the plugin has answered.
 */
import { api } from './api'

export type SendMode = 'ask' | 'live'
export interface Prefs { send: SendMode }

const KEY = 'inspeck:settings'
/* Notes wait for you to send them unless you turn on Auto-send notes to Claude:
   Claude shouldn't start changing code while you're still looking around. */
const DEFAULTS: Prefs = { send: 'ask' }

/** Only the values we know; anything else falls back to the default. */
function clean(raw: unknown): Prefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    send: o.send === 'live' || o.send === 'ask' ? o.send : DEFAULTS.send,
  }
}

let current: Prefs = (() => { try { return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return DEFAULTS } })()
const listeners = new Set<() => void>()

const remember = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private window */ } }
const same = (a: Prefs, b: Prefs) => a.send === b.send

function apply(next: Prefs): void {
  if (same(next, current)) return
  current = next
  remember(next)
  for (const fn of listeners) fn()
}

export const prefs = {
  get(): Prefs { return current },
  set(patch: Partial<Prefs>): void {
    const next = clean({ ...current, ...patch })
    apply(next)
    /* An older plugin without settings: this site's copy still holds. */
    void api.saveSettings({ ...next }).catch(() => {})
  },
  /** Catch up with what the plugin has, which another app may have changed. */
  sync(): void {
    void api.settings().then(s => { if (Object.keys(s).length) apply(clean(s)) }, () => {})
  },
  onChange(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
