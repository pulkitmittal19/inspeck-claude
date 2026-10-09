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
      const code = await codeOf(url)
      if (!code) return null
      let last: string | null = null
      for (const m of code.matchAll(/\/[/*][#@]\s*sourceMappingURL=([^\s*]+)/g)) last = m[1]
      if (!last) return null
      const json = last.startsWith('data:')
        ? JSON.parse(decodeURIComponent(escape(atob(last.slice(last.indexOf(',') + 1)))))
        : await (await nativeFetch(new URL(last, url), { credentials: 'same-origin' })).json()
      const root = json.sourceRoot ? new URL(json.sourceRoot, url).href : url
      let decoded: ReturnType<Mapped['lines']> | null = null
      return {
        sources: (json.sources as string[]).map(s => /^\/|^[a-z]+:/.test(s) ? s : new URL(s, root).href),
        contents: (json.sourcesContent as Array<string | null> | undefined) ?? [],
        lines: () => (decoded ??= decode(json.mappings as string)),
      }
    })().catch(() => null)
    maps.set(url, p)
  }
  return p
}

/** A file as a person reads it: a path in the project, not a dev-server URL. */
export function tidy(file: string): string {
  try {
    const u = new URL(file)
    if (u.origin === location.origin || u.protocol === 'webpack-internal:') file = decodeURIComponent(u.pathname)
    else if (u.protocol === 'file:') file = decodeURIComponent(u.pathname)
  } catch { /* already a path */ }
  return file.replace(/^\/@fs\//, '/').replace(/^\(app-pages-browser\)\/\.?\/?/, '').replace(/\?.*$/, '')
}
