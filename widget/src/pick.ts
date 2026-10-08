/* Which element the person means.
 *
 * The deepest element under the pointer is rarely the answer: it's the icon
 * inside the button, the text span inside the menu item. A designer checking a
 * button wants the button. So the pick snaps up to the nearest control (a
 * button, a link, a menu item, an input…) and ↑/↓ move from there when the
 * person wants the inside or the container instead.
 */

const CONTROL = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary', 'label',
  '[role=button]', '[role=link]', '[role=menuitem]', '[role=menuitemcheckbox]', '[role=menuitemradio]',
  '[role=option]', '[role=tab]', '[role=treeitem]', '[role=checkbox]', '[role=radio]', '[role=switch]',
  '[role=gridcell]', '[role=row]', '[role=combobox]', '[role=slider]',
].join(',')

/** The topmost page element at a point, looking through Inspeck's own layer. */
export function elementAt(x: number, y: number, host: Element): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el === host || host.contains(el)) continue
    if (el === document.documentElement || el === document.body) return null
    return el
  }
  return null
}

/** Snap the raw element to what a person most likely means. */
export function snap(el: Element): Element {
  const control = el.closest(CONTROL)
  if (control && control !== document.body) return control
  /* An inline wrapper around text (<span>, <b>, <svg> pieces) means its block. */
  if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) return el.ownerSVGElement ?? el
  return el
}

export function parentOf(el: Element): Element | null {
  const p = el.parentElement
  return p && p !== document.body && p !== document.documentElement ? p : null
}

/** One level in: the child under the pointer, else the first child with a box. */
export function childToward(el: Element, x: number, y: number): Element | null {
  let first: Element | null = null
  for (const c of Array.from(el.children)) {
    const r = c.getBoundingClientRect()
    if (!r.width && !r.height) continue
    first ??= c
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c
  }
  return first
}

/** Elements we never pick: our own host, invisible ones, and the page root. */
export function pickable(el: Element | null, host: Element): el is Element {
  if (!el || el === host || host.contains(el)) return false
  if (el === document.documentElement || el === document.body) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 || r.height > 0
}
