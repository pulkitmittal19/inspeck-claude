/* The one element Inspeck adds to the page, and keeping it alive and on top.
 *
 *  - An open shadow root holds every node we draw, styled by one adopted sheet.
 *  - It is a manual popover, shown at mount, so it paints in the top layer —
 *    above the app's portals, popovers and z-index wars. When something else
 *    enters the top layer, we re-show it so it stays last (and so on top).
 *  - A modal <dialog> makes everything outside it inert, including us. While
 *    one is open the host moves inside it, and moves back when it closes.
 *  - Libraries that hide "everything else" for a modal set inert/aria-hidden
 *    on our host; those are removed as soon as they appear.
 *  - If a framework re-render removes the host, it is put back.
 */
import { sheet } from './dom'
import { CSS } from './styles'

export interface Host {
  el: HTMLElement
  root: ShadowRoot
  ui: HTMLDivElement
  /** True when the event came from (or travelled through) Inspeck's own UI. */
  owns(e: Event): boolean
  destroy(): void
}

export function createHost(): Host {
  const el = document.createElement('inspeck-root')
  el.setAttribute('data-inspeck', '')
  const root = el.attachShadow({ mode: 'open' })
  root.adoptedStyleSheets = [sheet(CSS)]
  const ui = document.createElement('div')
  ui.className = 'ix'
  root.appendChild(ui)

  const canPopover = typeof el.showPopover === 'function'
  if (canPopover) el.setAttribute('popover', 'manual')

  const raise = () => {
    if (!canPopover || !el.isConnected) return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      el.showPopover()
    } catch { /* not in a document that allows it; z-index still applies */ }
  }

  const home = () => document.querySelector<HTMLDialogElement>('dialog:modal') ?? document.documentElement
  const place = () => {
    const parent = home()
    if (el.parentNode !== parent) {
      const focused = root.activeElement as HTMLElement | null
      parent.appendChild(el)
      raise()
      focused?.focus({ preventScroll: true })
    }
  }

  place()
  raise()

  /* Re-show after anything else opens in the top layer. `toggle` doesn't
     bubble, but a capture listener on document still sees it. */
  const onToggle = (e: Event) => {
    const t = e.target as Element
    if (t === el) return
    if ((e as ToggleEvent).newState === 'open') queueMicrotask(() => { place(); raise() })
    else queueMicrotask(place)
  }
  document.addEventListener('toggle', onToggle, true)

  /* Dialogs opened with showModal(), the host being removed, inert being set. */
  const tree = new MutationObserver(() => {
    if (!el.isConnected || el.parentNode !== home()) place()
  })
  tree.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
  const self = new MutationObserver(() => {
    if (el.hasAttribute('inert')) el.removeAttribute('inert')
    if (el.hasAttribute('aria-hidden')) el.removeAttribute('aria-hidden')
  })
  self.observe(el, { attributes: true, attributeFilter: ['inert', 'aria-hidden'] })

  return {
    el, root, ui,
    owns: (e: Event) => e.composedPath().includes(el),
    destroy() {
      document.removeEventListener('toggle', onToggle, true)
      tree.disconnect()
      self.disconnect()
      el.remove()
    },
  }
}
