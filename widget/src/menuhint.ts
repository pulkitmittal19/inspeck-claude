/* A word beside a menu's button, while you rest the pointer on it. Inspeck's
 * clicks place notes, so a menu can't be clicked open while it's on: to note
 * what's inside one, press I to put Inspeck away, open the menu, and press I
 * again (a key doesn't close a menu the way a click does). This is the only
 * place that's said, and only where it applies. */
import { enter, leave } from './anim'
import { h } from './dom'
import { cap } from './keys'

/** Something you'd click to use, not a whole region. */
const CLICKABLE = 'button, a, summary, input, [role="button"], [role="combobox"], [role="menuitem"], [role="tab"], [tabindex]'

/** Whether the element (or the button it's part of) opens a menu, popover or disclosure that's closed now. */
export function opensMenu(el: Element): boolean {
  const t = el.closest('[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded], summary')
  if (!t || !t.matches(CLICKABLE)) return false
  if (t.matches('summary')) return !(t.parentElement instanceof HTMLDetailsElement && t.parentElement.open)
  return t.getAttribute('aria-expanded') !== 'true'
}

export interface MenuHint {
  readonly showing: boolean
  show(r: DOMRect): void
  place(r: DOMRect): void
  hide(): void
}

/** Room between the hint and the outline around the button. */
const GAP = 8

export function createMenuHint(ui: HTMLElement): MenuHint {
  const el = h('div', { class: 'menu-hint', role: 'status', hidden: true }, 'Press ', cap('I', 'i'), ' to use this menu')
  ui.appendChild(el)
  let showing = false

  /* Above the button, where the hover card (which goes below) isn't; below it at the top of the window. */
  const place = (r: DOMRect) => {
    const w = el.offsetWidth, hgt = el.offsetHeight
    const above = r.top - GAP - hgt >= 8
    el.style.left = `${Math.round(Math.min(window.innerWidth - 8 - w, Math.max(8, r.left)))}px`
    el.style.top = `${Math.round(above ? r.top - GAP - hgt : r.bottom + GAP)}px`
    el.toggleAttribute('data-below', !above)
  }

  return {
    get showing() { return showing },
    show(r) {
      if (showing) return
      showing = true
      enter(el)
      place(r)
    },
    place(r) { if (showing) place(r) },
    hide() {
      if (!showing) return
      showing = false
      leave(el, 100)
    },
  }
}
