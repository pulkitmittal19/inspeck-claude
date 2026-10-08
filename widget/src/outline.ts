/* The pink outline that follows the element under the pointer. It reads the
   element's rect every frame while visible, so it stays glued through scrolling,
   inner scroll areas, sticky headers and layout shifts. */
import { h } from './dom'

export interface Outline {
  show(el: Element): void
  hide(): void
  readonly target: Element | null
}

export function createOutline(ui: HTMLElement, onFrame?: (el: Element, r: DOMRect) => void): Outline {
  const box = h('div', { class: 'outline', hidden: true })
  ui.appendChild(box)
  let target: Element | null = null
  let raf = 0

  const frame = () => {
    raf = 0
    if (!target) return
    if (!target.isConnected) { hide(); return }
    const r = target.getBoundingClientRect()
    box.style.transform = `translate(${r.left - 2}px, ${r.top - 2}px)`
    box.style.width = `${r.width + 4}px`
    box.style.height = `${r.height + 4}px`
    onFrame?.(target, r)
    raf = requestAnimationFrame(frame)
  }

  function hide() {
    target = null
    box.hidden = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  return {
    show(el) {
      if (el !== target) {
        target = el
        const radius = getComputedStyle(el).borderTopLeftRadius
        box.style.borderRadius = radius && radius !== '0px' ? `calc(${radius} + 2px)` : '3px'
      }
      box.hidden = false
      if (!raf) frame()
    },
    hide,
    get target() { return target },
  }
}
