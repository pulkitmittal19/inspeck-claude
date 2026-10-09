/* Settings, from the sliders button in the pill: how the CSS card writes sizes
 * and colours, and whether notes go to Claude as you place them. A small panel
 * above the pill (below it when the pill is at the top); a press anywhere else
 * or Escape puts it away. */
import { enter, leave } from './anim'
import { h } from './dom'
import { prefs, type Prefs } from './prefs'
import { actionOf } from './router'

const ROWS: Array<{ key: 'sizes' | 'colors'; label: string; options: Array<[string, string]> }> = [
  { key: 'sizes', label: 'Show sizes in', options: [['written', 'Default'], ['px', 'px'], ['rem', 'rem']] },
  { key: 'colors', label: 'Show colors as', options: [['written', 'Default'], ['hex', 'hex'], ['rgb', 'rgb'], ['oklch', 'oklch']] },
]

export interface Settings {
  readonly open: boolean
  toggle(): void
  hide(): void
  /** Events inside the panel. Returns true if handled. */
  handle(e: Event): boolean
  contains(e: Event): boolean
}

export function createSettings(ui: HTMLElement, onToggle: (open: boolean) => void): Settings {
  const el = h('div', { class: 'settings', role: 'dialog', 'aria-label': 'Inspeck settings', hidden: true })
  ui.appendChild(el)
  let open = false

  /* Built once; a change only moves the selection, so hover and focus stay put. */
  el.append(h('p', { class: 'set-title' }, 'Settings'))
  for (const row of ROWS) {
    el.append(h('div', { class: 'set-row' },
      h('span', { class: 'set-label', id: `ix-set-${row.key}` }, row.label),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': `ix-set-${row.key}` },
        ...row.options.map(([value, text]) => h('button', {
          type: 'button', class: 'seg-opt', role: 'radio', 'data-action': 'pref', 'data-key': row.key, 'data-value': value,
        }, text)))))
  }
  /* Off: notes wait on the page and go when you press Send (or ask Claude). On: each goes as you place it. */
  const live = h('button', { type: 'button', class: 'switch', role: 'switch', 'data-action': 'live', 'aria-labelledby': 'ix-set-live' }, h('span', { class: 'knob' }))
  el.append(h('div', { class: 'set-row set-toggle' }, h('span', { class: 'set-label', id: 'ix-set-live' }, 'Send notes right away'), live))
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
    if (o) { sync(); enter(el) } else leave(el, 120)
    onToggle(o)
  }

  return {
    get open() { return open },
    toggle() { set(!open) },
    hide() { set(false) },
    contains: e => e.composedPath().includes(el),
    handle(e) {
      if (!open || !e.composedPath().includes(el)) return false
      /* The page keeps the keyboard: F, C and Shift still work with the panel open. */
      if (e.type === 'mousedown') { e.preventDefault(); return true }
      if (e.type === 'click') {
        const a = actionOf(e)
        if (a?.action === 'pref' && a.el.dataset.key && a.el.dataset.value) prefs.set({ [a.el.dataset.key]: a.el.dataset.value } as Partial<Prefs>)
        if (a?.action === 'live') prefs.set({ send: prefs.get().send === 'live' ? 'ask' : 'live' })
      }
      return true
    },
  }
}
