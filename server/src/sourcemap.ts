/* Where in the source a line of compiled server code came from.
 *
 * A server component (Next.js, Remix and the like) records where its JSX ran
 * as a place in a compiled chunk on disk: `file:///…/.next/server/chunks/x.js`,
 * line 128. The page can't read that file; this server, on the same machine,
 * can. It follows the chunk's source map (a sibling `.map`, or inline) back to
 * the file as written, `app/page.tsx` line 22.
 *
 * Handles plain maps and index maps with `sections` (Turbopack writes those).
 * Anything that can't be mapped is returned as it came.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SourceAt } from './format.js'

interface RawMap {
  sources?: string[]
  sourceRoot?: string
  mappings?: string
  sections?: Array<{ offset: { line: number; column: number }; map: RawMap }>
}

const B64 = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))

/** The segments of one generated line: [genColumn, source, origLine, origColumn]. */
function lineSegments(mappings: string, line: number): Array<[number, number, number, number]> {
  let src = 0, oLine = 0, oCol = 0
  const lines = mappings.split(';')
  for (let l = 0; l < lines.length && l <= line; l++) {
    const segs: Array<[number, number, number, number]> = []
    let gCol = 0
    for (const seg of lines[l].split(',')) {
      if (!seg) continue
      const v: number[] = []
      let shift = 0, value = 0
      for (const ch of seg) {
        const d = B64.get(ch) ?? 0
        value += (d & 31) << shift
        if (d & 32) { shift += 5; continue }
        v.push(value & 1 ? -(value >> 1) : value >> 1)
        shift = 0; value = 0
      }
      gCol += v[0] ?? 0
      if (v.length >= 4) { src += v[1]; oLine += v[2]; oCol += v[3]; segs.push([gCol, src, oLine, oCol]) }
    }
    if (l === line) return segs
  }
  return []
}

/** A source name from a map, as a path: `file:///…/app/page.tsx`, `turbopack:///[project]/app/page.tsx`, `webpack:///./app/page.tsx`, or relative. */
function sourcePath(name: string, map: RawMap, mapFile: string): string {
  if (name.startsWith('file://')) return fileURLToPath(name)
  const project = /^(?:turbopack|webpack|webpack-internal):\/\/\/(?:\[project\]\/|\(\w[\w-]*\)\/)?\.?\/?(.*)$/.exec(name)
  if (project) return project[1].replace(/\s*\[[^\]]*\]\s*\(.*\)$/, '')
  if (isAbsolute(name)) return name
  return resolvePath(dirname(mapFile), map.sourceRoot ?? '', name)
}

function readMap(chunk: string): { map: RawMap; file: string } | null {
  const code = readFileSync(chunk, 'utf8')
  let ref: string | null = null
  for (const m of code.matchAll(/\/[/*][#@]\s*sourceMappingURL=([^\s*]+)/g)) ref = m[1]
  if (ref?.startsWith('data:')) {
    return { map: JSON.parse(Buffer.from(ref.slice(ref.indexOf(',') + 1), 'base64').toString('utf8')), file: chunk }
  }
  const file = ref ? join(dirname(chunk), decodeURIComponent(ref)) : `${chunk}.map`
  return existsSync(file) ? { map: JSON.parse(readFileSync(file, 'utf8')), file } : null
}

/** One place: mapped to the source if it points into a compiled file on this machine, else as it came. */
export function resolveSource(at: SourceAt): SourceAt {
  try {
    const chunk = at.file.startsWith('file://') ? fileURLToPath(at.file.split('?')[0]) : at.file
    if (!isAbsolute(chunk) || !/\.(c|m)?js$/.test(chunk) || !existsSync(chunk) || !statSync(chunk).isFile() || !at.line) {
      return at.file.startsWith('file://') ? { ...at, file: chunk } : at
    }
    const read = readMap(chunk)
    if (!read) return { ...at, file: chunk }
    let { map } = read
    let line = at.line - 1, column = (at.column ?? 1) - 1
    if (map.sections) {
      /* An index map: the section that starts at or before this line and column. */
      const sec = [...map.sections].reverse().find(s => s.offset.line < line || (s.offset.line === line && s.offset.column <= column))
      if (!sec) return { ...at, file: chunk }
      if (line === sec.offset.line) column -= sec.offset.column
      line -= sec.offset.line
      map = sec.map
    }
    const segs = lineSegments(map.mappings ?? '', line)
    if (!segs.length) return { ...at, file: chunk }
    let best = segs[0]
    for (const s of segs) { if (s[0] <= column) best = s; else break }
    const name = map.sources?.[best[1]]
    if (!name) return { ...at, file: chunk }
    return { file: sourcePath(name, map, read.file), line: best[2] + 1, column: best[3] + 1 }
  } catch {
    return at
  }
}
