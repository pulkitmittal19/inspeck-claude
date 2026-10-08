/* The circle in the corner that grows into the pill: Freeze · Close. */
import { h, svg } from './dom'
import { ICONS, type IconName } from './icons'
import { actionOf } from './router'

const BUTTONS: Array<{ action: string; icon: IconName; label: string; key?: string }> = [
  { action: 'freeze', icon: 'freeze', label: 'Freeze the page', key: 'F' },
  { action: 'close', icon: 'close', label: 'Close', key: 'Esc' },
]

export interface Toolbar {
  setOpen(open: boolean): void
  setPressed(action: string, on: boolean): void
  /** The page is held still: a quiet ring around the pill. */
  setFrozen(on: boolean): void
  /** Handle an event that happened inside the widget. Returns the action clicked, if any. */
  handle(e: Event): string | null
}

export function createToolbar(ui: HTMLElement): Toolbar {
  const btns = BUTTONS.map((b, i) => {
    const el = h('button', { type: 'button', class: 'btn', 'data-action': b.action, 'aria-label': b.label, 'data-tip': b.label, 'data-key': b.key },
      svg(ICONS[b.icon], 16))
    /* Icons land one after another, starting from the corner. */
    el.style.setProperty('--i', String(BUTTONS.length - 1 - i))
    return el
  })
  const row = h('div', { class: 'row' }, ...btns)
  const logo = h('button', { type: 'button', class: 'logo', 'data-action': 'open', 'aria-label': 'Open Inspeck', 'data-tip': 'Inspeck', 'data-key': '⌥I' },
    svg(ICONS.inspect, 18, 1.5))
  const bar = h('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Inspeck' }, logo, row)
  const tip = h('div', { class: 'tip', role: 'tooltip' })
  ui.append(bar, tip)

  /* The open width is whatever the buttons need, plus the padding. */
  requestAnimationFrame(() => bar.style.setProperty('--ix-open-w', `${row.scrollWidth + 8}px`))

  let tipFor: Element | null = null
  const showTip = (el: HTMLElement | null) => {
    if (el === tipFor) return
    tipFor = el
    if (!el || !el.dataset.tip || (el.classList.contains('btn') && !bar.hasAttribute('data-open'))) {
      tip.removeAttribute('data-show')
      return
    }
    tip.replaceChildren(el.dataset.tip, ...(el.dataset.key ? [h('span', { class: 'kbd' }, el.dataset.key)] : []))
    const r = el.getBoundingClientRect()
    const w = tip.offsetWidth
    tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`
    tip.style.top = `${r.top - 34}px`
    tip.setAttribute('data-show', '')
  }

  return {
    setOpen(open) {
      bar.toggleAttribute('data-open', open)
      logo.tabIndex = open ? -1 : 0
      showTip(null)
    },
    setFrozen(on) {
      bar.toggleAttribute('data-frozen', on)
    },
    setPressed(action, on) {
      bar.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-pressed', String(on))
    },
    handle(e) {
      if (e.type === 'pointerover') {
        const a = actionOf(e)
        showTip(a?.el ?? null)
      } else if (e.type === 'pointerout' || e.type === 'pointerleave') {
        const to = (e as PointerEvent).relatedTarget
        if (!(to instanceof Node) || !bar.contains(to)) showTip(null)
      } else if (e.type === 'click') {
        const a = actionOf(e)
        if (a && bar.contains(a.el)) { showTip(null); return a.action }
      }
      return null
    },
  }
}
