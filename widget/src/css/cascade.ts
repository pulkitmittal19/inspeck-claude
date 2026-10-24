/* Which written declaration sets a property on an element.
 *
 * The browser's order, simplified to what matters in practice:
 *   !important beats normal; inline beats rules; for normal declarations an
 *   unlayered rule beats a layered one and a later layer beats an earlier one
 *   (reversed for !important); then specificity; then source order.
 *
 * A property can be set by itself or by a shorthand: padding-left by
 * padding-left, padding-inline-start, padding-inline or padding. When a
 * shorthand holds a var(), the browser leaves its longhands empty, so we read
 * the shorthand's own text and take this side's part of it when we can.
 */
import { buildIndex, matchingRules, signatureOf, UNLAYERED, type RuleIndex } from './rules'

export interface Written {
  /** The property name as written, e.g. `padding` or `background`. */
  property: string
  /** The value as written, e.g. `var(--spacing-200) var(--spacing-400)`. */
  value: string
  important: boolean
  source: 'inline' | 'rule' | 'attribute'
  /** Set on an ancestor and inherited (colour, font…). */
  inheritedFrom?: Element
}

/** Every property that can set a longhand, most specific first. */
export const SETTERS: Record<string, string[]> = {
  'padding-top': ['padding-top', 'padding-block-start', 'padding-block', 'padding'],
  'padding-bottom': ['padding-bottom', 'padding-block-end', 'padding-block', 'padding'],
  'padding-left': ['padding-left', 'padding-inline-start', 'padding-inline', 'padding'],
  'padding-right': ['padding-right', 'padding-inline-end', 'padding-inline', 'padding'],
  'margin-top': ['margin-top', 'margin-block-start', 'margin-block', 'margin'],
  'margin-bottom': ['margin-bottom', 'margin-block-end', 'margin-block', 'margin'],
  'margin-left': ['margin-left', 'margin-inline-start', 'margin-inline', 'margin'],
  'margin-right': ['margin-right', 'margin-inline-end', 'margin-inline', 'margin'],
  'border-top-left-radius': ['border-top-left-radius', 'border-start-start-radius', 'border-radius'],
  'border-top-right-radius': ['border-top-right-radius', 'border-start-end-radius', 'border-radius'],
  'border-bottom-right-radius': ['border-bottom-right-radius', 'border-end-end-radius', 'border-radius'],
  'border-bottom-left-radius': ['border-bottom-left-radius', 'border-end-start-radius', 'border-radius'],
  'background-color': ['background-color', 'background'],
  'font-size': ['font-size', 'font'],
  'font-weight': ['font-weight', 'font'],
  'line-height': ['line-height', 'font'],
  'font-family': ['font-family', 'font'],
  'row-gap': ['row-gap', 'gap'],
  'column-gap': ['column-gap', 'gap'],
}
for (const side of ['top', 'right', 'bottom', 'left']) {
  for (const k of ['width', 'color', 'style']) SETTERS[`border-${side}-${k}`] = [`border-${side}-${k}`, `border-${side}`, `border-${k}`, 'border']
}

/** The logical twin of a physical side (left-to-right, top-to-bottom): both name the same thing. */
const TWIN: Record<string, string> = {}
for (const box of ['padding', 'margin']) {
  for (const [phys, log] of [['top', 'block-start'], ['bottom', 'block-end'], ['left', 'inline-start'], ['right', 'inline-end']]) {
    TWIN[`${box}-${phys}`] = `${box}-${log}`; TWIN[`${box}-${log}`] = `${box}-${phys}`
  }
}
for (const [phys, log] of [['top-left', 'start-start'], ['top-right', 'start-end'], ['bottom-right', 'end-end'], ['bottom-left', 'end-start']]) {
  TWIN[`border-${phys}-radius`] = `border-${log}-radius`; TWIN[`border-${log}-radius`] = `border-${phys}-radius`
}

/** The longhands a property sets, as this browser expands it (`padding-inline` → its start and end). */
const expansions = new Map<string, string[]>()
function longhandsOf(p: string): string[] {
  let l = expansions.get(p)
  if (!l) {
    const probe = document.createElement('div').style
    probe.setProperty(p, 'inherit')
    expansions.set(p, l = probe.length ? Array.from(probe) : [p])
  }
  return l
}

/** Where in its own block a declaration sets this longhand: `padding: 0; padding-inline: 7px` sets the left
    side twice, and the later one wins. -1 when it can't be told. */
function positionIn(style: CSSStyleDeclaration, setter: string, longhand: string): number {
  const same = new Set([longhand, TWIN[longhand]])
  const items = Array.from(style)
  let at = -1
  for (const l of longhandsOf(setter)) if (same.has(l)) at = Math.max(at, items.indexOf(l))
  return at
}

const INHERITED = new Set(['color', 'font-size', 'font-weight', 'line-height', 'font-family', 'letter-spacing', 'fill', 'stroke'])

/* ---------------- the index, rebuilt only when the page's CSS changes ---------------- */

let index: RuleIndex | null = null
const shadowIndexes = new WeakMap<ShadowRoot, RuleIndex>()

export function indexFor(el: Element): RuleIndex {
  const root = el.getRootNode()
  if (root instanceof ShadowRoot) {
    let i = shadowIndexes.get(root)
    if (!i || i.signature !== signatureOf(root)) shadowIndexes.set(root, i = buildIndex(root))
    return i
  }
  if (!index || index.signature !== signatureOf(document)) index = buildIndex(document)
  return index
}

/** Build the index ahead of the first hover, when the browser is idle. */
export function warmUp(): void {
  const run = () => { indexFor(document.documentElement) }
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 })
  else setTimeout(run, 300)
}

/* ---------------- winning declaration ---------------- */

interface Candidate { property: string; value: string; important: boolean; inline: boolean; layer: number; spec: number; order: number; pos: number; source: Written['source'] }

function beats(a: Candidate, b: Candidate): boolean {
  if (a.important !== b.important) return a.important
  if (a.inline !== b.inline) return a.inline
  if (a.layer !== b.layer) return a.important ? a.layer < b.layer : a.layer > b.layer
  if (a.spec !== b.spec) return a.spec > b.spec
  if (a.order !== b.order) return a.order > b.order
  return a.pos > b.pos
}

const PENDING = '\u0000pending'

/** The declaration that sets `longhand` on `el` itself (not inherited), or null for the browser default. */
export function ownWinner(el: Element, longhand: string): Written | null {
  const setters = SETTERS[longhand] ?? [longhand]
  let best: Candidate | null = null
  const consider = (c: Candidate) => { if (!best || beats(c, best)) best = c }

  for (const { entry, spec } of matchingRules(indexFor(el), el)) {
    let read = false
    for (const p of setters) {
      const v = entry.style.getPropertyValue(p)
      if (!v) continue
      read = true
      consider({ property: p, value: v.trim(), important: entry.style.getPropertyPriority(p) === 'important', inline: false, layer: entry.layer, spec, order: entry.order, pos: positionIn(entry.style, p, longhand), source: 'rule' })
    }
    /* Set by a shorthand made of one token (`border-bottom: var(--border)`) that won't read back: the browser
       keeps the longhand but not its text. It still wins or loses like any other; its value shows as it renders. */
    if (!read && Array.from(entry.style).includes(longhand)) {
      consider({ property: longhand, value: PENDING, important: entry.style.getPropertyPriority(longhand) === 'important', inline: false, layer: entry.layer, spec, order: entry.order, pos: positionIn(entry.style, longhand, longhand), source: 'rule' })
    }
  }
  const inline = (el as HTMLElement).style
  if (inline) {
    for (const p of setters) {
      const v = inline.getPropertyValue(p)
      if (v) consider({ property: p, value: v.trim(), important: inline.getPropertyPriority(p) === 'important', inline: true, layer: UNLAYERED, spec: 0, order: Infinity, pos: positionIn(inline, p, longhand), source: 'inline' })
    }
  }
  /* SVG presentation attributes: the weakest author style of all. */
  if (!best && el instanceof SVGElement) {
    const attr = el.getAttribute(longhand)
    if (attr) return { property: longhand, value: attr, important: false, source: 'attribute' }
  }
  if (!best) return null
  const b = best as Candidate
  if (b.value === PENDING) return { property: longhand, value: getComputedStyle(el).getPropertyValue(longhand).trim(), important: b.important, source: b.source }
  return { property: b.property, value: b.value, important: b.important, source: b.source }
}

/** Like ownWinner, but follows inheritance up the tree for colour and type. */
export function winner(el: Element, longhand: string): Written | null {
  const own = ownWinner(el, longhand)
  if (own || !INHERITED.has(longhand)) return own
  const mine = getComputedStyle(el).getPropertyValue(longhand)
  for (let p = el.parentElement; p; p = p.parentElement) {
    const w = ownWinner(p, longhand)
    if (!w) continue
    /* Only if the value really arrived by inheritance: form controls get
       their colour and font from the browser's own stylesheet instead. */
    return getComputedStyle(p).getPropertyValue(longhand) === mine ? { ...w, inheritedFrom: p } : null
  }
  return null
}

/* ---------------- shorthand parts ---------------- */

/** Split a value at top-level spaces: `var(--a) calc(1px + 2px) 3px` → three parts. */
export function parts(value: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of value.trim()) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = '' } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

const SIDE = { top: 0, right: 1, bottom: 2, left: 3 } as const

/** A lone var() in a shorthand: does the token hold one value (then it's every side) or several? */
function singleVar(token: string, el?: Element): boolean {
  const name = /^var\((--[\w-]+)/.exec(token)?.[1]
  if (!name || !el) return false
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return !!v && parts(v).length === 1
}

/** This side's piece of a 1–4 value box shorthand, or null if it can't be told (a var() holding several). */
export function sideOf(value: string, side: keyof typeof SIDE, el?: Element): string | null {
  const p = parts(value.replace(/\s*!important\s*$/, ''))
  if (p.length === 1 && /^var\(/.test(p[0])) return singleVar(p[0], el) ? p[0] : null
  const [t, r = t, b = t, l = r] = p
  return [t, r, b, l][SIDE[side]] ?? null
}

/** The `inline`/`block` logical shorthands: start then end. */
export function logicalPart(value: string, end: boolean, el?: Element): string | null {
  const p = parts(value)
  if (p.length === 1 && /^var\(/.test(p[0])) return singleVar(p[0], el) ? p[0] : null
  return end ? (p[1] ?? p[0]) : p[0]
}
