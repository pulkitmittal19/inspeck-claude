/* Where in the code an element is written, so Claude opens the right file at
 * the right line instead of searching for it.
 *
 * In order of precision:
 *  - Dev plugins that stamp it on every element, for any framework:
 *    code-inspector-plugin (`data-insp-path="file:line:col:tag"`),
 *    react-dev-inspector (`data-inspector-relative-path` + `-line`),
 *    vite-plugin-vue-inspector (`data-v-inspector="file:line:col"`).
 *  - Svelte in development: `__svelte_meta.loc` on the element.
 *  - Vue in development: the component's file (`__file`), without a line.
 *  - React, below.
 *
 * React keeps this on the element's fiber in development builds:
 *  - React 18 and older: `_debugSource`, the file and line of the JSX.
 *  - React 19: `_debugStack`, the stack where the JSX ran. Its top frame in
 *    app code is the line, but in the code the dev server sends (transformed),
 *    so it's mapped back through that module's source map.
 *
 * Besides the element itself, the components that rendered it are followed up
 * a step or two (the `<Button>` in SaveBar.tsx, when the element is written
 * inside Button.tsx), skipping anything in node_modules.
 *
 * Nothing here is needed for the widget to work: no React, no dev build, no
 * source map, and it simply returns nothing.
 */

import { mapFor, tidy } from './sourcemap'
import { findDefinitions, lineIn } from './defs'

export interface SourceAt { file: string; line: number; column?: number }

const MAX_OWNERS = 2
/** The longest a lookup runs. It starts when a note is opened, so it's usually done before Enter. */
const TIMEOUT_MS = 6000

type Fiber = {
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number }
  _debugStack?: { stack?: string }
  _debugOwner?: Fiber | null
  return?: Fiber | null
  type?: unknown
}

function fiberOf(el: Element): Fiber | null {
  for (const k of Object.keys(el)) {
    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return (el as unknown as Record<string, Fiber>)[k]
  }
  return null
}

const LIBRARY = /\/node_modules\/|\/\.vite\/deps\/|\/_next\/static\/chunks\/(?:framework|main|webpack)|react-dom|react_jsx/

/** The first app frame of a stack: url, line, column (1-based, as stacks print them). */
function appFrame(stack: string): { url: string; line: number; column: number } | null {
  for (const raw of stack.split('\n').slice(1)) {
    const m = /\(?((?:https?|webpack-internal|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(raw)
    if (!m || LIBRARY.test(m[1])) continue
    return { url: m[1], line: +m[2], column: +m[3] }
  }
  return null
}

async function resolve(url: string, line: number, column: number): Promise<SourceAt> {
  const map = await mapFor(url)
  const segs = map?.lines()[line - 1]
  if (map && segs?.length) {
    let best = segs[0]
    for (const s of segs) { if (s[0] <= column - 1) best = s; else break }
    return { file: tidy(map.sources[best[1]] ?? url), line: best[2] + 1, column: best[3] + 1 }
  }
  /* No map: the dev server's own lines are close, but say only the file. */
  return { file: tidy(url), line: 0 }
}

async function locate(f: Fiber): Promise<SourceAt | null> {
  if (f._debugSource) {
    const s = f._debugSource
    return { file: tidy(s.fileName), line: s.lineNumber, ...(s.columnNumber ? { column: s.columnNumber } : {}) }
  }
  const frame = f._debugStack?.stack ? appFrame(f._debugStack.stack) : null
  return frame ? resolve(frame.url, frame.line, frame.column) : null
}

/** `file:line:col` (any trailing parts ignored), as the dev plugins write it. */
function parseAt(v: string): SourceAt | null {
  const m = /^(.+?):(\d+)(?::(\d+))?(?::[^:]*)?$/.exec(v.trim())
  return m ? { file: tidy(m[1]), line: +m[2], ...(m[3] ? { column: +m[3] } : {}) } : null
}

/** What dev plugins stamped on the element, or on the nearest element that has it. */
function stamped(el: Element): SourceAt[] {
  const out: SourceAt[] = []
  const add = (s: SourceAt | null) => { if (s && !out.some(o => o.file === s.file && o.line === s.line)) out.push(s) }
  for (let n: Element | null = el; n && out.length < 1 + MAX_OWNERS; n = n.parentElement) {
    const insp = n.getAttribute('data-insp-path') ?? n.getAttribute('data-v-inspector')
    if (insp) add(parseAt(insp))
    const rel = n.getAttribute('data-inspector-relative-path')
    if (rel) add({ file: rel, line: Number(n.getAttribute('data-inspector-line')) || 0, ...(n.getAttribute('data-inspector-column') ? { column: Number(n.getAttribute('data-inspector-column')) } : {}) })
  }
  /* The element's own line first, then where the elements around it are
     written: usually the component it sits in, which is what "used in" means. */
  return out
}

function svelteOf(el: Element): SourceAt[] {
  type Meta = { loc?: { file?: string; line?: number; column?: number; char?: number } }
  for (let n: Element | null = el; n; n = n.parentElement) {
    const loc = (n as unknown as { __svelte_meta?: Meta }).__svelte_meta?.loc
    if (loc?.file) {
      /* Svelte 4 counts lines from 0 (its loc also has `char`); Svelte 5 from 1. */
      const line = (loc.line ?? 0) + ('char' in loc ? 1 : 0)
      return [{ file: tidy(loc.file), line, ...(loc.column != null ? { column: loc.column + 1 } : {}) }]
    }
  }
  return []
}

function vueOf(el: Element): SourceAt[] {
  type Inst = { type?: { __file?: string }; parent?: Inst | null }
  const out: SourceAt[] = []
  let c: Inst | null | undefined = (el as unknown as { __vueParentComponent?: Inst }).__vueParentComponent
  for (let i = 0; c && i <= MAX_OWNERS; i++, c = c.parent) {
    const file = c.type?.__file
    if (file && !/node_modules/.test(file) && !out.some(o => o.file === tidy(file))) out.push({ file: tidy(file), line: 0 })
  }
  if (!out.length) {
    const v2 = (el as unknown as { __vue__?: { $options?: { __file?: string } } }).__vue__?.$options?.__file
    if (v2) out.push({ file: tidy(v2), line: 0 })
  }
  return out
}

/* ---------- React, by component name, when React kept no location ---------- */

function nameOfType(t: unknown): string | null {
  if (!t || typeof t !== 'object' && typeof t !== 'function') return null
  const o = t as { displayName?: string; name?: string; type?: { displayName?: string; name?: string }; render?: { displayName?: string; name?: string } }
  const n = o.displayName || o.name || o.type?.displayName || o.type?.name || o.render?.displayName || o.render?.name
  return n && /^[A-Z]/.test(n) ? n : null
}

/** Words the element's own JSX line is likely to contain: its classes, id, label, short text. */
function hintsFor(el: Element): string[] {
  const out = Array.from(el.classList).filter(c => c.length >= 3).slice(0, 6)
  if (el.id) out.push(el.id)
  const label = el.getAttribute('aria-label')
  if (label) out.push(label)
  const text = !el.childElementCount ? (el.textContent ?? '').trim() : ''
  if (text && text.length <= 30) out.push(text)
  return out
}

/**
 * The element's line inside the component that rendered it, then where each
 * component above is placed: `<span className="truncate">` in ConvoTag, then
 * `<ConvoTag` in ThreadTagRow.
 */
async function byName(el: Element, f: Fiber, until: number): Promise<SourceAt[]> {
  const owners: string[] = []
  for (let o = f._debugOwner; o && owners.length <= MAX_OWNERS; o = o._debugOwner) {
    const n = nameOfType(o.type)
    if (n && !owners.includes(n)) owners.push(n)
  }
  if (!owners.length) return []
  const defs = await findDefinitions(owners, until)
  const out: SourceAt[] = []
  const own = defs.get(owners[0])
  if (own) {
    const tag = `<${el.tagName.toLowerCase()}`
    const hints = hintsFor(el)
    out.push({ file: own.file, line: lineIn(own, [tag], hints) ?? lineIn(own, [], hints) ?? own.line })
  }
  for (let k = 1; k < owners.length; k++) {
    const d = defs.get(owners[k])
    if (d) out.push({ file: d.file, line: lineIn(d, [`<${owners[k - 1]}`]) ?? d.line })
  }
  return out.filter(o => !/node_modules/.test(o.file))
}

const lookups = new WeakMap<Element, Promise<SourceAt[]>>()

/**
 * The element's place in the code, then the components that rendered it,
 * nearest first. Started once per element and remembered, so opening a note
 * can start it and sending can pick up the answer.
 */
export function sourceOf(el: Element): Promise<SourceAt[]> {
  let p = lookups.get(el)
  if (!p) {
    p = lookup(el)
    lookups.set(el, p)
  }
  return p
}

async function lookup(el: Element): Promise<SourceAt[]> {
  const direct = stamped(el)
  if (direct.length) return direct
  const svelte = svelteOf(el)
  if (svelte.length) return svelte
  const until = Date.now() + TIMEOUT_MS
  const work = (async () => {
    const fiber = fiberOf(el)
    const out: SourceAt[] = []
    let f: Fiber | null | undefined = fiber
    for (let i = 0; f && i <= MAX_OWNERS; i++, f = f._debugOwner) {
      const at = await locate(f)
      if (at && !/node_modules/.test(at.file) && !out.some(o => o.file === at.file && o.line === at.line)) out.push(at)
    }
    if (!out.length && fiber) out.push(...await byName(el, fiber, until))
    return out.length ? out : vueOf(el)
  })().catch(() => [])
  return Promise.race([work, new Promise<SourceAt[]>(r => setTimeout(() => r([]), TIMEOUT_MS + 200))])
}
