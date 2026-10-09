/* Drag across the page to note on a section, as in Figma: a box follows the
 * pointer and every element it wholly covers is outlined. Only the outermost
 * of those counts (a card, not the card and each line in it), so the
 * selection reads the way you'd describe it. A box over empty space is a note
 * on that area. Once pinned, the outlines keep following the elements as the
 * page scrolls, and the card sits under them.
 */
import { enter, leave } from './anim'
import { clear, h } from './dom'
import { pickable } from './pick'
import { cancelFrame, nextFrame } from './native'

export interface Box { left: number; top: number; right: number; bottom: number }

export interface Marquee {
  /** Drag from (x, y). */
  start(x: number, y: number): void
  /** The pointer moved to (x, y) while dragging. */
  move(x: number, y: number): void
  /** The drag ended: the box (viewport coordinates) and what it covers. */
  end(): { box: Box; members: Element[] }
  /** Keep a pinned selection drawn: the members, or the bare area (document coordinates). */
  hold(members: Element[], area: Box | null): void
  hide(): void
  readonly dragging: boolean
}

/** Past this many the outlines stop meaning anything; the note says "and more". */
export const MAX_MEMBERS = 30

const covers = (o: Box, r: DOMRect) => r.left >= o.left - 1 && r.right <= o.right + 1 && r.top >= o.top - 1 && r.bottom <= o.bottom + 1
const meets = (o: Box, r: DOMRect) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top

/** The outermost elements wholly inside the box. */
export function membersIn(box: Box, host: Element): Element[] {
  const out: Element[] = []
  const walk = (parent: Element) => {
    for (const c of Array.from(parent.children)) {
      if (out.length >= MAX_MEMBERS) return
      if (c === host || c instanceof HTMLScriptElement || c instanceof HTMLStyleElement) continue
      const r = c.getBoundingClientRect()
      /* display: contents and the like have no box of their own: look inside. */
      if (!r.width && !r.height) { walk(c); continue }
      if (covers(box, r)) {
        if (r.width < 3 || r.height < 3 || !pickable(c, host)) continue
        const cs = getComputedStyle(c)
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue
        out.push(c)
      } else if (meets(box, r)) walk(c)
    }
  }
  walk(document.body)
  return out
}

/** The box around a set of elements, in viewport coordinates. */
export function unionOf(els: Element[]): Box | null {
  let b: Box | null = null
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    b = b ? { left: Math.min(b.left, r.left), top: Math.min(b.top, r.top), right: Math.max(b.right, r.right), bottom: Math.max(b.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  return b
}

export function createMarquee(ui: HTMLElement, host: Element, onFrame: (box: Box) => void): Marquee {
  const layer = h('div', { class: 'marquee-layer', hidden: true })
  const band = h('div', { class: 'marquee' })
  const count = h('span', { class: 'marquee-count' })
  ui.appendChild(layer)

  let from = { x: 0, y: 0 }
  let to = { x: 0, y: 0 }
  let dragging = false
  let members: Element[] = []
  let held: { members: Element[]; area: Box | null } | null = null
  let raf = 0

  const boxNow = (): Box => ({
    left: Math.min(from.x, to.x), top: Math.min(from.y, to.y),
    right: Math.max(from.x, to.x), bottom: Math.max(from.y, to.y),
  })
  const place = (el: HTMLElement, b: Box, pad = 0) => {
    el.style.cssText = `left:${b.left - pad}px;top:${b.top - pad}px;width:${b.right - b.left + pad * 2}px;height:${b.bottom - b.top + pad * 2}px`
  }
  /* One outline per member, reused frame to frame. */
  const outlines: HTMLElement[] = []
  const drawMembers = (els: Element[]) => {
    while (outlines.length < els.length) { const o = h('div', { class: 'member' }); outlines.push(o); layer.appendChild(o) }
    outlines.forEach((o, i) => {
      const el = els[i]
      if (!el) { o.hidden = true; return }
      const r = el.getBoundingClientRect()
      o.hidden = false
      place(o, r, 1)
    })
  }

  const frame = () => {
    raf = 0
    if (dragging) {
      const b = boxNow()
      members = membersIn(b, host)
      place(band, b)
      drawMembers(members)
      count.textContent = members.length ? String(members.length) : ''
      count.hidden = !members.length
      count.style.left = `${b.right}px`
      count.style.top = `${b.bottom}px`
      return
    }
    if (held) {
      const live = held.members.filter(m => m.isConnected)
      const area = held.area
      const b = live.length ? unionOf(live)
        : area ? { left: area.left - scrollX, top: area.top - scrollY, right: area.right - scrollX, bottom: area.bottom - scrollY } : null
      if (b) {
        drawMembers(live)
        /* Several elements: a quiet frame around them all. One, or none: the box itself. */
        band.hidden = live.length === 1
        place(band, b, live.length ? 3 : 0)
        onFrame(b)
      }
      raf = nextFrame(frame)
    }
  }
  const schedule = () => { if (!raf) raf = nextFrame(frame) }

  return {
    get dragging() { return dragging },
    start(x, y) {
      held = null
      from = { x, y }
      to = { x, y }
      dragging = true
      clear(layer)
      outlines.length = 0
      band.hidden = false
      band.removeAttribute('data-held')
      layer.append(band, count)
      enter(layer)
      schedule()
    },
    move(x, y) {
      to = { x, y }
      schedule()
    },
    end() {
      dragging = false
      if (raf) cancelFrame(raf)
      raf = 0
      const box = boxNow()
      members = membersIn(box, host)
      count.hidden = true
      return { box, members }
    },
    hold(els, area) {
      held = { members: els, area }
      band.setAttribute('data-held', '')
      count.hidden = true
      if (layer.hidden || layer.dataset.state === 'out') {
        clear(layer)
        outlines.length = 0
        layer.append(band, count)
        enter(layer)
      }
      schedule()
    },
    hide() {
      dragging = false
      held = null
      if (raf) cancelFrame(raf)
      raf = 0
      leave(layer, 120, () => { if (!held && !dragging) { clear(layer); outlines.length = 0 } })
    },
  }
}
