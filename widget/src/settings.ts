/* Settings, from the sliders button in the pill: how the CSS card writes sizes
 * and colours, whether notes go to Claude as you place them, whether to look
 * for a newer Inspeck (and, when there is one, how to get it), and the
 * shortcuts. A small panel above the pill (below it when the pill is at the
 * top); a press anywhere else or Escape puts it away.
 *
 * Shortcuts is a second page of the same panel: the panel slides over to it
 * and back. Both pages sit in the same spot, so the panel is always as tall as
 * the taller one and never changes size between them. One list: the key worth learning, I, first,
 * then the quicker ways to look closer. While it's showing, a key you
 * press lights up its keycap, so the list answers "which one was that?". */
import { enter, leave } from './anim'
import { api } from './api'
import { copyToClipboard, h, svg } from './dom'
import { ICONS } from './icons'
import { SHORTCUTS, shortcutRow } from './keys'
import { prefs, type Prefs } from './prefs'
import { actionOf } from './router'

/** What the person sends in their Claude chat so it listens for notes: Claude links this site to the chat
    and starts its watcher. The address says which app, so the notes go to that chat with others open. */
export const listenMessage = () => `Listen for my Inspeck notes on ${location.origin}`

const ROWS: Array<{ key: 'sizes' | 'colors'; label: string; options: Array<[string, string]> }> = [
  { key: 'sizes', label: 'Show sizes in', options: [['written', 'Default'], ['px', 'px'], ['rem', 'rem']] },
  { key: 'colors', label: 'Show colors as', options: [['written', 'Default'], ['hex', 'hex'], ['rgb', 'rgb'], ['oklch', 'oklch']] },
]

/** How long a page change takes (matches the CSS). */
const PAGE_MS = 320

export interface Settings {
  readonly open: boolean
  toggle(): void
  hide(): void
  /** A key went down or up anywhere: on the Shortcuts page, its keycap shows it. */
  key(name: string, down: boolean): void
  /** Events inside the panel. Returns true if handled. */
  handle(e: Event): boolean
  contains(e: Event): boolean
}

export function createSettings(ui: HTMLElement, onToggle: (open: boolean) => void): Settings {
  const el = h('div', { class: 'settings', role: 'dialog', 'aria-label': 'Inspeck settings', hidden: true })
  ui.appendChild(el)
  let open = false

  /* ---------- the main page ----------
     Built once; a change only moves the selection, so hover and focus stay put. */
  const main = h('div', { class: 'set-view' }, h('p', { class: 'set-title' }, 'Settings'))
  for (const row of ROWS) {
    main.append(h('div', { class: 'set-row' },
      h('span', { class: 'set-label', id: `ix-set-${row.key}` }, row.label),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': `ix-set-${row.key}` },
        ...row.options.map(([value, text]) => h('button', {
          type: 'button', class: 'seg-opt', role: 'radio', 'data-action': 'pref', 'data-key': row.key, 'data-value': value,
        }, text)))))
  }
  /* Off: notes wait on the page until you ask Claude for them in the chat. On: each goes as you place it. */
  const live = h('button', { type: 'button', class: 'switch', role: 'switch', 'data-action': 'live', 'aria-labelledby': 'ix-set-live', 'aria-describedby': 'ix-set-live-more' }, h('span', { class: 'knob' }))
  /* The ⓘ says what each state means, on hover or focus. */
  const more = h('span', { class: 'info', tabindex: '0', 'aria-label': 'What this does' },
    svg(ICONS.info, 13, 1.8),
    h('span', { class: 'info-tip', role: 'tooltip', id: 'ix-set-live-more' },
      h('span', {}, h('b', {}, 'On:'), ' each note goes to Claude as you add it, and Claude starts on it.'),
      h('span', {}, h('b', {}, 'Off:'), ' notes wait on the page until you ask Claude to check them in the chat.')))
  /* Auto-send sends each note to the chat, but Claude only picks one up by itself while the chat is
     listening, and only the chat can start that. So turning Auto-send on, this says what to send there:
     once per chat, and from then on every note reaches Claude as it's placed. It shows just then, as the
     switch goes on; opening Settings again later, it's gone. */
  let justTurnedOn = false
  const copyBtn = h('button', { type: 'button', class: 'listen-copy', 'data-action': 'copy-listen', 'aria-label': 'Copy the message' }, svg(ICONS.copy, 12, 2))
  const listenHint = h('div', { class: 'listen-wrap' }, h('div', { class: 'listen' },
    h('p', { class: 'listen-line' }, 'Now send this in your Claude chat, once per chat, so Claude picks notes up as they come:'),
    h('div', { class: 'listen-msg' }, h('span', {}, listenMessage()), copyBtn)))
  /* Once a day the plugin looks for a newer Inspeck; when there is one, this says how to get it. */
  const updates = h('button', { type: 'button', class: 'switch', role: 'switch', 'data-action': 'updates', 'aria-labelledby': 'ix-set-updates' }, h('span', { class: 'knob' }))
  const newer = h('p', { class: 'set-update', hidden: true })
  main.append(
    h('div', { class: 'set-row set-toggle' }, h('span', { class: 'set-label', id: 'ix-set-live' }, 'Auto-send notes to Claude', more), live),
    listenHint,
    h('div', { class: 'set-row set-toggle set-updates' }, h('span', { class: 'set-label', id: 'ix-set-updates' }, 'Check for updates'), updates),
    newer,
    h('button', { type: 'button', class: 'set-nav', 'data-action': 'set-page', 'data-page': 'keys' },
      h('span', {}, 'Keyboard shortcuts'), h('span', { class: 'set-nav-end' }, svg(ICONS.chevron, 11, 2.2))),
  )

  /* ---------- the Shortcuts page ---------- */
  const keys = h('div', { class: 'set-view', 'data-off': '', 'aria-hidden': 'true', inert: true },
    h('button', { type: 'button', class: 'set-back', 'data-action': 'set-page', 'data-page': 'main', 'aria-label': 'Back to settings' },
      h('span', { class: 'set-back-icon' }, svg(ICONS.chevron, 11, 2.2)), 'Shortcuts'),
    h('div', { class: 'sc-list' }, ...SHORTCUTS.map(shortcutRow)),
  )
  el.append(main, keys)

  let page: 'main' | 'keys' = 'main'
  let settle = 0
  let settled = () => {}
  /** Slide to a page: the old one slides away and fades as the new one slides in over it. */
  const show = (to: 'main' | 'keys', animate = true) => {
    if (to === page) return
    /* A change still under way finishes at once, so a quick back-and-forth never leaves a page stranded. */
    clearTimeout(settle)
    settled()
    const leaving = page === 'main' ? main : keys
    const coming = to === 'main' ? main : keys
    const dir = to === 'keys' ? 'forward' : 'back'
    page = to
    if (to === 'keys') paint()
    /* Off: still taking its room (that's what keeps the height), but not seen, read or reached. */
    const off = (v: HTMLElement, o: boolean) => { v.toggleAttribute('data-off', o); v.toggleAttribute('inert', o); v.setAttribute('aria-hidden', String(o)) }
    off(coming, false)
    if (!animate) { off(leaving, true); return }
    leaving.dataset.out = dir
    coming.dataset.in = dir
    settled = () => {
      settled = () => {}
      off(leaving, true)
      delete leaving.dataset.out
      delete coming.dataset.in
    }
    settle = window.setTimeout(settled, PAGE_MS)
  }

  const sync = () => {
    const now = prefs.get()
    for (const b of Array.from(el.querySelectorAll<HTMLElement>('.seg-opt'))) {
      b.setAttribute('aria-checked', String(now[b.dataset.key as 'sizes' | 'colors'] === b.dataset.value))
    }
    live.setAttribute('aria-checked', String(now.send === 'live'))
    updates.setAttribute('aria-checked', String(now.updates !== 'off'))
    if (now.send !== 'live') justTurnedOn = false
    listenHint.toggleAttribute('data-open', justTurnedOn)
  }
  /* Copied: the button turns into a tick for a moment. The page's clipboard, or, where that's not
     allowed (some embedded browsers), a selection copied the old way. */
  let copiedTimer = 0
  const copyListen = async () => {
    const ok = await copyToClipboard(listenMessage(), el)
    copyBtn.replaceChildren(svg(ok ? ICONS.check : ICONS.copy, 12, 2.2))
    copyBtn.toggleAttribute('data-copied', ok)
    copyBtn.setAttribute('aria-label', ok ? 'Copied' : 'Couldn’t copy: select the message and copy it')
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copyBtn.replaceChildren(svg(ICONS.copy, 12, 2))
      copyBtn.removeAttribute('data-copied')
      copyBtn.setAttribute('aria-label', 'Copy the message')
    }, 1600)
  }
  sync()
  prefs.onChange(sync)

  /** Whether a newer Inspeck is out: asked each time the panel opens (the plugin checks GitHub once a day). */
  const lookForUpdate = () => {
    void api.update().then(u => {
      newer.hidden = !u.latest
      if (u.latest) newer.replaceChildren(`Inspeck ${u.latest} is out (you have ${u.version}). Ask Claude to `, h('b', {}, 'update Inspeck'), '.')
    }, () => { newer.hidden = true })
  }

  const set = (o: boolean) => {
    if (o === open) return
    open = o
    if (o) { sync(); lookForUpdate(); enter(el) } else leave(el, 120, () => { show('main', false); lit.clear(); paint(); justTurnedOn = false; sync() })
    onToggle(o)
  }

  /* The keys held down right now, by name: their keycaps on the Shortcuts page show pressed. */
  const lit = new Set<string>()
  const paint = () => {
    for (const c of Array.from(keys.querySelectorAll<HTMLElement>('.cap'))) c.toggleAttribute('data-down', lit.has(c.dataset.k ?? ''))
  }

  return {
    get open() { return open },
    toggle() { set(!open) },
    hide() { set(false) },
    key(name, down) {
      if (down === lit.has(name)) return
      if (down) lit.add(name); else lit.delete(name)
      if (open && page === 'keys') paint()
    },
    contains: e => e.composedPath().includes(el),
    handle(e) {
      if (!open || !e.composedPath().includes(el)) return false
      /* The page keeps the keyboard: F, C and Shift still work with the panel open. */
      /* The message to send can be selected and copied by hand. */
      if (e.type === 'mousedown') { if (!(e.composedPath()[0] as Element).closest?.('.listen-msg > span')) e.preventDefault(); return true }
      if (e.type === 'click') {
        const a = actionOf(e)
        if (a?.action === 'pref' && a.el.dataset.key && a.el.dataset.value) prefs.set({ [a.el.dataset.key]: a.el.dataset.value } as Partial<Prefs>)
        if (a?.action === 'live') {
          const on = prefs.get().send !== 'live'
          justTurnedOn = on
          prefs.set({ send: on ? 'live' : 'ask' })
        }
        if (a?.action === 'updates') {
          prefs.set({ updates: prefs.get().updates === 'off' ? 'check' : 'off' })
          window.setTimeout(lookForUpdate, 150)
        }
        if (a?.action === 'set-page') show(a.el.dataset.page === 'keys' ? 'keys' : 'main')
        if (a?.action === 'copy-listen') void copyListen()
      }
      return true
    },
  }
}
