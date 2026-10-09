/* Settings, from the sliders button in the pill: how the CSS card writes sizes and
 * colours. A small panel above the pill (below it when the pill is at the top);
 * a press anywhere else or Escape puts it away. */
import { enter, leave } from './anim'
import { h } from './dom'
import { prefs, type Prefs } from './prefs'
import { actionOf } from './router'

const ROWS: Array<{ key: keyof Prefs; label: string; options: Array<[string, string]> }> = [
  { key: 'sizes', label: 'Sizes', options: [['written', 'As written'], ['px', 'px'], ['rem', 'rem']] },
  { key: 'colors', label: 'Colours', options: [['written', 'As written'], ['hex', 'hex'], ['rgb', 'rgb'], ['oklch', 'oklch']] },
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
  const sync = () => {
    const now = prefs.get()
    for (const b of Array.from(el.querySelectorAll<HTMLElement>('.seg-opt'))) {
      b.setAttribute('aria-checked', String(now[b.dataset.key as keyof Prefs] === b.dataset.value))
    }
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
      }
      return true
    },
  }
}
