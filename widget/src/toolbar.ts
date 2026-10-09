/* The circle in the corner that grows into the pill: CSS · Clear · Close.
   Freezing is the F key: the pill would mean leaving what you want to freeze. */
import { enter, leave } from './anim'
import { h, svg } from './dom'
import { ICONS, type IconName } from './icons'
import { actionOf } from './router'

const BUTTONS: Array<{ action: string; icon: IconName; label: string; key?: string }> = [
  { action: 'css', icon: 'code', label: 'Show CSS on hover', key: 'C' },
  { action: 'clear', icon: 'trash', label: 'Clear notes on this page' },
  { action: 'close', icon: 'close', label: 'Close', key: 'Esc' },
]

export interface Toolbar {
  setOpen(open: boolean): void
  setPressed(action: string, on: boolean): void
  /** The page is held still: a quiet ring around the pill. */
  setFrozen(on: boolean): void
  /** Ask before a button acts: it turns, its tip asks, and a second click within a few seconds goes ahead. */
  arm(action: string, ask: string): void
  armed(action: string): boolean
  /** A short word from a button, in its tip, e.g. "No notes on this page". */
  say(action: string, text: string): void
  /** A line that stays above the pill while something lasts ("Frozen · F to release"); null clears it. */
  setStatus(text: string | null): void
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
  const logo = h('button', { type: 'button', class: 'logo', 'data-action': 'open', 'aria-label': 'Open Inspeck', 'data-tip': 'Inspeck', 'data-key': '⌥ I' },
    svg(ICONS.inspect, 18, 1.5))
  const bar = h('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Inspeck' }, logo, row)
  const tip = h('div', { class: 'tip', role: 'tooltip' })
  const status = h('div', { class: 'bar-status', role: 'status', hidden: true })
  ui.append(bar, tip, status)

  /* The open width is whatever the buttons need, plus the padding. */
  requestAnimationFrame(() => bar.style.setProperty('--ix-open-w', `${row.scrollWidth + 8}px`))

  let tipFor: Element | null = null
  let armedFor: HTMLElement | null = null
  let disarm = 0
  const showTip = (el: HTMLElement | null, force = false) => {
    if (el === tipFor && !force) return
    tipFor = el
    if (!el || !el.dataset.tip || (el.classList.contains('btn') && !bar.hasAttribute('data-open'))) {
      tip.removeAttribute('data-show')
      return
    }
    const text = el === armedFor ? el.dataset.ask ?? el.dataset.tip : el.dataset.say ?? el.dataset.tip
    tip.replaceChildren(text, ...(el.dataset.key && text === el.dataset.tip ? [h('span', { class: 'kbd' }, el.dataset.key)] : []))
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
    setStatus(text) {
      if (!text) { leave(status, 140); return }
      status.replaceChildren(text)
      enter(status)
    },
    arm(action, ask) {
      const el = bar.querySelector<HTMLElement>(`[data-action="${action}"]`)
      if (!el) return
      armedFor = el
      el.dataset.ask = ask
      el.setAttribute('data-armed', '')
      showTip(el, true)
      clearTimeout(disarm)
      disarm = window.setTimeout(() => { el.removeAttribute('data-armed'); armedFor = null; if (tipFor === el) showTip(el, true) }, 3000)
    },
    armed(action) {
      return !!armedFor && armedFor.dataset.action === action
    },
    say(action, text) {
      const el = bar.querySelector<HTMLElement>(`[data-action="${action}"]`)
      if (!el) return
      clearTimeout(disarm)
      armedFor?.removeAttribute('data-armed')
      armedFor = null
      el.dataset.say = text
      showTip(el, true)
      /* When the word has been said: back to the usual tip if the pointer is on the button, else gone. */
      window.setTimeout(() => { delete el.dataset.say; if (tipFor === el) showTip(el.matches(':hover') ? el : null, true) }, 1800)
    },
    setPressed(action, on) {
      bar.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-pressed', String(on))
    },
    handle(e) {
      /* The pill's buttons never take the keyboard: after clicking one, F,
         Space and Shift still reach the page. */
      if (e.type === 'mousedown' && e.composedPath().some(n => n === bar)) { e.preventDefault(); return null }
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
