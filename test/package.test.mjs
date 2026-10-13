/* The npm package `inspeck`: its Vite plugin, as published (the built files,
 * both module formats), and what npm would put in the tarball. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
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
