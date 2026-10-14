/* Staying up to date: an installed Inspeck turns its own auto-update on once,
 * and a newer Inspeck takes the port from an older one. Run against the built
 * server, started over stdio as Claude Code starts it. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

/** Start the built server as Claude would, with these settings folders. */
async function start({ port, home, config, pluginRoot }) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-update-'))
  copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
  const client = new Client({ name: 'test-claude', version: '0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(dir, 'inspeck.mjs')],
    cwd: dir,
    env: { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(port), CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: pluginRoot },
    stderr: 'ignore',
  }))
  return { client, instructions: client.getInstructions() ?? '', stop: async () => { await client.close(); rmSync(dir, { recursive: true, force: true }) } }
}

const health = port => new Promise(resolve => {
  http.get({ host: '127.0.0.1', port, path: '/health' }, res => {
    let b = ''
    res.on('data', c => (b += c))
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve(null) } })
  }).on('error', () => resolve(null))
})
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)) } return null }

const INSTALLED = '/x/.claude/plugins/cache/inspeck/inspeck/0.0.0'
const SAYS = /turned on auto-update for itself/

test('an installed Inspeck turns its own auto-update on, once, and says so once', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-au-'))
  const config = join(tmp, 'claude'), home = join(tmp, 'home')
  mkdirSync(config)
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ theme: 'dark' }))
  const port = 49900 + Math.floor(Math.random() * 90)
  const a = await start({ port, home, config, pluginRoot: INSTALLED })
  assert.match(a.instructions, SAYS)
  const settings = JSON.parse(readFileSync(join(config, 'settings.json'), 'utf8'))
  assert.equal(settings.theme, 'dark', 'the rest of the settings are kept')
  assert.deepEqual(settings.extraKnownMarketplaces.inspeck, { source: { source: 'github', repo: 'pulkitmittal19/inspeck-claude' }, autoUpdate: true })
  await a.stop()

  /* Turned off afterwards: it stays off, and nothing is said again. */
  settings.extraKnownMarketplaces.inspeck.autoUpdate = false
  writeFileSync(join(config, 'settings.json'), JSON.stringify(settings))
  const b = await start({ port, home, config, pluginRoot: INSTALLED })
  assert.doesNotMatch(b.instructions, SAYS)
  assert.equal(JSON.parse(readFileSync(join(config, 'settings.json'), 'utf8')).extraKnownMarketplaces.inspeck.autoUpdate, false)
  await b.stop()
  rmSync(tmp, { recursive: true, force: true })
})

test('auto-update is left alone when it was set in /plugin, for a local marketplace, or for a copy run from a checkout', async () => {
  for (const [name, setup, pluginRoot] of [
    ['switched off in /plugin', c => { mkdirSync(join(c, 'plugins')); writeFileSync(join(c, 'plugins', 'known_marketplaces.json'), JSON.stringify({ inspeck: { source: { source: 'github', repo: 'pulkitmittal19/inspeck-claude' }, autoUpdate: false } })) }, INSTALLED],
    ['a local folder marketplace', c => writeFileSync(join(c, 'settings.json'), JSON.stringify({ extraKnownMarketplaces: { inspeck: { source: { source: 'directory', path: '/src/inspeck' } } } })), INSTALLED],
    ['run from a checkout', () => {}, ''],
  ]) {
    const tmp = mkdtempSync(join(tmpdir(), 'inspeck-au-'))
    const config = join(tmp, 'claude')
    mkdirSync(config)
    setup(config)
    const before = existsSync(join(config, 'settings.json')) ? readFileSync(join(config, 'settings.json'), 'utf8') : null
    const s = await start({ port: 49800 + Math.floor(Math.random() * 90), home: join(tmp, 'home'), config, pluginRoot })
    assert.doesNotMatch(s.instructions, SAYS, name)
    const after = existsSync(join(config, 'settings.json')) ? readFileSync(join(config, 'settings.json'), 'utf8') : null
    assert.equal(after, before, `${name}: settings untouched`)
    await s.stop()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('a newer Inspeck takes the port from an older one; the older takes it back if the newer goes', async () => {
  const port = 49700 + Math.floor(Math.random() * 90)
  /* The older Inspeck: answers /health with an old version, and steps aside when asked. */
  let asked = 0
  const old = http.createServer((req, res) => {
    if (req.url === '/health') return res.end(JSON.stringify({ ok: true, name: 'inspeck', version: '0.1.0' }))
    if (req.url === '/handover' && req.method === 'POST') { asked++; res.end('{}'); old.close(); return }
    res.statusCode = 404; res.end()
  })
  await new Promise(r => old.listen(port, '127.0.0.1', r))
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-ho-'))
  const s = await start({ port, home: join(tmp, 'home'), config: join(tmp, 'claude'), pluginRoot: '' })
  const h = await until(async () => { const v = await health(port); return v?.version === VERSION ? v : null })
  assert.ok(h, `the newer Inspeck (${VERSION}) answers the port`)
  assert.equal(asked, 1)

  /* The real one, asked by something claiming to be older, or by a page, keeps the port. */
  const ask = (headers) => new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: '/handover', method: 'POST', headers }, res => resolve(res.statusCode))
    req.end()
  })
  assert.equal(await ask({ 'x-inspeck-version': '0.0.1' }), 409)
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0', origin: 'http://localhost:5173' }), 409, 'a page can never ask')
  assert.equal((await health(port))?.version, VERSION)

  /* Asked by a newer one, it steps aside; with nobody else there, it takes the port back. */
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0' }), 200)
  assert.ok(await until(async () => (await health(port)) === null, 3000), 'the port is free for the newer one')
  assert.ok(await until(async () => (await health(port))?.version === VERSION, 9000), 'and taken back when no one took it')
  await s.stop()
  rmSync(tmp, { recursive: true, force: true })
})

test('a project on an inspeck npm package from before 0.11 is offered the update once, in its own package manager', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-old-'))
  const home = join(tmp, 'home'), project = join(tmp, 'repo')
  /* A monorepo: the app with the package is in apps/admin, the chat opens at the root. */
  mkdirSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck'), { recursive: true })
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'repo', private: true }))
  writeFileSync(join(project, 'pnpm-lock.yaml'), '')
  writeFileSync(join(project, 'apps', 'admin', 'package.json'), JSON.stringify({ devDependencies: { inspeck: '^0.10.2' } }))
  writeFileSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck', 'package.json'), JSON.stringify({ name: 'inspeck', version: '0.10.2' }))
  const open = async () => {
    const dir = mkdtempSync(join(tmpdir(), 'inspeck-srv-'))
    copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
    const client = new Client({ name: 'test-claude', version: '0' })
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: [join(dir, 'inspeck.mjs')], cwd: project,
      env: { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(49600 + Math.floor(Math.random() * 90)), CLAUDE_PLUGIN_ROOT: '' }, stderr: 'ignore',
    }))
    const said = client.getInstructions() ?? ''
    await client.close()
    return said
  }
  const first = await open()
  assert.match(first, /Inspeck dev plugin \(the inspeck npm package in .*apps\/admin\) is 0\.10\.2, older than 0\.11\.0/)
  assert.match(first, /`pnpm add -D inspeck@latest`/, "the project's own package manager")
  assert.doesNotMatch(await open(), /Inspeck dev plugin/, 'offered once')

  /* Up to date: nothing to offer. */
  rmSync(home, { recursive: true, force: true })
  writeFileSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck', 'package.json'), JSON.stringify({ name: 'inspeck', version: '0.11.0' }))
  assert.doesNotMatch(await open(), /Inspeck dev plugin/)
  rmSync(tmp, { recursive: true, force: true })
})
