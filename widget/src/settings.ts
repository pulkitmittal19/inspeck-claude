/* Settings, from the sliders button in the pill: how the CSS card writes sizes
 * and colours, whether notes go to Claude as you place them, and the
 * shortcuts. A small panel above the pill (below it when the pill is at the
 * top); a press anywhere else or Escape puts it away.
 *
 * Shortcuts is a second page of the same panel: the panel slides over to it
 * and back, and resizes to fit. One list: the key worth learning, I, first,
 * then the quicker ways to look closer. While it's showing, a key you
 * press lights up its keycap, so the list answers "which one was that?". */
import { enter, leave } from './anim'
import { h, svg } from './dom'
import { ICONS } from './icons'
import { SHORTCUTS, shortcutRow } from './keys'
import { prefs, type Prefs } from './prefs'
import { actionOf } from './router'

const ROWS: Array<{ key: 'sizes' | 'colors'; label: string; options: Array<[string, string]> }> = [
  { key: 'sizes', label: 'Show sizes in', options: [['written', 'Default'], ['px', 'px'], ['rem', 'rem']] },
  { key: 'colors', label: 'Show colors as', options: [['written', 'Default'], ['hex', 'hex'], ['rgb', 'rgb'], ['oklch', 'oklch']] },
]

/** How long a page change takes: the panel's height and the pages' slide, on one curve (matches the CSS). */
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
  main.append(
    h('div', { class: 'set-row set-toggle' }, h('span', { class: 'set-label', id: 'ix-set-live' }, 'Auto-send notes to Claude', more), live),
    h('button', { type: 'button', class: 'set-nav', 'data-action': 'set-page', 'data-page': 'keys' },
      h('span', {}, 'Keyboard shortcuts'), h('span', { class: 'set-nav-end' }, svg(ICONS.chevron, 11, 2.2))),
  )

  /* ---------- the Shortcuts page ---------- */
  const keys = h('div', { class: 'set-view', hidden: true },
    h('button', { type: 'button', class: 'set-back', 'data-action': 'set-page', 'data-page': 'main', 'aria-label': 'Back to settings' },
      h('span', { class: 'set-back-icon' }, svg(ICONS.chevron, 11, 2.2)), 'Shortcuts'),
    h('div', { class: 'sc-list' }, ...SHORTCUTS.map(shortcutRow)),
  )
  el.append(main, keys)

  let page: 'main' | 'keys' = 'main'
  let settle = 0
  let settled = () => {}
  /** Slide to a page: the old one slides away and fades as the new one slides in over it, and the
      panel's height eases from one to the other, all on the same curve. */
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
    if (!animate) { leaving.hidden = true; coming.hidden = false; return }
    const from = el.offsetHeight
    /* The old page lifts out of the flow where it stands, so the new one takes its place underneath it. */
    leaving.style.top = `${leaving.offsetTop - el.scrollTop}px`
    leaving.dataset.out = dir
    coming.hidden = false
    coming.dataset.in = dir
    el.scrollTop = 0
    el.style.height = ''
    const next = el.offsetHeight
    el.style.height = `${from}px`
    void el.offsetHeight
    el.style.height = `${next}px`
    settled = () => {
      settled = () => {}
      leaving.hidden = true
      delete leaving.dataset.out
      leaving.style.top = ''
      delete coming.dataset.in
      el.style.height = ''
    }
    settle = window.setTimeout(settled, PAGE_MS)
  }

  const sync = () => {
    const now = prefs.get()
    for (const b of Array.from(el.querySelectorAll<HTMLElement>('.seg-opt'))) {
      b.setAttribute('aria-checked', String(now[b.dataset.key as 'sizes' | 'colors'] === b.dataset.value))
    }
    live.setAttribute('aria-checked', String(now.send === 'live'))
  }
  sync()
  prefs.onChange(sync)

  const set = (o: boolean) => {
    if (o === open) return
    open = o
    if (o) { sync(); enter(el) } else leave(el, 120, () => { show('main', false); lit.clear(); paint() })
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
      if (e.type === 'mousedown') { e.preventDefault(); return true }
      if (e.type === 'click') {
        const a = actionOf(e)
        if (a?.action === 'pref' && a.el.dataset.key && a.el.dataset.value) prefs.set({ [a.el.dataset.key]: a.el.dataset.value } as Partial<Prefs>)
        if (a?.action === 'live') prefs.set({ send: prefs.get().send === 'live' ? 'ask' : 'live' })
        if (a?.action === 'set-page') show(a.el.dataset.page === 'keys' ? 'keys' : 'main')
      }
      return true
    },
  }
}
