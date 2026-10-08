/* The five or six declarations that matter for an element, written the way
 * the code writes them, each with the real value beside it when the code
 * uses a token or a calculation.
 *
 *   padding: var(--spacing-200) var(--spacing-400);   8px 16px
 *   border-radius: var(--radius-200);                  8px
 *   background: #17171C;
 */
import { logicalPart, ownWinner, parts, sideOf, winner, type Written } from './cascade'

export type Kind = 'control' | 'text' | 'image' | 'box'

export interface Line {
  prop: string
  value: string
  /** The resolved value, shown dimmed, when it differs from what's written. */
  resolved?: string
}

export interface Description {
  kind: Kind
  /** e.g. `button.btn-primary` */
  label: string
  /** The React component that rendered it, when the app is a dev build. */
  component?: string
  size: string
  lines: Line[]
}

const MAX_LINES = 6

const CONTROL = 'button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=combobox]'
const TEXTY = /^(H[1-6]|P|LABEL|LI|SPAN|STRONG|EM|B|I|SMALL|CODE|BLOCKQUOTE|FIGCAPTION|TD|TH|DT|DD|LEGEND|CAPTION)$/

export function kindOf(el: Element): Kind {
  if (/^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/i.test(el.tagName)) return 'image'
  if (el.matches(CONTROL)) return 'control'
  const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent!.trim())
  if (TEXTY.test(el.tagName) || (ownText && el.childElementCount === 0)) return 'text'
  return 'box'
}

/* ---------------- formatting computed values ---------------- */

const round = (n: number) => String(Math.round(n * 100) / 100)

export function px(v: string): string {
  return v.replace(/(-?\d*\.\d+|-?\d+)px/g, (_, n: string) => `${round(parseFloat(n))}px`)
}

/** rgb()/rgba() → #rrggbb (or #rrggbbaa); anything else (oklch, color-mix) as the browser wrote it. */
export function hex(v: string): string {
  return v.replace(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)/g,
    (_, r: string, g: string, b: string, a?: string) => {
      const h2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
      let out = `#${h2(+r)}${h2(+g)}${h2(+b)}`.toUpperCase()
      if (a != null) {
        const alpha = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)
        if (alpha < 1) out += h2(alpha * 255).toUpperCase()
      }
      return out.replace(/^#([0-9A-F])\1([0-9A-F])\2([0-9A-F])\3$/, '#$1$2$3')
    })
}

/* ---------------- oklch / oklab → hex, so a Tailwind 4 colour reads like a colour ---------------- */

const num = (v: string, pct = 1) => (v === 'none' ? 0 : v.endsWith('%') ? (parseFloat(v) / 100) * pct : parseFloat(v))

function oklabToHex(L: number, a: number, b: number, alpha: number): string {
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const ch = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  }
  let out = `#${lin.map(ch).join('')}`.toUpperCase()
  if (alpha < 1) out += Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()
  return out.replace(/^#([0-9A-F])\1([0-9A-F])\2([0-9A-F])\3$/, '#$1$2$3')
}

export function oklchHex(v: string): string {
  return v
    .replace(/oklch\(\s*([\d.%a-z]+)\s+([\d.%a-z]+)\s+([\d.%a-z]+)\s*(?:\/\s*([\d.%a-z]+))?\s*\)/g, (_, l: string, c: string, hh: string, a?: string) => {
      const C = num(c, 0.4), H = (num(hh) * Math.PI) / 180
      return oklabToHex(num(l), C * Math.cos(H), C * Math.sin(H), a ? num(a) : 1)
    })
    .replace(/oklab\(\s*([\d.%a-z-]+)\s+([\d.%a-z-]+)\s+([\d.%a-z-]+)\s*(?:\/\s*([\d.%a-z]+))?\s*\)/g, (_, l: string, a2: string, b2: string, a?: string) =>
      oklabToHex(num(l), num(a2, 0.4), num(b2, 0.4), a ? num(a) : 1))
}

const clean = (v: string) => oklchHex(hex(px(v))).trim()
const writtenUsesLogic = (v: string) => /var\(|calc\(|env\(|clamp\(|min\(|max\(|\d(r?em|vh|vw|%)|color-mix|currentcolor|inherit/i.test(v)

/** `var(--tw-font-weight, var(--font-weight-medium))` → `var(--font-weight-medium)`: Tailwind's plumbing, not the token. */
export function unplumb(v: string): string {
  let out = v.trim()
  for (let i = 0; i < 4; i++) {
    const m = /^var\(--tw-[\w-]+\s*,\s*([\s\S]*)\)$/.exec(out)
    if (!m) break
    out = m[1].trim()
  }
  return out
}

function line(prop: string, written: string, computed: string): Line {
  /* The CSSOM hands back #17171C as rgb(23, 23, 28); write it the way people do. */
  const value = hex(unplumb(written.replace(/\s*!important$/, '')))
  const resolved = clean(computed)
  return writtenUsesLogic(value) && resolved && resolved !== value ? { prop, value, resolved } : { prop, value }
}

/* ---------------- box shorthands: padding, margin, radius ---------------- */

type Side = 'top' | 'right' | 'bottom' | 'left'
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

/** 4 values → the shortest shorthand that says the same thing. */
export function compress(v: string[]): string {
  const [t, r, b, l] = v
  if (t === r && r === b && b === l) return t
  if (t === b && r === l) return `${t} ${r}`
  if (r === l) return `${t} ${r} ${b}`
  return v.join(' ')
}

function pieceOf(el: Element, w: Written | null, base: string, side: Side, computed: string): string {
  if (!w) return computed
  const p = w.property
  if (p === `${base}-${side}`) return w.value
  if (p === base) return sideOf(w.value, side, el) ?? computed
  if (p === `${base}-inline` || p === `${base}-block`) {
    const inline = p.endsWith('inline')
    if (inline !== (side === 'left' || side === 'right')) return computed
    return logicalPart(w.value, side === 'right' || side === 'bottom', el) ?? computed
  }
  if (p.startsWith(`${base}-inline-`) || p.startsWith(`${base}-block-`)) return w.value
  return computed
}

function boxLine(el: Element, cs: CSSStyleDeclaration, base: 'padding' | 'margin'): Line | null {
  const computed = SIDES.map(s => px(cs.getPropertyValue(`${base}-${s}`)))
  if (computed.every(v => v === '0px')) return null
  const winners = SIDES.map(s => ownWinner(el, `${base}-${s}`))
  /* All four from one shorthand: show it exactly as written. */
  const w0 = winners[0]
  if (w0 && w0.property === base && winners.every(w => w && w.property === base && w.value === w0.value)) {
    return line(base, w0.value, compress(computed))
  }
  const written = compress(SIDES.map((s, i) => pieceOf(el, winners[i], base, s, computed[i])))
  return line(base, written, compress(computed))
}

function radiusLine(el: Element, cs: CSSStyleDeclaration): Line | null {
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
  const computed = corners.map(c => px(cs.getPropertyValue(`border-${c}-radius`)).split(' ')[0])
  if (computed.every(v => v === '0px')) return null
  const winners = corners.map(c => ownWinner(el, `border-${c}-radius`))
  const w0 = winners[0]
  if (w0 && w0.property === 'border-radius' && winners.every(w => w && w.property === 'border-radius' && w.value === w0.value)) {
    return line('border-radius', w0.value, compress(computed))
  }
  const written = corners.map((c, i) => {
    const w = winners[i]
    if (!w) return computed[i]
    if (w.property === 'border-radius') return sideOf(w.value, (['top', 'right', 'bottom', 'left'] as Side[])[i], el) ?? computed[i]
    return w.value
  })
  return line('border-radius', compress(written), compress(computed))
}

/* ---------------- single properties ---------------- */

/** One longhand's piece of a `font` shorthand: `600 13px/20px var(--font-body)`. */
export function fontPart(value: string, longhand: string): string | null {
  const p = parts(value.replace(/\s*\/\s*/g, '/'))
  /* A single var() is the whole shorthand; its parts can't be told apart. */
  if (p.length < 2) return null
  /* The size is the first length-like part (`13px`, `13px/20px`, `var(--text-sm)/1.5`); weight and style come before it, family after. */
  const sizeAt = p.findIndex(x => /^(-?[\d.]+(px|r?em|%|pt|vw|vh)|(var|calc|clamp|min|max)\(.*\))(\/.+)?$/.test(x))
  if (sizeAt < 0) return null
  const [size, lh] = p[sizeAt].split('/')
  switch (longhand) {
    case 'font-size': return size || null
    case 'line-height': return lh ?? null
    case 'font-weight': return p.slice(0, sizeAt).find(x => /^([1-9]00|bold|bolder|lighter|normal)$/.test(x)) ?? null
    case 'font-family': return p.slice(sizeAt + 1).join(' ') || null
  }
  return null
}

/* Type details nobody wrote (the browser's 400, normal) are noise; size and colour always matter. */
const QUIET_WHEN_DEFAULT = new Set(['font-weight', 'line-height', 'letter-spacing', 'font-family', 'object-fit'])

function simple(el: Element, cs: CSSStyleDeclaration, longhand: string, opts: { skip?: (v: string) => boolean; inherited?: boolean } = {}): Line | null {
  const computed = cs.getPropertyValue(longhand)
  if (!computed || opts.skip?.(computed)) return null
  const w = opts.inherited ? winner(el, longhand) : ownWinner(el, longhand)
  if (!w && QUIET_WHEN_DEFAULT.has(longhand)) return null
  if (!w) return { prop: longhand, value: clean(computed) }
  /* The `font` shorthand won: show just this longhand's part of it. */
  if (w.property === 'font') {
    const part = fontPart(w.value, longhand)
    return part ? line(longhand, part, computed) : { prop: longhand, value: clean(computed) }
  }
  return line(w.property, w.value, computed)
}

const transparent = (v: string) => /^(transparent|rgba\(0, 0, 0, 0\))$/.test(v.trim())

function backgroundLine(el: Element, cs: CSSStyleDeclaration): Line | null {
  const img = cs.backgroundImage
  if (transparent(cs.backgroundColor) && (!img || img === 'none')) return null
  const w = ownWinner(el, 'background-color')
  if (!w) return { prop: 'background', value: clean(cs.backgroundColor) }
  /* Designers say "background"; the colour longhand and the shorthand read the same here. */
  return line('background', w.value, cs.backgroundColor)
}

function borderLine(el: Element, cs: CSSStyleDeclaration): Line | null {
  if (cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0) return null
  const w = ownWinner(el, 'border-top-width')
  const computed = `${px(cs.borderTopWidth)} ${cs.borderTopStyle} ${cs.borderTopColor}`
  if (w && (w.property === 'border' || w.property === 'border-top')) return line(w.property, w.value, computed)
  const c = ownWinner(el, 'border-top-color')
  const color = c && !/^(border|border-top)$/.test(c.property) ? c.value : clean(cs.borderTopColor)
  return line('border', `${px(cs.borderTopWidth)} ${cs.borderTopStyle} ${color}`, computed)
}

function gapLine(el: Element, cs: CSSStyleDeclaration): Line | null {
  if (cs.rowGap === 'normal' && cs.columnGap === 'normal') return null
  if (parseFloat(cs.rowGap) === 0 && parseFloat(cs.columnGap) === 0) return null
  const w = ownWinner(el, 'column-gap')
  const computed = cs.rowGap === cs.columnGap ? cs.rowGap : `${cs.rowGap} ${cs.columnGap}`
  if (!w) return { prop: 'gap', value: px(computed) }
  return line(w.property === 'gap' ? 'gap' : 'column-gap', w.value, computed)
}

function displayLine(cs: CSSStyleDeclaration): Line | null {
  const d = cs.display
  if (!/flex|grid/.test(d)) return null
  const dir = d.includes('flex') && cs.flexDirection.startsWith('column') ? ` · ${cs.flexDirection}` : ''
  return { prop: 'display', value: `${d}${dir}` }
}

/* ---------------- labels ---------------- */

/* Classes that don't name anything: utilities (Tailwind and friends, or anything
   with : [ ] / !) and generated ones (css-1x9fq, sc-bdVaJa, _a3Fx9). */
const UTILITY = /[:[\]/!.]|^(css|sc|jsx|svelte|emotion)-|^_|^[a-z]+-(?=[a-zA-Z0-9]*[0-9A-Z])[a-zA-Z0-9]{5,}$/
const TAILWIND = /^-?(p[xytrbse]?|m[xytrbse]?|w|h|size|min-[wh]|max-[wh]|text|bg|from|via|to|border|rounded|gap|space|items|justify|self|place|font|leading|tracking|shadow|ring|opacity|z|top|left|right|bottom|start|end|inset|overflow|cursor|select|transition|duration|delay|ease|animate|outline|fill|stroke|col|row|order|basis|object|aspect|line-clamp|whitespace|break|decoration|list|align|content|origin|scale|rotate|translate|skew|pointer-events|resize|scroll|snap|touch|will|divide|grow|shrink|flex|grid|inline|truncate|relative|absolute|fixed|sticky|static|block|hidden|contents|isolate|underline|uppercase|lowercase|capitalize|italic|sr-only|antialiased|group|peer|visible|invisible|container|tabular-nums|transform|filter|blur|backdrop|mix-blend|appearance|accent|caret|placeholder|divide)(-|$)/

export function labelOf(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id && !/^[:]|^radix-|^headlessui-|\d{3,}/.test(el.id)) return `${tag}#${el.id}`
  const cls = Array.from(el.classList).find(c => !UTILITY.test(c) && !TAILWIND.test(c) && c.length <= 28)
  if (cls) return `${tag}.${cls}`
  /* No class worth showing: a role and its words say more, e.g. menuitem “Copy link”. */
  const role = el.getAttribute('role')
  if (role) {
    const words = ((el as HTMLElement).innerText ?? el.textContent ?? '').split('\n')[0].replace(/\s+/g, ' ').trim()
    return words ? `${role} “${words.length > 24 ? words.slice(0, 23) + '…' : words}”` : `${tag}[role=${role}]`
  }
  return tag
}

/** The React component that rendered an element (dev builds keep names). */
export function componentOf(el: Element): string | undefined {
  const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
  if (!key) return
  type Fiber = { type?: unknown; return?: Fiber | null }
  let f = (el as unknown as Record<string, Fiber>)[key] as Fiber | null | undefined
  for (let hops = 0; f && hops < 30; hops++, f = f.return) {
    const t = f.type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string } } | string | undefined
    if (!t || typeof t === 'string') continue
    const name = t.displayName || t.name || t.render?.displayName || t.render?.name
    if (name && /^[A-Z]/.test(name) && !/^(Fragment|Suspense|StrictMode|Provider|Consumer)$/.test(name)) return name
  }
}

/* ---------------- the description ---------------- */

export function describe(el: Element): Description {
  const cs = getComputedStyle(el)
  const kind = kindOf(el)
  const r = el.getBoundingClientRect()
  const lines: Array<Line | null> = []
  const font = (withLineHeight = true) => [
    simple(el, cs, 'font-size', { inherited: true }),
    withLineHeight ? simple(el, cs, 'line-height', { inherited: true, skip: v => v === 'normal' }) : null,
    simple(el, cs, 'font-weight', { inherited: true }),
  ]
  const color = () => simple(el, cs, 'color', { inherited: true })

  switch (kind) {
    case 'control':
      lines.push(boxLine(el, cs, 'padding'), radiusLine(el, cs), backgroundLine(el, cs), color(), ...font(false), borderLine(el, cs))
      break
    case 'text':
      /* Type first; then the box, for text that is also a pill or a chip. */
      lines.push(...font(), color(), boxLine(el, cs, 'padding'), backgroundLine(el, cs), radiusLine(el, cs),
        simple(el, cs, 'letter-spacing', { inherited: true, skip: v => v === 'normal' || v === '0px' }), boxLine(el, cs, 'margin'))
      break
    case 'image':
      lines.push(radiusLine(el, cs), simple(el, cs, 'object-fit', { skip: v => v === 'fill' }),
        el instanceof SVGElement ? simple(el, cs, 'color', { inherited: true }) : null, boxLine(el, cs, 'margin'))
      break
    default:
      lines.push(displayLine(cs), gapLine(el, cs), boxLine(el, cs, 'padding'), backgroundLine(el, cs), radiusLine(el, cs), borderLine(el, cs))
  }

  /* Merge two lines of one shorthand (`font: …` won for size and weight). */
  const out: Line[] = []
  for (const l of lines) {
    if (!l) continue
    if (out.some(o => o.prop === l.prop && o.value === l.value)) continue
    out.push(l)
  }
  return {
    kind,
    label: labelOf(el),
    component: componentOf(el),
    size: `${Math.round(r.width)} × ${Math.round(r.height)}`,
    lines: out.slice(0, MAX_LINES),
  }
}
