/* A CSS value as the card shows it, in the units and colour format you chose
 * in Settings. Only what the card shows: notes to Claude and Copy CSS keep the
 * code exactly as written, so Claude finds `14px` in the file, not `0.875rem`.
 *
 * Tokens (`var(--x)`) and urls are left whole: a token's name is the point,
 * and its resolved value is shown (and converted) beside it. Sizes convert
 * between px and rem only, at the page's own root font size; em, %, vw and
 * unitless numbers depend on where they're used, so they stay as written.
 */
import { COLOR_FN, convertColor, HEX_COLOR, parseColor, type ColorFormat } from './color'

export type SizeFormat = 'written' | 'px' | 'rem'
export type ColorChoice = 'written' | ColorFormat
export interface ValueFormat { sizes: SizeFormat; colors: ColorChoice; rootPx: number }

/** Properties where a bare word can be a colour name (`red`); elsewhere `red` may be a font. */
const COLOR_PROP = /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|(box|text)-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|--.*)$/
/** Properties whose text isn't values to convert. */
const TEXT_PROP = /^(font-family|font|content|quotes|grid-template-areas|transition-property|will-change|animation-name)$/

const round = (x: number) => {
  const s = (Math.round(x * 10000) / 10000).toString()
  return s === '-0' ? '0' : s
}

const LENGTH = /(?<![\w.#-])(-?(?:\d+\.?\d*|\.\d+))(px|rem)\b/g

function sizes(text: string, to: SizeFormat, rootPx: number): string {
  if (to === 'written' || !(rootPx > 0)) return text
  return text.replace(LENGTH, (all, num: string, unit: string) => {
    if (unit === to) return all
    const x = parseFloat(num)
    return `${round(to === 'rem' ? x / rootPx : x * rootPx)}${to}`
  })
}

const WORD = /(?<![\w#(-])([a-zA-Z]+)(?![\w(-])/g

function colors(text: string, to: ColorChoice, prop: string): string {
  if (to === 'written') return text
  let out = text.replace(COLOR_FN, fn => convertColor(fn, to)).replace(HEX_COLOR, hex => convertColor(hex, to))
  if (COLOR_PROP.test(prop)) {
    out = out.replace(WORD, word => (/^(transparent|currentcolor|none|inherit|initial|unset|revert|inset|solid|dashed|dotted|double|groove|ridge|outset|hidden)$/i.test(word) || !parseColor(word) ? word : convertColor(word, to)))
  }
  return out
}

/** The value in pieces: tokens and urls kept whole, everything else free to convert. */
function pieces(value: string): Array<{ text: string; keep: boolean }> {
  const out: Array<{ text: string; keep: boolean }> = []
  let i = 0, from = 0
  while (i < value.length) {
    const m = /^(var|url)\(/i.exec(value.slice(i))
    if (!m) { i++; continue }
    if (i > from) out.push({ text: value.slice(from, i), keep: false })
    let depth = 0, j = i
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++
      else if (value[j] === ')' && --depth === 0) { j++; break }
    }
    out.push({ text: value.slice(i, j), keep: true })
    i = from = j
  }
  if (from < value.length) out.push({ text: value.slice(from), keep: false })
  return out
}

/** `value` of `prop`, in the chosen sizes and colours. */
export function present(value: string, prop: string, f: ValueFormat): string {
  if ((f.sizes === 'written' && f.colors === 'written') || TEXT_PROP.test(prop)) return value
  return pieces(value).map(p => (p.keep ? p.text : colors(sizes(p.text, f.sizes, f.rootPx), f.colors, prop))).join('')
}

/** The page's root font size, which rem is measured against. */
export function rootFontPx(): number {
  try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 } catch { return 16 }
}
