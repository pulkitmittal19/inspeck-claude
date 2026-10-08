/* One listener per event type, on window, in the capture phase — the earliest
 * point any page script can see an event. Two rules:
 *
 *  1. Anything that starts inside Inspeck stops here. The app never sees a
 *     click on the pill, a keystroke in the note, a scroll of the list, so a
 *     menu that closes on "outside click" stays open and a focus trap doesn't
 *     pull focus back. Default actions still happen (typing, caret, scroll):
 *     we stop propagation, we don't preventDefault.
 *  2. Everything else is offered to the widget first, which may swallow it
 *     (a click that places a note must not also press the app's button).
 *
 * Because propagation stops at window, listeners on our own elements would
 * never fire, so the widget's UI handles its events here, by delegation.
 */
import type { Host } from './host'

const TYPES = [
  'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
  'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
  'click', 'dblclick', 'auxclick', 'contextmenu', 'dragstart',
  'touchstart', 'touchend', 'touchmove', 'wheel',
  'keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'change',
  'focusin', 'focusout', 'focus', 'blur', 'scroll', 'resize', 'visibilitychange',
] as const

export type RouterHooks = {
  /** An event inside Inspeck's UI. It is stopped after this returns. */
  ui(e: Event): void
  /** An event on the page. Return 'swallow' to stop and cancel it, 'stop' to only stop it. */
  page(e: Event): 'swallow' | 'stop' | void
}

export function createRouter(host: Host, hooks: RouterHooks): () => void {
  const listener = (e: Event) => {
    if (host.owns(e)) {
      hooks.ui(e)
      e.stopImmediatePropagation()
      return
    }
    /* Focus leaving the app for our note box: the app must not notice, or a
       focus trap (Radix, Headless UI) pulls focus straight back. */
    if ((e.type === 'focusout' || e.type === 'blur') && (e as FocusEvent).relatedTarget === host.el) {
      e.stopImmediatePropagation()
      return
    }
    const verdict = hooks.page(e)
    if (verdict) {
      e.stopImmediatePropagation()
      if (verdict === 'swallow' && e.cancelable) e.preventDefault()
    }
  }
  const opts: AddEventListenerOptions = { capture: true, passive: false }
  for (const t of TYPES) {
    window.addEventListener(t, listener, opts)
    if (t === 'visibilitychange') document.addEventListener(t, listener, opts)
  }
  return () => {
    for (const t of TYPES) {
      window.removeEventListener(t, listener, opts)
      if (t === 'visibilitychange') document.removeEventListener(t, listener, opts)
    }
  }
}

/** The nearest element in the event's path carrying data-action, and its value. */
export function actionOf(e: Event): { action: string; el: HTMLElement } | null {
  for (const n of e.composedPath()) {
    if (n instanceof HTMLElement && n.dataset.action) return { action: n.dataset.action, el: n }
  }
  return null
}
