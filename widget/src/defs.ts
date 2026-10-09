/* Finding a component in the app's code by its name.
 *
 * React 19 records where each element was written only until it has created
 * about ten thousand of them in a burst; after that every element gets the
 * same placeholder. A long list blows through that on load, so on a big page
 * most elements have no location at all. Their component names survive,
 * though, and the dev server hands out every module with a source map that
 * carries the code as written. So: start from the modules the page loaded,
 * follow their imports, and look for `function ConvoTag` / `const ConvoTag =`
 * in the original text.
 *
 * Only the app's own modules are read (not node_modules), each once, a few at
 * a time, and the search stops as soon as every name is found.
 */
import { codeOf, mapFor, tidy } from './sourcemap'

export interface Definition {
  /** The file as written, e.g. /src/app/features/conversations/convo-tag.jsx */
  file: string
  /** 1-based line of the definition. */
  line: number
  /** The file's lines, to look inside the component. */
  lines: string[]
}

const MAX_MODULES = 1500
const PARALLEL = 8
const LIBRARY = /\/node_modules\/|\/\.vite\/deps\/|\/@vite\/|\/@react-refresh|\/@id\/|__vite|\.css(\?|$)/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const definitionOf = (name: string) =>
  new RegExp(`(?:^|[\\s;(,])(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+${escape(name)}\\b`, 'm')

const found = new Map<string, Definition | null>()
const visited = new Set<string>()
const queue: string[] = []

function isApp(url: string): boolean {
  try {
    const u = new URL(url, location.href)
    return u.origin === location.origin && !LIBRARY.test(u.pathname + u.search)
  } catch { return false }
}

function seed(): void {
  const urls = [
    ...performance.getEntriesByType('resource').map(e => e.name),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map(s => s.src),
  ]
  for (const u of urls) if (isApp(u) && !visited.has(u)) queue.push(u)
}

/** Imports in the code the dev server sends: always absolute paths or full URLs there. */
function importsIn(code: string, from: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
    try {
      const u = new URL(m[1], from).href
      if (isApp(u)) out.push(u)
    } catch { /* not a URL */ }
  }
  return out
}

/** Where `name` is defined, as written: in the module's source map when it has one, else in the served code. */
async function definedIn(url: string, code: string, name: string): Promise<Definition | null> {
  const re = definitionOf(name)
  if (!re.test(code)) return null
  const map = await mapFor(url)
  if (map) {
    for (let i = 0; i < map.sources.length; i++) {
      const text = map.contents[i]
      if (!text || /node_modules/.test(map.sources[i])) continue
      const m = re.exec(text)
      if (m) {
        const lines = text.split('\n')
        return { file: tidy(map.sources[i]), line: text.slice(0, m.index + m[0].length).split('\n').length, lines }
      }
    }
  }
  const m = re.exec(code)!
  return { file: tidy(url), line: code.slice(0, m.index + m[0].length).split('\n').length, lines: code.split('\n') }
}

/** Find where each of these components is defined. Names never found come back as null. */
export async function findDefinitions(names: string[], until: number): Promise<Map<string, Definition | null>> {
  const want = () => names.filter(n => !found.has(n))
  if (want().length) {
    if (!visited.size) seed()
    /* Modules already read are searched again first: cheap, and where most answers are. */
    for (const url of visited) {
      const code = await codeOf(url)
      if (!code) continue
      for (const n of want()) { const d = await definedIn(url, code, n); if (d) found.set(n, d) }
      if (!want().length) break
    }
    while (want().length && queue.length && visited.size < MAX_MODULES && Date.now() < until) {
      const batch = queue.splice(0, PARALLEL).filter(u => !visited.has(u))
      batch.forEach(u => visited.add(u))
      await Promise.all(batch.map(async url => {
        const code = await codeOf(url)
        if (!code) return
        for (const n of want()) { const d = await definedIn(url, code, n); if (d) found.set(n, d) }
        for (const next of importsIn(code, url)) if (!visited.has(next)) queue.push(next)
      }))
    }
    /* Everything reachable was read: what's still missing isn't in the app's code. */
    if (!queue.length) for (const n of want()) found.set(n, null)
  }
  return new Map(names.map(n => [n, found.get(n) ?? null]))
}

/**
 * The line inside a component where something is written: the first line from
 * its definition on that has all of `need` and, if possible, one of `prefer`.
 */
export function lineIn(def: Definition, need: string[], prefer: string[] = [], span = 600): number | null {
  const end = Math.min(def.lines.length, def.line - 1 + span)
  let fallback: number | null = null
  for (let i = def.line - 1; i < end; i++) {
    const l = def.lines[i]
    if (!need.every(n => l.includes(n))) continue
    if (!prefer.length || prefer.some(p => l.includes(p))) return i + 1
    fallback ??= i + 1
  }
  return fallback
}
