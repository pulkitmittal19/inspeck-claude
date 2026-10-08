/* Hold Shift: the hovered element's padding (tinted bands), margin (outlined
   bands outside it) and the gaps between its children, each with its number.
   Keep holding it and move to another element: the first one stays outlined
   and the distance between the two is drawn instead. One key for both. */
import { enter, leave } from './anim'
import { clear, h } from './dom'

export interface Spacing {
  draw(el: Element): void
  /** The distance from `from` (where Shift went down) to `to` (under the pointer). */
  distance(from: Element, to: Element): void
  hide(): void
  readonly on: boolean
}

const round = (n: number) => (Math.round(n * 10) / 10).toString()

export function createSpacing(ui: HTMLElement): Spacing {
  const layer = h('div', { class: 'spacing', hidden: true })
  ui.appendChild(layer)
  let on = false

  const band = (cls: string, x: number, y: number, w: number, hgt: number) => {
    if (w <= 0 || hgt <= 0) return
    const b = h('div', { class: `band ${cls}` })
    b.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${hgt}px`
    layer.appendChild(b)
  }
  const label = (text: string, x: number, y: number) => {
    const l = h('span', { class: 'sp-label' }, text)
    l.style.left = `${Math.round(x)}px`
    l.style.top = `${Math.round(y)}px`
    layer.appendChild(l)
  }

  /* A measuring line with end ticks, and its number at the middle. */
  const ruler = (x1: number, y1: number, x2: number, y2: number) => {
    const horiz = y1 === y2
    const len = horiz ? x2 - x1 : y2 - y1
    if (len < 0.5) return
    const r = h('div', { class: `ruler ${horiz ? 'h' : 'v'}` })
    r.style.cssText = horiz ? `left:${x1}px;top:${y1}px;width:${len}px` : `left:${x1}px;top:${y1}px;height:${len}px`
    layer.appendChild(r)
    const l = h('span', { class: 'sp-label dist' }, round(len))
    /* On the line when it fits; beside it when the line is shorter than the number. */
    const roomy = len >= (horiz ? 30 : 22)
    l.style.left = `${Math.round(horiz ? x1 + len / 2 : x1 + (roomy ? 0 : 16))}px`
    l.style.top = `${Math.round(horiz ? y1 + (roomy ? 0 : 12) : y1 + len / 2)}px`
    layer.appendChild(l)
  }
  /* A dashed line carrying an edge across to where the ruler runs. */
  const guide = (x1: number, y1: number, x2: number, y2: number) => {
    const horiz = y1 === y2
    const a = horiz ? Math.min(x1, x2) : Math.min(y1, y2), len = Math.abs(horiz ? x2 - x1 : y2 - y1)
    if (len < 1) return
    const g = h('div', { class: `guide ${horiz ? 'h' : 'v'}` })
    g.style.cssText = horiz ? `left:${a}px;top:${y1}px;width:${len}px` : `left:${x1}px;top:${a}px;height:${len}px`
    layer.appendChild(g)
  }
  const frame = (r: DOMRect) => {
    const b = h('div', { class: 'anchor-box' })
    b.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`
    layer.appendChild(b)
  }
  const show = () => {
    on = true
    if (layer.hidden || layer.dataset.state === 'out') enter(layer)
    clear(layer)
  }

  return {
    get on() { return on },
    distance(from, to) {
      show()
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect()
      frame(a)
      const inside = (i: DOMRect, o: DOMRect) => i.left >= o.left && i.right <= o.right && i.top >= o.top && i.bottom <= o.bottom
      if (inside(a, b) || inside(b, a)) {
        /* One holds the other: the inner one's distance to each edge of the outer. */
        const [i, o] = inside(a, b) ? [a, b] : [b, a]
        const cx = Math.round(i.left + i.width / 2), cy = Math.round(i.top + i.height / 2)
        ruler(cx, o.top, cx, i.top)
        ruler(cx, i.bottom, cx, o.bottom)
        ruler(o.left, cy, i.left, cy)
        ruler(i.right, cy, o.right, cy)
        return
      }
      /* Side by side: the horizontal gap, run where the two overlap vertically
         (or from A's middle, with a guide carrying B's edge across). */
      const hGap = b.left >= a.right ? [a.right, b.left] : a.left >= b.right ? [b.right, a.left] : null
      const vGap = b.top >= a.bottom ? [a.bottom, b.top] : a.top >= b.bottom ? [b.bottom, a.top] : null
      if (hGap) {
        const lo = Math.max(a.top, b.top), hi = Math.min(a.bottom, b.bottom)
        const y = Math.round(lo < hi ? (lo + hi) / 2 : a.top + a.height / 2)
        ruler(hGap[0], y, hGap[1], y)
        const far = b.left >= a.right ? b.left : b.right
        if (y < b.top) guide(far, y, far, b.top)
        else if (y > b.bottom) guide(far, b.bottom, far, y)
      }
      if (vGap) {
        const lo = Math.max(a.left, b.left), hi = Math.min(a.right, b.right)
        const x = Math.round(lo < hi ? (lo + hi) / 2 : a.left + a.width / 2)
        ruler(x, vGap[0], x, vGap[1])
        const far = b.top >= a.bottom ? b.top : b.bottom
        if (x < b.left) guide(x, far, b.left, far)
        else if (x > b.right) guide(b.right, far, x, far)
      }
      if (!hGap && !vGap) {
        /* Overlapping without one holding the other: how far their edges sit apart. */
        const y = Math.round(Math.max(a.top, b.top) + 6), x = Math.round(Math.max(a.left, b.left) + 6)
        ruler(Math.min(a.left, b.left), y, Math.max(a.left, b.left), y)
        ruler(x, Math.min(a.top, b.top), x, Math.max(a.top, b.top))
      }
    },
    draw(el) {
      show()
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const n = (p: string) => parseFloat(cs.getPropertyValue(p)) || 0
      const [pt, pr, pb, pl] = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map(n)
      const [mt, mr, mb, ml] = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].map(n)
      const [bt, br, bb, bl] = ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'].map(n)

      /* margin, outside the box */
      band('margin', r.left, r.top - mt, r.width, mt)
      band('margin', r.left, r.bottom, r.width, mb)
      band('margin', r.left - ml, r.top, ml, r.height)
      band('margin', r.right, r.top, mr, r.height)
      if (mt) label(round(mt), r.left + r.width / 2, r.top - mt / 2)
      if (mb) label(round(mb), r.left + r.width / 2, r.bottom + mb / 2)
      if (ml) label(round(ml), r.left - ml / 2, r.top + r.height / 2)
      if (mr) label(round(mr), r.right + mr / 2, r.top + r.height / 2)

      /* padding, inside the border */
      const ix = r.left + bl, iy = r.top + bt, iw = r.width - bl - br, ih = r.height - bt - bb
      band('padding', ix, iy, iw, pt)
      band('padding', ix, iy + ih - pb, iw, pb)
      band('padding', ix, iy + pt, pl, ih - pt - pb)
      band('padding', ix + iw - pr, iy + pt, pr, ih - pt - pb)
      if (pt) label(round(pt), ix + iw / 2, iy + pt / 2)
      if (pb) label(round(pb), ix + iw / 2, iy + ih - pb / 2)
      if (pl) label(round(pl), ix + pl / 2, iy + ih / 2)
      if (pr) label(round(pr), ix + iw - pr / 2, iy + ih / 2)

      /* gaps between children laid out in a row or a column */
      const kids = Array.from(el.children).map(c => c.getBoundingClientRect()).filter(k => k.width && k.height)
      for (let i = 1; i < kids.length && i < 40; i++) {
        const a = kids[i - 1], b = kids[i]
        if (b.left >= a.right - 0.5 && Math.abs(b.top - a.top) < a.height) {
          const gap = b.left - a.right
          if (gap > 0.5) { band('gap', a.right, Math.max(a.top, b.top), gap, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); label(round(gap), a.right + gap / 2, (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2) }
        } else if (b.top >= a.bottom - 0.5) {
          const gap = b.top - a.bottom
          if (gap > 0.5) { band('gap', Math.max(a.left, b.left), a.bottom, Math.min(a.right, b.right) - Math.max(a.left, b.left), gap); label(round(gap), (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2, a.bottom + gap / 2) }
        }
      }

      /* the content box size, where there's room */
      const cw = iw - pl - pr, ch = ih - pt - pb
      if (cw >= 140 && ch >= 44) label(`${round(cw)} × ${round(ch)}`, ix + pl + cw / 2, iy + pt + ch / 2)
    },
    hide() {
      on = false
      leave(layer, 90, () => { if (!on) clear(layer) })
    },
  }
}
