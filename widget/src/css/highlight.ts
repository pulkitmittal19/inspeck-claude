/* Syntax colours for a CSS value, as DOM (no innerHTML). A token reads as a
   chip with its name (`var(--text-sm)` → [text-sm]) so a linked value stands
   apart from a typed-in one at a glance; numbers are amber, keywords violet,
   colours (hex, rgb, hsl, oklch…) get a swatch. Copying still gives the CSS exactly as written. */
import { h } from '../dom'

const PATTERN = /(var\()(--[\w-]+)(\s*,\s*[^)]*)?(\))|(≈?#[0-9A-Fa-f]{3,8}\b|≈?(?:rgba?|hsla?|oklch|oklab|color)\([^()]*\))|(-?\d*\.?\d+)(px|r?em|%|ms|s|deg|vh|vw|fr)?|([a-zA-Z-]+)(?=\()|([a-zA-Z-]+)|([^\w#-]+|-)/g

/** Longest token name shown whole in a chip. */
const TOKEN_MAX = 30

/**
 * A long token name shortened from the middle, by whole words, keeping its
 * start (the family: `semantic-color`) and its end (what tells it apart from
 * its siblings: `hover-pressed`). `semantic-color-background-interactive-primary-hover-pressed`
 * → `semantic-color…hover-pressed`.
 */
export function shortName(name: string, max = TOKEN_MAX): string {
  if (name.length <= max) return name
  const parts = name.split(/(?<=[-_])/)
  let head = '', tail = ''
  for (let i = 0, j = parts.length - 1; i <= j;) {
    const tryTail = parts[j] + tail
    if ((head + tryTail).length + 1 <= max) { tail = tryTail; j--; }
    else break
    const tryHead = head + parts[i]
    if (i <= j && (tryHead + tail).length + 1 <= max) { head = tryHead; i++ }
  }
  head = head.replace(/[-_]$/, '')
  tail = tail.replace(/^[-_]/, '')
  /* One very long word: cut by characters instead. */
  if (!head || !tail) return name.slice(0, Math.ceil((max - 1) / 2)) + '…' + name.slice(-Math.floor((max - 1) / 2))
  return `${head}…${tail}`
}

/** Text shortened from the middle by characters, for labels. */
export function middle(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.ceil((max - 1) / 2)) + '…' + text.slice(-Math.floor((max - 1) / 2))
}

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
      f.appendChild(h('span', { class: 'tok', title: `var(${m[2]}${m[3] ?? ''})` }, shortName(m[2].slice(2))))
    } else if (m[5]) {
      /* ≈: written in a format that can't hold this colour exactly (see color.ts). */
      const approx = m[5].startsWith('≈')
      const c = approx ? m[5].slice(1) : m[5]
      f.appendChild(swatch(c))
      if (approx) f.appendChild(h('span', { class: 'c-approx', title: 'Nearest colour this format can show' }, '≈'))
      span('c-hex', c)
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
  const c = /^≈?(#[0-9A-Fa-f]{3,8}$|(rgba?|hsla?|oklch|oklab|color)\()/.test(value)
  if (c) s.appendChild(swatch(value.replace(/^≈/, '')))
  s.append(value)
  return s
}
