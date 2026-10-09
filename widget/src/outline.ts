/* The pink outline that follows the element under the pointer.
 *
 * It reads the element's rect every frame while visible, so it stays glued
 * through scrolling, inner scroll areas, sticky headers and layout shifts.
 *
 * Moving to another element, it doesn't jump: the box keeps an offset from
 * the element it's on (where it was, minus where the element is) and that
 * offset shrinks to nothing a little every frame. So it eases from wherever
 * it happens to be, even mid-way through the last move, and quick moves across
 * many elements read as one smooth path rather than a stutter. Following one
 * element (scrolling), the offset is already zero, so it never lags.
 */
import { enter, leave, reducedMotion } from './anim'
import { h } from './dom'
import { cancelFrame, nextFrame } from './native'

export interface Outline {
  show(el: Element): void
  hide(): void
  readonly target: Element | null
}

/** The glide's time constant: the offset shrinks by 1/e every TAU ms (about 95% there in ~100ms). */
const TAU = 35
/** Close enough: below this many pixels the offset is dropped. */
const SETTLED = 0.25

interface Box { x: number; y: number; w: number; h: number }

export function createOutline(ui: HTMLElement, onFrame?: (el: Element, r: DOMRect) => void): Outline {
  const box = h('div', { class: 'outline', hidden: true })
  ui.appendChild(box)
  let target: Element | null = null
  let raf = 0
  let last = 0
  let shown: Box | null = null
  let off: Box = { x: 0, y: 0, w: 0, h: 0 }

  const frame = (now: number) => {
    raf = 0
    if (!target) return
    if (!target.isConnected) { hide(); return }
    const r = target.getBoundingClientRect()
    const dt = last ? Math.min(64, now - last) : 16
    last = now
    const k = reducedMotion() ? 0 : Math.exp(-dt / TAU)
    off = { x: off.x * k, y: off.y * k, w: off.w * k, h: off.h * k }
    if (Math.abs(off.x) + Math.abs(off.y) + Math.abs(off.w) + Math.abs(off.h) < SETTLED) off = { x: 0, y: 0, w: 0, h: 0 }
    const b = { x: r.left + off.x, y: r.top + off.y, w: r.width + off.w, h: r.height + off.h }
    shown = b
    box.style.transform = `translate(${b.x - 2}px, ${b.y - 2}px)`
    box.style.width = `${b.w + 4}px`
    box.style.height = `${b.h + 4}px`
    onFrame?.(target, new DOMRect(b.x, b.y, b.w, b.h))
    raf = nextFrame(frame)
  }

  function hide() {
    target = null
    shown = null
    off = { x: 0, y: 0, w: 0, h: 0 }
    leave(box, 90)
    if (raf) cancelFrame(raf)
    raf = 0
  }

  return {
    show(el) {
      if (el !== target) {
        const visible = !!shown && !box.hidden && box.dataset.state !== 'out'
        const r = el.getBoundingClientRect()
        /* From one element to the next: start where the box is now and ease in. From nothing: appear in place. */
        off = visible && shown
          ? { x: shown.x - r.left, y: shown.y - r.top, w: shown.w - r.width, h: shown.h - r.height }
          : { x: 0, y: 0, w: 0, h: 0 }
        target = el
        const radius = getComputedStyle(el).borderTopLeftRadius
        box.style.borderRadius = radius && radius !== '0px' ? `calc(${radius} + 2px)` : '3px'
      }
      if (!raf) { last = 0; raf = nextFrame(frame) }
      enter(box)
    },
    hide,
    get target() { return target },
  }
}
