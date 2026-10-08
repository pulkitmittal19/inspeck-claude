/* Notes on things that come and go: an item in a dropdown, a submenu, a popover.
 *
 * When the note is placed we record the path that opened it — "More › Share" —
 * by walking up through each floating layer (a menu, a listbox, a popover, a
 * dialog) to the button that opens it, linked by aria-controls,
 * aria-labelledby or popovertarget. After the menu closes, the marker sits on
 * the outermost of those buttons, and Claude is told how to open it again.
 */
import { selectorFor } from './selector'

const LAYER = [
  '[role=menu]', '[role=listbox]', '[role=dialog]', '[role=alertdialog]', '[role=tooltip]', '[role=tree]', '[role=grid]',
  '[popover]', 'dialog', '[data-radix-popper-content-wrapper]', '[data-floating-ui-portal]', '[data-headlessui-portal]',
].join(',')

function triggerOf(layer: Element): Element | null {
  const id = layer.id
  if (id) {
    const esc = CSS.escape(id)
    const t = document.querySelector(`[aria-controls~="${esc}"], [popovertarget="${esc}"], [commandfor="${esc}"]`)
    if (t) return t
  }
  const labelled = layer.getAttribute('aria-labelledby')
  if (labelled) {
    const t = document.getElementById(labelled.split(/\s+/)[0])
    if (t) return t
  }
  /* A portal wrapper around the real layer (Radix): ask its first child. */
  const inner = layer.querySelector(':scope > [role=menu], :scope > [role=listbox], :scope > [role=dialog]')
  return inner && inner !== layer ? triggerOf(inner) : null
}

export function nameOf(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label) return label.trim()
  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').split('\n')[0].replace(/\s+/g, ' ').trim()
  return (text || el.tagName.toLowerCase()).slice(0, 40)
}

export interface OpenPath {
  /** "More › Share": the buttons that open the layers this element is inside. */
  within: string
  /** Selector of the outermost of those buttons: where the marker waits. */
  anchor: string
}

export function openPathOf(el: Element): OpenPath | null {
  const triggers: Element[] = []
  for (let cur: Element | null = el.parentElement?.closest(LAYER) ?? null; cur; cur = cur.parentElement?.closest(LAYER) ?? null) {
    const t = triggerOf(cur)
    if (!t) continue
    triggers.unshift(t)
    /* The trigger itself may sit inside another layer (a submenu's item). */
    cur = t
  }
  if (!triggers.length) return null
  return { within: triggers.map(nameOf).join(' › '), anchor: selectorFor(triggers[0]) }
}
