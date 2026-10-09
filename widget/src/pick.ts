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

/* ---------- click-through layers: tooltips, hover cards ----------
 *
 * Most tooltips are `pointer-events: none`, so they never get in the way of
 * the page. The browser's hit test skips them for the same reason, which
 * means `elementAt` looks straight through a tooltip to the row behind it.
 * To see them, the hit test is run once more with pointer-events forced on
 * everywhere (one switch on a sheet of our own), and the first element that
 * was click-through and actually paints something there wins.
 *
 * Switching that sheet restyles the page, so it isn't done on every pointer
 * move: only once the pointer rests, and on a press.
 */

let seeSheet: CSSStyleSheet | null = null

function seeThrough(on: boolean): boolean {
  try {
    if (!seeSheet) {
      seeSheet = new CSSStyleSheet()
      seeSheet.replaceSync('* { pointer-events: auto !important; }')
    }
    /* The app may replace the page's adopted sheets; put ours back if so. */
    if (!document.adoptedStyleSheets.includes(seeSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, seeSheet]
    seeSheet.disabled = !on
    return true
  } catch { return false }
}

const clear = (c: string) => c === 'transparent' || /rgba?\([^)]*,\s*0\)$/.test(c)

/** Whether an element shows anything itself: text, a fill, a border, a shadow, an image. */
export function paints(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (Number(getComputedStyle(p).opacity) === 0) return false
  }
  if (/^(img|svg|video|canvas|picture)$/i.test(el.tagName)) return true
  if (Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) return true
  return !clear(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' ||
    (parseFloat(cs.borderTopWidth) > 0 && !clear(cs.borderTopColor))
}

/** A click-through element showing at this point above everything else (a tooltip), if there is one. */
export function clickThroughAt(x: number, y: number, host: Element): Element | null {
  if (!seeThrough(true)) return null
  let list: Element[]
  try { list = document.elementsFromPoint(x, y) } finally { seeThrough(false) }
  for (const el of list) {
    if (el === host || host.contains(el)) continue
    if (el === document.documentElement || el === document.body) return null
    /* Reached something the pointer would hit anyway: nothing click-through is on top. */
    if (getComputedStyle(el).pointerEvents !== 'none') return null
    if (paints(el)) return el
  }
  return null
}
