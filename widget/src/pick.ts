/* Which element the person means.
 *
 * The smallest real thing under the pointer, the way a design tool selects:
 * the icon in a button, the badge in a table row, the title on a card. The
 * button, the row or the card is one ↑ away, and is what's picked on its own
 * padding. Two things the browser's own hit test gets wrong are put right:
 *
 *  - Icons made to ignore the pointer (`pointer-events: none`, as shadcn/ui
 *    and most Tailwind kits do) are invisible to it, so it answers with the
 *    button. Inspeck looks inside what it answered for what's really there.
 *  - A "stretched link" (a link whose ::after covers the whole card) answers
 *    for everything on the card. Inspeck looks past it, to what's showing.
 */

import { parentAcross } from './dom'
import { framedByInspeck } from './frames'

/** The topmost page element at a point, looking through Inspeck's own layer, and through layers nobody
    can see (see invisibleLayer): the pointer means what shows there. */
export function elementAt(x: number, y: number, host: Element): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el === host || host.contains(el)) continue
    if (el === document.documentElement || el === document.body) return null
    /* A frame with its own Inspeck answers for what's in it (see frames.ts). */
    if (framedByInspeck(el)) return null
    /* A web component answers for what's inside it: whether something shows here is the inside's to say
       (a component fixed over the page, like a chat button, paints nothing itself, only its inside does). */
    const inner = into(el, x, y)
    if (invisibleLayer(inner) || stretched(inner, x, y)) continue
    return within(inner, x, y)
  }
  return null
}

/** Inside a web component (an open shadow root), the element at the point is in there, not the component
    itself. A closed one can't be looked into: the component is as far as anyone can see. */
function into(el: Element, x: number, y: number): Element {
  for (let depth = 0; el.shadowRoot && depth < 10; depth++) {
    const root = el.shadowRoot
    const inner = root.elementsFromPoint(x, y).find(e => e !== el && root.contains(e) && !invisibleLayer(e))
    if (!inner) break
    el = inner
  }
  return el
}

/** Whether the element was hit only through a pseudo-element laid over a wider area (a stretched link's
    ::after covering its card): the point isn't on the element itself, so it means what's under it. */
function stretched(el: Element, x: number, y: number): boolean {
  if (onBox(el, x, y)) return false
  return (['::before', '::after'] as const).some(p => {
    const cs = getComputedStyle(el, p)
    return cs.content !== 'none' && cs.content !== 'normal' && (cs.position === 'absolute' || cs.position === 'fixed')
  })
}

/** Whether a point is on an element's own boxes (each line of an inline element is one). */
function onBox(el: Element, x: number, y: number): boolean {
  return Array.from(el.getClientRects()).some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
}

/** Media: one thing to a person, however it's built inside. */
const MEDIA = /^(img|svg|video|canvas|picture|iframe|embed|object|input|select|textarea)$/i

/**
 * What's really at the point inside the element the browser answered with. A child there that the browser
 * passed over ignores the pointer (an icon in a button, usually), but it's what shows: go down to it. Not into
 * an overlay laid across the element (positioned, not media), which is decoration the person looks through.
 */
function within(el: Element, x: number, y: number): Element {
  for (let depth = 0; depth < 12 && !MEDIA.test(el.tagName); depth++) {
    let next: Element | null = null
    const kids = el.children
    for (let i = kids.length - 1; i >= 0 && !next; i--) {
      const c = kids[i]
      if (!onBox(c, x, y) || !shows(c)) continue
      const position = getComputedStyle(c).position
      if ((position === 'absolute' || position === 'fixed') && !MEDIA.test(c.tagName)) continue
      next = c
    }
    if (!next) break
    el = next
  }
  return el
}

/** Shown at all: not hidden, not faded right out. */
function shows(el: Element): boolean {
  const cs = getComputedStyle(el)
  return cs.visibility === 'visible' && Number(cs.opacity) > 0 && cs.display !== 'none'
}

/** Media and controls show something even when they paint no box of their own. */
const SHOWS = /^(img|svg|video|canvas|iframe|embed|object|input|select|textarea|button|picture)$/i

/**
 * A layer lying over the page that you can't see at this point, so it can't be what the pointer means:
 *  - faded right out (opacity 0, itself or a parent): a menu or a panel hidden that way but still there;
 *  - positioned over the page and painting nothing of its own here: a click-catcher, a "stretched link"
 *    over a card, the empty holder of a cookie banner or a chat widget, a fixed footer's wrapper.
 * It's only called for the element the pointer is on itself, not one of its children (those come first
 * in the hit list), so a positioned box is skipped only where it's see-through.
 */
export function invisibleLayer(el: Element): boolean {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    if (Number(getComputedStyle(e).opacity) === 0) return true
  }
  if (SHOWS.test(el.tagName)) return false
  const position = getComputedStyle(el).position
  if (position !== 'absolute' && position !== 'fixed') return false
  return !paints(el)
}

/**
 * The words under the pointer, when they're a thing of their own inside the element: the label beside an
 * icon in a button, the text in a padded table cell. Not when the element is just those words (a <span>
 * that hugs its text, a plain paragraph): then the element is the text, and picking it says the same.
 * Words are text nodes, not elements, so the pick is still the element; this says which part of it.
 */
export function textAt(el: Element, x: number, y: number): Text | null {
  if (MEDIA.test(el.tagName) || el instanceof SVGElement) return null
  let hit: Text | null = null
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent!.trim()) continue
    if (Array.from(wordsRange(n as Text).getClientRects()).some(r => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1)) { hit = n as Text; break }
  }
  if (!hit) return null
  /* Words beside something else (an icon, a badge): a part of their own. */
  if (Array.from(el.children).some(c => MEDIA.test(c.tagName) || getComputedStyle(c).display !== 'inline')) return hit
  /* Alone in a box of their own (padding, a fill, a border) much bigger than they are (a padded table cell, a
     wide button): a part of their own too. A pill or a chip hugging its word is one thing, the badge, as is a small
     round box (an avatar's initials); and a heading or a paragraph with no box is just its words: all are left to
     the element. */
  const cs = getComputedStyle(el)
  const padded = ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs[`padding${s}` as 'paddingTop']) >= 2)
  if (!padded && !paints(el, true)) return null
  const t = textRect(hit), b = el.getBoundingClientRect()
  const pill = b.height <= 32 && b.width - t.width <= 40
  const side = Math.min(b.width, b.height), r = cs.borderTopLeftRadius
  const round = side <= 64 && (r.endsWith('%') ? parseFloat(r) / 100 * side : parseFloat(r)) >= side * 0.35
  return !pill && !round && b.width * b.height > 0 && (t.width * t.height) / (b.width * b.height) < 0.45 ? hit : null
}

/** The words of a text node, without the spaces around them. */
function wordsRange(n: Text): Range {
  const t = n.textContent ?? ''
  const r = document.createRange()
  r.setStart(n, t.length - t.trimStart().length)
  r.setEnd(n, t.trimEnd().length)
  return r
}

/** Where the words of a text node are on screen. */
export function textRect(n: Text): DOMRect {
  return wordsRange(n).getBoundingClientRect()
}

/** The element the person means, from the one under the pointer: itself, except a part of a drawing (a
    <path> in an icon), which means the whole icon. */
export function snap(el: Element): Element {
  if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) {
    let svg = el.ownerSVGElement
    /* An <svg> drawn inside another <svg> is still part of one picture. */
    while (svg?.ownerSVGElement) svg = svg.ownerSVGElement
    return svg ?? el
  }
  return el
}

export function parentOf(el: Element): Element | null {
  const p = parentAcross(el)
  return p && p !== document.body && p !== document.documentElement ? p : null
}

/** One level in: the child under the pointer, else the first child with a box. */
export function childToward(el: Element, x: number, y: number): Element | null {
  let first: Element | null = null
  /* A web component's inside is its shadow root's, when it's open. */
  for (const c of Array.from((el.shadowRoot ?? el).children)) {
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

/** Whether an element shows anything itself: text, a fill, a border, a shadow, an image. With `boxOnly`,
    only the box: a fill, a border, a shadow. */
export function paints(el: Element, boxOnly = false): boolean {
  const cs = getComputedStyle(el)
  if (cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (Number(getComputedStyle(p).opacity) === 0) return false
  }
  if (/^(img|svg|video|canvas|picture)$/i.test(el.tagName)) return true
  if (!boxOnly && Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) return true
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
    if (paints(el) && floating(el) && !hollowAt(el, x, y)) return el
  }
  return null
}

/** Only a frame drawn around the point, nothing over it: a border with an empty middle, like the outline MUI lays
    over a text field, or a focus ring. A tooltip has a fill or words where the pointer is. */
function hollowAt(el: Element, x: number, y: number): boolean {
  const cs = getComputedStyle(el)
  if (!clear(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow.includes('inset')) return false
  if (/^(img|svg|video|canvas|picture)$/i.test(el.tagName)) return false
  if (Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) return false
  const r = el.getBoundingClientRect()
  return x > r.left + parseFloat(cs.borderLeftWidth) && x < r.right - parseFloat(cs.borderRightWidth) &&
    y > r.top + parseFloat(cs.borderTopWidth) && y < r.bottom - parseFloat(cs.borderBottomWidth)
}

/** Laid over the page the way a tooltip or a hover card is (positioned, it or a holder of it) and not a backdrop
    the size of the window. A decoration made to ignore the pointer (a spinning logo, a glow behind a hero) isn't
    one, even where it's drawn on top. */
function floating(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width * r.height > 0.5 * innerWidth * innerHeight) return false
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const position = getComputedStyle(e).position
    if (position === 'absolute' || position === 'fixed') return true
  }
  return false
}
