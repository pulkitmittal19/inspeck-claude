/* The dark CSS card. On hover it shows the element's key declarations; on
 * click it pins and grows a note line (step 5). It never covers the element
 * it describes: below it when there's room, above it otherwise.
 */
import { describe, type Description } from './css/describe'
import { highlight, resolved } from './css/highlight'
import { clear, h } from './dom'

const GAP = 8
const EDGE = 8

export interface Card {
  el: HTMLDivElement
  showHover(target: Element): void
  hide(): void
  /** Keep the card beside the element as it moves. */
  place(rect: DOMRect): void
  readonly visible: boolean
}

export function renderCss(d: Description): HTMLDivElement {
  const box = h('div', { class: 'css' })
  for (const l of d.lines) {
    const row = h('div', { class: 'decl' }, h('span', { class: 'c-prop' }, l.prop), h('span', { class: 'c-punct' }, ': '))
    row.appendChild(highlight(l.value))
    row.appendChild(h('span', { class: 'c-punct' }, ';'))
    if (l.resolved) row.appendChild(resolved(l.resolved))
    box.appendChild(row)
  }
  if (!d.lines.length) box.appendChild(h('div', { class: 'decl empty' }, 'No styles of its own'))
  return box
}

export function renderHead(d: Description, extra: Node[] = []): HTMLDivElement {
  return h('div', { class: 'card-head' },
    h('span', { class: 'label' }, d.label),
    d.component ? h('span', { class: 'comp' }, d.component) : null,
    h('span', { class: 'size' }, d.size),
    ...extra)
}

export function createCard(ui: HTMLElement): Card {
  const el = h('div', { class: 'card', hidden: true, role: 'tooltip' })
  ui.appendChild(el)
  let visible = false
  let lastTarget: Element | null = null

  return {
    el,
    get visible() { return visible },
    showHover(target) {
      if (target !== lastTarget) {
        lastTarget = target
        const d = describe(target)
        clear(el)
        el.append(renderHead(d), renderCss(d))
      }
      el.hidden = false
      visible = true
    },
    hide() {
      el.hidden = true
      visible = false
      lastTarget = null
    },
    place(r) {
      if (!visible) return
      const w = el.offsetWidth, hgt = el.offsetHeight
      const vw = window.innerWidth, vh = window.innerHeight
      let top = r.bottom + GAP
      if (top + hgt > vh - EDGE && r.top - GAP - hgt >= EDGE) top = r.top - GAP - hgt
      /* Neither fits (a tall element): sit inside the viewport, at its edge. */
      if (top + hgt > vh - EDGE) top = Math.max(EDGE, vh - EDGE - hgt)
      const left = Math.min(vw - EDGE - w, Math.max(EDGE, r.left))
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    },
  }
}
