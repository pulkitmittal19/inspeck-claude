/* Hold Shift: the hovered element's padding (tinted bands), margin (outlined
   bands outside it) and the gaps between its children, each with its number. */
import { enter, leave } from './anim'
import { clear, h } from './dom'

export interface Spacing {
  draw(el: Element): void
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

  return {
    get on() { return on },
    draw(el) {
      on = true
      if (layer.hidden || layer.dataset.state === 'out') enter(layer)
      clear(layer)
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
