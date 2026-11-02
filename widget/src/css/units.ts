/* A CSS value written every way, for the tip on a row of the CSS card: a
 * size in px and rem, a colour as hex, rgb and oklch, the way the code writes
 * it first. The card itself, the copy and the note keep the code exactly as
 * written, so Claude finds `14px` in the file, not `0.875rem`.
 *
 * Tokens (`var(--x)`) and urls are left whole: a token's name is the point,
 * and its resolved value is converted instead. Sizes convert between px and
 * rem only, at the page's own root font size; em, %, vw and unitless numbers
 * depend on where they're used, so they have no other form.
 */
import { COLOR_FN, convertColor, HEX_COLOR, parseColor, type ColorFormat } from './color'

/** One part of a value (a size, a colour), each way it can be written: the code's own way first, marked. */
export interface Part { forms: Array<{ label: string; text: string; code?: true }> }

/** Properties where a bare word can be a colour name (`red`); elsewhere `red` may be a font. */
const COLOR_PROP = /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|(box|text)-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|--.*)$/
/** Properties whose text isn't values to convert. */
const TEXT_PROP = /^(font-family|font|content|quotes|grid-template-areas|transition-property|will-change|animation-name)$/
const NOT_A_COLOR = /^(transparent|currentcolor|none|inherit|initial|unset|revert|inset|solid|dashed|dotted|double|groove|ridge|outset|hidden)$/i
/** At most this many parts get a line in the tip: a long gradient lists its first few. */
const MAX_FORMS = 3

const round = (x: number) => {
  const s = (Math.round(x * 10000) / 10000).toString()
  return s === '-0' ? '0' : s
}

const LENGTH = /(?<![\w.#-])(-?(?:\d+\.?\d*|\.\d+))(px|rem)\b/g
const WORD = /(?<![\w#(-])([a-zA-Z]+)(?![\w(-])/g
const FORMATS: ColorFormat[] = ['hex', 'rgb', 'oklch']

/** A colour as written, then in the formats it isn't written in; none if it can't be read. */
function colorForms(text: string): Part['forms'] {
  const own = text.startsWith('#') ? 'hex' : /^rgba?\(/i.test(text) ? 'rgb' : /^oklch\(/i.test(text) ? 'oklch' : null
  const others = FORMATS.filter(f => f !== own).map(f => ({ label: f, text: convertColor(text, f) })).filter(o => o.text !== text)
  if (!others.length) return []
  const label = own ?? (/^[a-z]+$/i.test(text) ? 'name' : text.slice(0, text.indexOf('(')).toLowerCase())
  return [{ label, text, code: true }, ...others]
}

/** The value outside its tokens and urls, which are kept whole. */
function loose(value: string): string {
  let out = '', i = 0
  while (i < value.length) {
    if (!/^(var|url)\(/i.test(value.slice(i))) { out += value[i++]; continue }
    let depth = 0
    for (; i < value.length; i++) {
      if (value[i] === '(') depth++
      else if (value[i] === ')' && --depth === 0) { i++; break }
    }
    out += ' '
  }
  return out
}

/** Each size and colour in `value` of `prop`, every way it can be written, in the order they're written. */
export function allForms(value: string, prop: string, rootPx: number): Part[] {
  if (TEXT_PROP.test(prop)) return []
  const text = loose(value)
  const found: Array<{ at: number; part: Part }> = []
  const add = (at: number, forms: Part['forms']) => {
    if (forms.length && !found.some(f => f.part.forms[0].text === forms[0].text)) found.push({ at, part: { forms } })
  }
  if (rootPx > 0) {
    for (const m of text.matchAll(LENGTH)) {
      const x = parseFloat(m[1])
      if (x !== 0) add(m.index, [{ label: m[2], text: m[0], code: true }, m[2] === 'px' ? { label: 'rem', text: `${round(x / rootPx)}rem` } : { label: 'px', text: `${round(x * rootPx)}px` }])
    }
  }
  for (const m of text.matchAll(COLOR_FN)) add(m.index, colorForms(m[0]))
  for (const m of text.matchAll(HEX_COLOR)) add(m.index, colorForms(m[0]))
  if (COLOR_PROP.test(prop)) {
    for (const m of text.matchAll(WORD)) if (!NOT_A_COLOR.test(m[0]) && parseColor(m[0])) add(m.index, colorForms(m[0]))
  }
  return found.sort((a, b) => a.at - b.at).slice(0, MAX_FORMS).map(f => f.part)
}

/** The page's root font size, which rem is measured against. */
export function rootFontPx(): number {
  try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 } catch { return 16 }
}
