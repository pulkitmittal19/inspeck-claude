/* Staying up to date: Inspeck looks for a newer version once a day and offers
 * it once, without touching Claude's settings; and a newer Inspeck takes the
 * port from an older one. Run against the built
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
async function start({ port, home, config, pluginRoot, latest = 'off' }) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-update-'))
  copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
  const client = new Client({ name: 'test-claude', version: '0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(dir, 'inspeck.mjs')],
    cwd: dir,
    env: { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(port), CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: pluginRoot, INSPECK_LATEST_URL: latest },
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
const OFFER = /Inspeck 99\.0\.0 is out \(this is /

/** A stand-in for GitHub: answers the latest plugin.json, and counts how often it was asked. */
async function github(version) {
  const seen = { asks: 0 }
  const srv = http.createServer((req, res) => { seen.asks++; res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: 'inspeck', version })) })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${srv.address().port}/plugin.json`, seen, close: () => srv.close() }
}

test('Inspeck never changes Claude\'s own settings, installed or not', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-au-'))
  const config = join(tmp, 'claude')
  mkdirSync(config)
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ theme: 'dark' }))
  const before = readFileSync(join(config, 'settings.json'), 'utf8')
  const s = await start({ port: 49900 + Math.floor(Math.random() * 90), home: join(tmp, 'home'), config, pluginRoot: INSTALLED, latest: 'off' })
  assert.equal(readFileSync(join(config, 'settings.json'), 'utf8'), before)
  assert.ok(!existsSync(join(config, 'plugins')), 'nor its list of marketplaces')
  await s.stop()
  rmSync(tmp, { recursive: true, force: true })
})

test('a newer Inspeck is looked for once a day, offered once in the chat, and shown in Settings', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-up-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude')
  const gh = await github('99.0.0')
  const port = 49900 + Math.floor(Math.random() * 90)
  /* The first chat looks it up (nothing to offer yet: it didn't know). */
  const a = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url })
  assert.doesNotMatch(a.instructions, OFFER)
  assert.ok(await until(async () => existsSync(join(home, 'latest.json'))), 'checked')
  assert.ok(a.instructions.includes('plugin update inspeck@inspeck'), 'Claude knows how to update when asked')
  /* Settings in the page says so. */
  const state = await new Promise(resolve => http.get({ host: '127.0.0.1', port, path: '/update', headers: { origin: 'http://localhost:5173', 'x-inspeck': '1' } }, res => {
    let b = ''; res.on('data', c => (b += c)); res.on('end', () => resolve(JSON.parse(b)))
  }))
  assert.deepEqual(state, { version: VERSION, latest: '99.0.0', checking: true })
  await a.stop()
  /* The next chat offers it, once; and doesn't ask GitHub again the same day. */
  const b = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url })
  assert.match(b.instructions, OFFER)
  assert.match(b.instructions, /don't ask again/)
  await b.stop()
  const c = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url })
  assert.doesNotMatch(c.instructions, OFFER, 'offered once')
  await c.stop()
  assert.equal(gh.seen.asks, 1, 'once a day')
  /* Turned off in Settings: nothing is looked up or offered. */
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ updates: 'off' }))
  writeFileSync(join(home, 'latest.json'), JSON.stringify({ checkedAt: '2020-01-01T00:00:00Z', version: '100.0.0' }))
  const d = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url })
  assert.doesNotMatch(d.instructions, /is out \(this is/)
  await d.stop()
  assert.equal(gh.seen.asks, 1)
  gh.close()
  rmSync(tmp, { recursive: true, force: true })
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

  /* The real one, asked by something claiming to be older, by a page, or by a program without the key, keeps the port. */
  const key = readFileSync(join(tmp, 'home', 'handover-key'), 'utf8')
  const ask = (headers) => new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: '/handover', method: 'POST', headers }, res => resolve(res.statusCode))
    req.end()
  })
  assert.equal(await ask({ 'x-inspeck-version': '0.0.1', 'x-inspeck-key': key }), 409)
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0', 'x-inspeck-key': key, origin: 'http://localhost:5173' }), 409, 'a page can never ask')
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0' }), 409, 'nor a program that can\'t read the key')
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0', 'x-inspeck-key': 'guess' }), 409)
  assert.equal((await health(port))?.version, VERSION)

  /* Asked by a newer one, it steps aside; with nobody else there, it takes the port back. */
  assert.equal(await ask({ 'x-inspeck-version': '999.0.0', 'x-inspeck-key': key }), 200)
  assert.ok(await until(async () => (await health(port)) === null, 3000), 'the port is free for the newer one')
  assert.ok(await until(async () => (await health(port))?.version === VERSION, 9000), 'and taken back when no one took it')
  await s.stop()
  rmSync(tmp, { recursive: true, force: true })
})

test('a project on an inspeck npm package older than the one needed is offered the update once, in its own package manager', async () => {
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
      env: { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(49600 + Math.floor(Math.random() * 90)), CLAUDE_PLUGIN_ROOT: '', INSPECK_LATEST_URL: 'off' }, stderr: 'ignore',
    }))
    const said = client.getInstructions() ?? ''
    await client.close()
    return said
  }
  const first = await open()
  assert.match(first, /Inspeck dev plugin \(the inspeck npm package in .*apps\/admin\) is 0\.10\.2, older than 0\.12\.0/)
  assert.match(first, /`pnpm add -D inspeck@latest`/, "the project's own package manager")
  assert.doesNotMatch(await open(), /Inspeck dev plugin/, 'offered once')

  /* Up to date: nothing to offer. */
  rmSync(home, { recursive: true, force: true })
  writeFileSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck', 'package.json'), JSON.stringify({ name: 'inspeck', version: '0.12.0' }))
  assert.doesNotMatch(await open(), /Inspeck dev plugin/)
  rmSync(tmp, { recursive: true, force: true })
})
