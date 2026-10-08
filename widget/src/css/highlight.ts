/* Syntax colours for a CSS value, as DOM (no innerHTML). A token reads as a
   chip with its name (`var(--text-sm)` → [text-sm]) so a linked value stands
   apart from a typed-in one at a glance; numbers are amber, keywords violet,
   hex colours get a swatch. Copying still gives the CSS exactly as written. */
import { h } from '../dom'

const PATTERN = /(var\()(--[\w-]+)(\s*,\s*[^)]*)?(\))|(#[0-9A-Fa-f]{3,8})\b|(-?\d*\.?\d+)(px|r?em|%|ms|s|deg|vh|vw|fr)?|([a-zA-Z-]+)(?=\()|([a-zA-Z-]+)|([^\w#-]+|-)/g

export function swatch(color: string): HTMLSpanElement {
  const s = h('span', { class: 'sw' })
  s.style.background = color
  return s
}

export function highlight(value: string): DocumentFragment {
  const f = document.createDocumentFragment()
  const span = (cls: string, text: string) => f.appendChild(h('span', { class: cls }, text))
  for (const m of value.matchAll(PATTERN)) {
    if (m[1]) {
      f.appendChild(h('span', { class: 'tok', title: `var(${m[2]}${m[3] ?? ''})` }, m[2].slice(2)))
    } else if (m[5]) {
      f.appendChild(swatch(m[5]))
      span('c-hex', m[5])
    } else if (m[6]) span('c-num', m[6] + (m[7] ?? ''))
    else if (m[8]) span('c-fn', m[8])
    else if (m[9]) span('c-kw', m[9])
    else span('c-punct', m[10] ?? m[0])
  }
  return f
}

/** The resolved value after a token, dimmed; colours get a swatch. */
export function resolved(value: string): HTMLSpanElement {
  const s = h('span', { class: 'res' })
  const c = /^#[0-9A-Fa-f]{3,8}$|^(rgb|hsl|oklch|oklab|color)\(/.test(value)
  if (c) s.appendChild(swatch(value))
  s.append(value)
  return s
}
