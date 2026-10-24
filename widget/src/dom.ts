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
/* ---------- elements inside web components ----------
 * A selector into an open shadow root is written host first: `my-card >>> .title` (each `>>>` steps
 * into the shadow root of what's matched so far). */

export const SHADOW_STEP = ' >>> '

/** The element a selector names, stepping into open shadow roots at each `>>>`. */
export function queryDeep(selector: string): Element | null {
  const steps = selector.split(SHADOW_STEP)
  let scope: Document | ShadowRoot = document
  let el: Element | null = null
  for (let i = 0; i < steps.length; i++) {
    try { el = scope.querySelector(steps[i]) } catch { return null }
    if (!el) return null
    if (i < steps.length - 1) {
      if (!el.shadowRoot) return null
      scope = el.shadowRoot
    }
  }
  return el
}

/** An element's parent, or the component it's inside when it's at the top of a shadow root. */
export function parentAcross(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

export function isEditable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

/** The words an element shows, on one line. A note stores them and its marker finds the element again by them,
    so both must read them the same way. `firstLine` for a label. */
export function visibleText(el: Element, firstLine = false): string {
  const t = (el as HTMLElement).innerText ?? el.textContent ?? ''
  return (firstLine ? t.split('\n')[0] : t).replace(/\s+/g, ' ').trim()
}

/** Takes typed letters: a field, an editor (contenteditable, or one that says it's a text box), a dropdown (letters
    jump to an option). */
const takesLetters = (el: Element) =>
  isEditable(el) || el instanceof HTMLSelectElement || /^(textbox|searchbox|combobox)$/.test(el.getAttribute('role') ?? '')

/**
 * Whether a key pressed on the page is someone typing there, so it's a letter and not one of Inspeck's keys: in
 * any of the above, inside web components too. Focus inside a component that hides its inside (a closed shadow
 * root) counts as typing: when Inspeck can't tell, the key types.
 */
export function typingOnPage(e: KeyboardEvent): boolean {
  const own = e.composedPath()[0]
  if (own instanceof Element && takesLetters(own)) return true
  let a = document.activeElement
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement
  if (!a) return false
  if (takesLetters(a)) return true
  /* Focused, yet a component that can't take focus itself: the focus is somewhere inside it we can't see. */
  return a.localName.includes('-') && !a.shadowRoot && !a.hasAttribute('tabindex')
}

/** Put text on the clipboard: the page's clipboard, or, where a browser won't allow it (some embedded
    ones), a selection copied the old way. `within` is where the selection briefly lives. True if it went. */
export async function copyToClipboard(text: string, within: Node): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* not allowed here: the old way */ }
  const t = document.createElement('textarea')
  t.value = text
  t.setAttribute('aria-hidden', 'true')
  t.style.position = 'fixed'
  t.style.opacity = '0'
  t.style.pointerEvents = 'none'
  within.appendChild(t)
  t.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* nothing more to try */ }
  t.remove()
  return ok
}
