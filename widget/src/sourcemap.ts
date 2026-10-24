/* Reading the code the dev server sends, and the source map that leads back
 * to the code as written. Shared by the two ways Inspeck finds where an
 * element is written: React's stack (source.ts) and a search by name (defs.ts).
 * Everything is fetched once and kept for the page's lifetime. */
import { nativeFetch } from './native'

export interface Mapped {
  /** The original files, as URLs or paths. */
  sources: string[]
  /** Their text, when the map carries it (Vite's and webpack's dev maps do). */
  contents: Array<string | null>
  /** Per generated line: [genColumn, source, origLine, origColumn] segments, decoded on first use. */
  lines(): Array<Array<[number, number, number, number]>>
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VALUE = new Map([...B64].map((c, i) => [c, i]))

/** Decode `mappings` into, per generated line, [genColumn, source, origLine, origColumn] segments. */
function decode(mappings: string): ReturnType<Mapped['lines']> {
  const lines: ReturnType<Mapped['lines']> = []
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

const codes = new Map<string, Promise<string | null>>()

/** A module's code as the dev server sends it. */
export function codeOf(url: string): Promise<string | null> {
  let p = codes.get(url)
  if (!p) {
    p = nativeFetch(url, { credentials: 'same-origin' }).then(r => r.ok ? r.text() : null).catch(() => null)
    codes.set(url, p)
  }
  return p
}

const maps = new Map<string, Promise<Mapped | null>>()

export function mapFor(url: string): Promise<Mapped | null> {
  let p = maps.get(url)
  if (!p) {
    p = (async () => {
      if (url.startsWith('webpack-internal:')) return evalMap(url)
      const code = await codeOf(url)
      if (!code) return null
      let last: string | null = null
      for (const m of code.matchAll(/\/[/*][#@]\s*sourceMappingURL=([^\s*]+)/g)) last = m[1]
      if (!last) return null
      const json = last.startsWith('data:')
        ? fromBase64(last.slice(last.indexOf(',') + 1))
        : await (await nativeFetch(new URL(last, url), { credentials: 'same-origin' })).json()
      return mapped(json, url)
    })().catch(() => null)
    maps.set(url, p)
  }
  return p
}

const fromBase64 = (b64: string) => JSON.parse(decodeURIComponent(escape(atob(b64))))

function mapped(json: { sources: string[]; sourceRoot?: string; sourcesContent?: Array<string | null>; mappings: string }, url: string): Mapped {
  const root = json.sourceRoot && !url.startsWith('webpack-internal:') ? new URL(json.sourceRoot, url).href : url
  let decoded: ReturnType<Mapped['lines']> | null = null
  return {
    sources: json.sources.map(s => /^\/|^[a-z-]+:/.test(s) || root.startsWith('webpack-internal:') ? s : new URL(s, root).href),
    contents: json.sourcesContent ?? [],
    lines: () => (decoded ??= decode(json.mappings)),
  }
}

/**
 * A module webpack runs through eval (Next.js's Pages Router, and other webpack dev setups): it has no address
 * to fetch, only a name (`webpack-internal:///./pages/index.tsx`). Its map is inline in the eval'd code, right
 * before that name, in one of the page's script files: found there.
 */
async function evalMap(url: string): Promise<Mapped | null> {
  const files = new Set<string>()
  for (const s of Array.from(document.scripts)) if (s.src) files.add(s.src)
  for (const e of performance.getEntriesByType('resource')) if (/\.js(\?|$)/.test(e.name)) files.add(e.name)
  const name = `sourceURL=${url}`
  for (const file of files) {
    let at: URL
    try { at = new URL(file) } catch { continue }
    if (at.origin !== location.origin) continue
    const code = await codeOf(file)
    const i = code?.indexOf(name) ?? -1
    if (!code || i < 0) continue
    const start = code.lastIndexOf('sourceMappingURL=data:', i)
    if (start < 0) return null
    const b64 = /base64,([A-Za-z0-9+/=]+)/.exec(code.slice(start, i))?.[1]
    return b64 ? mapped(fromBase64(b64), url) : null
  }
  return null
}

/** A file as a person reads it: a path in the project, not a dev-server URL. */
export function tidy(file: string): string {
  try {
    const u = new URL(file)
    if (u.origin === location.origin) file = decodeURIComponent(u.pathname)
    /* webpack-internal:///./src/App.js, or (with Next.js's layer) ///(pages-dir-browser)/./pages/x.tsx: a path in the project. */
    else if (u.protocol === 'webpack-internal:') file = decodeURIComponent(u.pathname).replace(/^\/+/, '')
    else if (u.protocol === 'file:') file = decodeURIComponent(u.pathname)
    /* webpack://_N_E/./pages/index.tsx: a path in the project, after webpack's own name for the app. */
    else if (u.protocol === 'webpack:') file = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  } catch { /* already a path */ }
  return file.replace(/^\/@fs\//, '/').replace(/^\/?\((?:app|pages)-(?:pages|dir)-browser\)\/\.?\/?/, '').replace(/^\.\//, '').replace(/\?.*$/, '')
}
