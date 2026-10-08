/* Building DOM without innerHTML or style attributes, so the widget works on
   pages with Trusted Types and a strict style-src. Every element is made with
   createElement, every style lives in a constructable stylesheet or is set
   through the CSSOM (el.style.x = …), which CSP allows. */

type Attrs = Record<string, string | number | boolean | null | undefined>
type Child = Node | string | number | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue
    el.setAttribute(k, v === true ? '' : String(v))
  }
  append(el, children)
  return el
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === false || c == null) continue
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

const SVG = 'http://www.w3.org/2000/svg'

/** An icon as [tag, attributes] pairs, drawn on a 24px grid in currentColor. */
export type IconSpec = Array<[string, Record<string, string>]>

export function svg(spec: IconSpec, size = 16, strokeWidth = 1.7): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg')
  for (const [k, v] of Object.entries({
    width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': String(strokeWidth), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) s.setAttribute(k, v)
  for (const [tag, attrs] of spec) {
    const n = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    s.appendChild(n)
  }
  return s
}

export function sheet(css: string): CSSStyleSheet {
  const s = new CSSStyleSheet()
  s.replaceSync(css)
  return s
}

/** True when the keyboard is in a field the person is typing into. */
export function isEditable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}
