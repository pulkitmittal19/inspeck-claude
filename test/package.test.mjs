/* The npm package `inspeck`: its Vite plugin, as published (the built files,
 * both module formats), and what npm would put in the tarball. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'inspeck')
const esm = (await import(pathToFileURL(join(pkg, 'dist/vite.js')).href)).default
const cjs = createRequire(import.meta.url)(join(pkg, 'dist/vite.cjs')).default

test('the Vite plugin adds the widget tag while serving, and only then, through the dev server itself', () => {
  for (const inspeck of [esm, cjs]) {
    const p = inspeck()
    assert.equal(p.name, 'inspeck')
    assert.equal(p.apply, 'serve', 'never part of a build')
    assert.deepEqual(p.transformIndexHtml(), [
      { tag: 'script', attrs: { src: '/__inspeck/inspeck.js', async: true }, injectTo: 'body' },
    ])
    assert.equal(p.config().server.proxy['/__inspeck'].target, 'http://127.0.0.1:4848')
  }
})

test('a port can be set, by option or by INSPECK_PORT, and the tag turned off', () => {
  const target = p => p.config().server.proxy['/__inspeck']?.target
  assert.equal(target(esm({ port: 5050 })), 'http://127.0.0.1:5050')
  process.env.INSPECK_PORT = '4999'
  try {
    assert.equal(target(esm()), 'http://127.0.0.1:4999')
    assert.equal(target(esm({ port: 4848 })), 'http://127.0.0.1:4848', 'the option wins')
  } finally { delete process.env.INSPECK_PORT }
  const off = esm({ enabled: false })
  assert.deepEqual(off.transformIndexHtml(), [])
  assert.deepEqual(off.config().server.proxy, {})
})

test('the tarball carries the Vite plugin, its types, the init command, the README and the license, and nothing else', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkg, encoding: 'utf8' }))
  const files = packed.files.map(f => f.path).sort()
  assert.deepEqual(files, ['LICENSE', 'README.md', 'dist/bin.js', 'dist/cli.js', 'dist/vite.cjs', 'dist/vite.js', 'package.json', 'vite.d.ts'])
  assert.equal(packed.name, 'inspeck')
})

test('inspeck() type-checks in a TypeScript vite.config, against Vite\'s own types (a project\'s `tsc -b` before its build)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-types-'))
  writeFileSync(join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport inspeck from ${JSON.stringify(join(pkg, 'vite.js'))}\n\nexport default defineConfig({\n  plugins: [inspeck(), inspeck({ port: 4900, enabled: false })],\n})\n`)
  const tsc = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsc')
  const vite = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'vite')
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'esnext', moduleResolution: 'bundler', target: 'es2022', skipLibCheck: true, types: [], paths: { vite: [vite] } }, files: ['vite.config.ts'] }))
  try { execFileSync(tsc, ['-p', dir], { encoding: 'utf8' }) } catch (e) { assert.fail(`vite.config.ts doesn't type-check:\n${e.stdout}`) }
})

test('with Inspeck away the real Vite stays quiet: no error in the terminal, an empty script for the tag, a bare 503 for the rest; with it back, calls pass on', async () => {
  const { createServer, createLogger } = await import('vite')
  const root = mkdtempSync(join(tmpdir(), 'inspeck-vite-'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><body><h1>app</h1></body></html>')
  const port = 48900 + Math.floor(Math.random() * 90), at = port + 100
  const errors = []
  const customLogger = createLogger('silent')
  customLogger.error = m => errors.push(m)
  const vite = await createServer({ configFile: false, root, plugins: [esm({ port })], customLogger, server: { port: at, strictPort: true, host: '127.0.0.1' } })
  await vite.listen()
  try {
    const get = path => fetch(`http://127.0.0.1:${at}${path}`)
    const script = await get('/__inspeck/inspeck.js')
    assert.equal(script.status, 200)
    assert.match(script.headers.get('content-type'), /javascript/)
    assert.equal(script.headers.get('cache-control'), 'no-store', 'the next load must find the real one')
    assert.equal(await script.text(), '')
    assert.equal((await get('/__inspeck/comments?page=x')).status, 503)
    assert.match(await (await get('/')).text(), /<script[^>]+__inspeck\/inspeck\.js/, 'the page itself is unaffected')
    assert.deepEqual(errors, [], 'nothing printed in the developer\'s terminal')
    /* A chat opens: Inspeck answers, and calls go through as ever. */
    const inspeck = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ was: q.url }))).listen(port, '127.0.0.1')
    await new Promise(r => inspeck.once('listening', r))
    assert.deepEqual(await (await get('/__inspeck/comments?page=x')).json(), { was: '/comments?page=x' })
    inspeck.close()
  } finally { await vite.close() }
})
