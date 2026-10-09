/* Server components: the page sends a place in a compiled server chunk on disk,
 * and the Inspeck server maps it back to the source through the chunk's map. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let resolveSource

before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'inspeck-sm-')), 'sm.mjs')
  await build({ entryPoints: [join(root, 'server/src/sourcemap.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
  ;({ resolveSource } = await import(pathToFileURL(out).href))
})

/* One VLQ segment set per generated line: [genCol, source, origLine, origCol] as deltas. */
const vlq = n => { let v = n < 0 ? (-n << 1) | 1 : n << 1, s = ''; do { let d = v & 31; v >>>= 5; if (v) d |= 32; s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[d] } while (v); return s }

test('a Turbopack-style index map (sections) leads back to the file and line', () => {
  const app = mkdtempSync(join(tmpdir(), 'inspeck-next-'))
  const chunkDir = join(app, '.next/dev/server/chunks/ssr')
  mkdirSync(chunkDir, { recursive: true })
  const chunk = join(chunkDir, '[root-of-the-server]__abc._.js')
  writeFileSync(chunk, '/* compiled */\n'.repeat(130) + '//# sourceMappingURL=%5Broot-of-the-server%5D__abc._.js.map\n')
  /* Section 2 starts at generated line 100; its generated line 28 (= chunk line 129, 1-based) col 270 maps to page.tsx line 42 col 11. */
  const lines = Array(28).fill('')
  lines.push(vlq(270) + vlq(0) + vlq(41) + vlq(10))
  writeFileSync(`${chunk}.map`, JSON.stringify({ version: 3, sections: [
    { offset: { line: 0, column: 0 }, map: { version: 3, sources: [pathToFileURL(join(app, 'app/favicon.ico.mjs')).href], mappings: 'AAAA' } },
    { offset: { line: 100, column: 0 }, map: { version: 3, sources: [pathToFileURL(join(app, 'app/page.tsx')).href], mappings: lines.join(';') } },
  ] }))
  const r = resolveSource({ file: `${pathToFileURL(chunk).href}?13`, line: 129, column: 276 })
  assert.deepEqual(r, { file: join(app, 'app/page.tsx'), line: 42, column: 11 })
})

test('turbopack:/// and webpack:/// source names come out as project paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-sm2-'))
  const chunk = join(dir, 'page.js')
  writeFileSync(chunk, 'x\n//# sourceMappingURL=page.js.map\n')
  writeFileSync(`${chunk}.map`, JSON.stringify({ version: 3, sources: ['turbopack:///[project]/app/settings/page.tsx'], mappings: vlq(0) + vlq(0) + vlq(6) + vlq(2) }))
  assert.deepEqual(resolveSource({ file: chunk, line: 1, column: 1 }), { file: 'app/settings/page.tsx', line: 7, column: 3 })
})

test('anything that isn\'t a compiled file on this machine comes back as it was', () => {
  assert.deepEqual(resolveSource({ file: '/src/app/Row.tsx', line: 171 }), { file: '/src/app/Row.tsx', line: 171 })
  assert.deepEqual(resolveSource({ file: 'file:///no/such/chunk.js', line: 3, column: 1 }), { file: '/no/such/chunk.js', line: 3, column: 1 })
})
