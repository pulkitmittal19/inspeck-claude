/* Entering and leaving, with motion.
 *
 * `hidden` can't animate: it removes the element at once. So an element shows
 * by first appearing in its "enter" pose (the stylesheet says what that is:
 * a few pixels low, transparent), then moving to "in" on the next frame; it
 * leaves by moving to "out" and is hidden once that transition is over.
 * Leaving is always quicker than arriving.
 */

const timers = new WeakMap<Element, number>()

export function enter(el: HTMLElement): void {
  clearTimeout(timers.get(el))
  if (!el.hidden && el.dataset.state === 'in') return
  el.hidden = false
  el.dataset.state = 'enter'
  void el.offsetWidth          /* commit the starting pose before moving off it */
  el.dataset.state = 'in'
}

export function leave(el: HTMLElement, ms = 140, done?: () => void): void {
  if (el.hidden) { done?.(); return }
  el.dataset.state = 'out'
  clearTimeout(timers.get(el))
  timers.set(el, window.setTimeout(() => {
    if (el.dataset.state === 'out') el.hidden = true
    done?.()
  }, reducedMotion() ? 0 : ms))
}

/** Hide at once, no exit motion (when something else takes its place instantly). */
export function cut(el: HTMLElement): void {
  clearTimeout(timers.get(el))
  el.hidden = true
  el.dataset.state = 'out'
}

/** Run a one-off animation class, restarting it if it's already running. */
export function play(el: HTMLElement, attr: string, ms: number): void {
  el.removeAttribute(attr)
  void el.offsetWidth
  el.setAttribute(attr, '')
  setTimeout(() => el.removeAttribute(attr), ms)
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
