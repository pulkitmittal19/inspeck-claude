/* Where in the code an element is written, so Claude opens the right file at
 * the right line instead of searching for it.
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

export interface SourceAt { file: string; line: number; column?: number }

const MAX_OWNERS = 2
const TIMEOUT_MS = 1200

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

/* ---------- source maps ---------- */

interface Mapped { sources: string[]; lines: Array<Array<[number, number, number, number]>> }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VALUE = new Map([...B64].map((c, i) => [c, i]))

/** Decode `mappings` into, per generated line, [genColumn, source, origLine, origColumn] segments. */
function decode(mappings: string): Mapped['lines'] {
  const lines: Mapped['lines'] = []
  let src = 0, oLine = 0, oCol = 0
  for (const lineStr of mappings.split(';')) {
    const segs: Array<[number, number, number, number]> = []
    let gCol = 0
    for (const seg of lineStr.split(',')) {
      if (!seg) continue
      const v: number[] = []
      let shift = 0, value = 0
      for (const ch of seg) {
        const d = B64_VALUE.get(ch) ?? 0
        value += (d & 31) << shift
        if (d & 32) { shift += 5; continue }
        v.push(value & 1 ? -(value >> 1) : value >> 1)
        shift = 0; value = 0
      }
      gCol += v[0] ?? 0
      if (v.length >= 4) { src += v[1]; oLine += v[2]; oCol += v[3]; segs.push([gCol, src, oLine, oCol]) }
    }
    lines.push(segs)
  }
  return lines
}

const maps = new Map<string, Promise<Mapped | null>>()

function mapFor(url: string): Promise<Mapped | null> {
  let p = maps.get(url)
  if (!p) {
    p = (async () => {
      const code = await (await fetch(url, { credentials: 'same-origin' })).text()
      const ref = /\/[/*][#@]\s*sourceMappingURL=([^\s*]+)/g
      let last: string | null = null
      for (const m of code.matchAll(ref)) last = m[1]
      if (!last) return null
      const json = last.startsWith('data:')
        ? JSON.parse(decodeURIComponent(escape(atob(last.slice(last.indexOf(',') + 1)))))
        : await (await fetch(new URL(last, url), { credentials: 'same-origin' })).json()
      const root = json.sourceRoot ? new URL(json.sourceRoot, url).href : url
      return {
        sources: (json.sources as string[]).map(s => /^\/|^[a-z]+:/.test(s) ? s : new URL(s, root).href),
        lines: decode(json.mappings as string),
      }
    })().catch(() => null)
    maps.set(url, p)
  }
  return p
}

/** A file as a person reads it: a path in the project, not a dev-server URL. */
function tidy(file: string): string {
  try {
    const u = new URL(file)
    if (u.origin === location.origin || u.protocol === 'webpack-internal:') file = decodeURIComponent(u.pathname)
    else if (u.protocol === 'file:') file = decodeURIComponent(u.pathname)
  } catch { /* already a path */ }
  return file.replace(/^\/@fs\//, '/').replace(/^\(app-pages-browser\)\/\.?\/?/, '').replace(/\?.*$/, '')
}

async function resolve(url: string, line: number, column: number): Promise<SourceAt> {
  const map = await mapFor(url)
  const segs = map?.lines[line - 1]
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

/** The element's place in the code, then the components that rendered it, nearest first. */
export async function sourceOf(el: Element): Promise<SourceAt[]> {
  const work = (async () => {
    const out: SourceAt[] = []
    let f: Fiber | null | undefined = fiberOf(el)
    for (let i = 0; f && i <= MAX_OWNERS; i++, f = f._debugOwner) {
      const at = await locate(f)
      if (at && !/node_modules/.test(at.file) && !out.some(o => o.file === at.file && o.line === at.line)) out.push(at)
    }
    return out
  })().catch(() => [])
  return Promise.race([work, new Promise<SourceAt[]>(r => setTimeout(() => r([]), TIMEOUT_MS))])
}
