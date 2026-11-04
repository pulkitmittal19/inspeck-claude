/* Staying up to date: Inspeck looks for a newer version twice a week, when a chat starts and while it keeps
 * running, and installs it, with a stand-in `claude` that only records what it's asked; a newer installed
 * version starts in the background to answer pages; it never touches Claude's settings; and a newer Inspeck
 * takes the port from an older one. Run against the built server, started over stdio as Claude Code starts it,
 * with DISABLE_AUTOUPDATER=1 as the Claude desktop app sets it for everything it starts. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

/** Start the built server as Claude would, with these settings folders. */
async function start({ port, home, config, pluginRoot, latest = 'off', claude = '', env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-update-'))
  copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
  const client = new Client({ name: 'test-claude', version: '0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(dir, 'inspeck.mjs')],
    cwd: dir,
    env: { ...process.env, DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '', INSPECK_AUTO_UPDATE: '', INSPECK_HOME: home, INSPECK_PORT: String(port), CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: pluginRoot, INSPECK_LATEST_URL: latest, INSPECK_CLAUDE_BIN: claude || join(tmpdir(), 'no-claude-here'), ...env },
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
const readJsonFile = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)) } return null }

const INSTALLED = '/x/.claude/plugins/cache/inspeck/inspeck/0.0.0'

/** A stand-in for GitHub: answers the latest plugin.json (its version can change: `seen.version`), and counts how often it was asked. */
async function github(version) {
  const seen = { asks: 0, version }
  const srv = http.createServer((req, res) => { seen.asks++; res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: 'inspeck', version: seen.version })) })
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

/** A stand-in `claude` that writes down each command it's given. */
function fakeClaude(dir) {
  const log = join(dir, 'claude-calls.log'), bin = join(dir, 'bin', 'claude')
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeFileSync(bin, `#!/bin/sh\necho "$*" >> "${log}"\n`)
  chmodSync(bin, 0o755)
  return { bin, calls: () => { try { return readFileSync(log, 'utf8').trim().split('\n') } catch { return [] } } }
}
/** Claude's plugins folder, with Inspeck's marketplace as given. */
function marketplace(config, entry) {
  mkdirSync(join(config, 'plugins'), { recursive: true })
  writeFileSync(join(config, 'plugins', 'known_marketplaces.json'), JSON.stringify({ inspeck: entry }))
}
const GITHUB = { source: { source: 'github', repo: 'pulkitmittal19/inspeck-claude' } }

test('installed from GitHub: a newer Inspeck installs itself, looked for twice a week', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-up-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude')
  marketplace(config, GITHUB)
  const claude = fakeClaude(tmp)
  const gh = await github('99.0.0')
  const port = 49900 + Math.floor(Math.random() * 90)
  const a = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url, claude: claude.bin })
  assert.ok(await until(async () => readJsonFile(join(home, 'latest.json'))?.installed === '99.0.0'), 'installed')
  assert.deepEqual(claude.calls(), ['plugin marketplace update inspeck', 'plugin update inspeck@inspeck'])
  assert.doesNotMatch(a.instructions, /is out|Update it now/, 'nothing offered: it just installs')
  await a.stop()
  /* The next chat within the half week doesn't look again. */
  const b = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url, claude: claude.bin })
  await new Promise(r => setTimeout(r, 800))
  await b.stop()
  assert.equal(gh.seen.asks, 1, 'not again within the half week')
  assert.equal(claude.calls().length, 2)
  gh.close()
  rmSync(tmp, { recursive: true, force: true })
})

test('left alone: a folder marketplace, a checkout, or turned off (Inspeck\'s switch, DISABLE_UPDATES, no non-essential traffic)', async () => {
  const cases = [
    ['a folder marketplace (a checkout being worked on)', { source: { source: 'directory', path: '/x/inspeck' } }, INSTALLED, {}],
    ['not an installed copy', GITHUB, '', {}],
    ['INSPECK_AUTO_UPDATE=off', GITHUB, INSTALLED, { INSPECK_AUTO_UPDATE: 'off' }],
    ['DISABLE_UPDATES=1', GITHUB, INSTALLED, { DISABLE_UPDATES: '1' }],
    ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1', GITHUB, INSTALLED, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }],
  ]
  for (const [name, entry, pluginRoot, env] of cases) {
    const tmp = mkdtempSync(join(tmpdir(), 'inspeck-left-'))
    const config = join(tmp, 'claude')
    marketplace(config, entry)
    const claude = fakeClaude(tmp)
    const gh = await github('99.0.0')
    const s = await start({ port: 49900 + Math.floor(Math.random() * 90), home: join(tmp, 'home'), config, pluginRoot, latest: gh.url, claude: claude.bin, env })
    await new Promise(r => setTimeout(r, 800))
    await s.stop()
    assert.equal(gh.seen.asks, 0, `${name}: GitHub not asked`)
    assert.deepEqual(claude.calls(), [], `${name}: nothing installed`)
    gh.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('installed with npx inspeck init (Claude Code\'s auto-update on): Inspeck looks too, since Claude Code never updates a running chat', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-init-up-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude')
  marketplace(config, { ...GITHUB, autoUpdate: true })
  const claude = fakeClaude(tmp)
  const gh = await github('99.0.0')
  const s = await start({ port: 49900 + Math.floor(Math.random() * 90), home, config, pluginRoot: INSTALLED, latest: gh.url, claude: claude.bin })
  try {
    assert.ok(await until(async () => readJsonFile(join(home, 'latest.json'))?.installed === '99.0.0'), 'installed')
    assert.deepEqual(claude.calls(), ['plugin marketplace update inspeck', 'plugin update inspeck@inspeck'])
  } finally { await s.stop(); gh.close(); rmSync(tmp, { recursive: true, force: true }) }
})

test('a chat that keeps running looks again when a look is due, without restarting (minutes set for trying it on one Mac)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-tick-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude')
  marketplace(config, GITHUB)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'update-check-minutes'), '0.03')
  const claude = fakeClaude(tmp)
  const gh = await github(VERSION)
  const s = await start({ port: 49900 + Math.floor(Math.random() * 90), home, config, pluginRoot: INSTALLED, latest: gh.url, claude: claude.bin })
  try {
    assert.ok(await until(async () => readJsonFile(join(home, 'latest.json'))?.version === VERSION), 'first look: nothing newer')
    assert.deepEqual(claude.calls(), [])
    /* A release comes out while the chat runs: its next look installs it. */
    gh.seen.version = '99.0.0'
    assert.ok(await until(async () => readJsonFile(join(home, 'latest.json'))?.installed === '99.0.0', 15000), 'installed by the running chat')
    assert.deepEqual(claude.calls(), ['plugin marketplace update inspeck', 'plugin update inspeck@inspeck'])
    assert.ok(gh.seen.asks >= 2)
  } finally { await s.stop(); gh.close(); rmSync(tmp, { recursive: true, force: true }) }
})

/** A copy of the built server saying it's `version`, where Claude Code would have installed it, and its record. */
function installedCopy(config, version) {
  const path = join(config, 'plugins', 'cache', 'inspeck', 'inspeck', version)
  mkdirSync(join(path, 'server', 'dist', 'widget'), { recursive: true })
  for (const f of ['inspeck.mjs', 'widget/inspeck.js']) {
    writeFileSync(join(path, 'server', 'dist', f), readFileSync(join(root, 'server', 'dist', f), 'utf8').split(`"${VERSION}"`).join(`"${version}"`))
  }
  writeFileSync(join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'inspeck@inspeck': [{ scope: 'user', installPath: path, version }] } }))
  return path
}

test('a newer installed version answers pages: started in the background once, it leaves when a newer one takes over, and when no chat is left', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-serve-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude')
  marketplace(config, GITHUB)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'update-check-minutes'), '0.03')
  installedCopy(config, '99.0.0')
  const gh = await github('99.0.0')
  const chat = spawn('sleep', ['120'], { stdio: 'ignore' })
  const port = 49800 + Math.floor(Math.random() * 90)
  const s = await start({ port, home, config, pluginRoot: INSTALLED, latest: gh.url, claude: fakeClaude(tmp).bin, env: { INSPECK_SESSION_PID: String(chat.pid) } })
  try {
    assert.ok(await until(async () => (await health(port))?.version === '99.0.0', 15000), 'the newer installed one answers the port')
    const serving = readJsonFile(join(home, 'serving.json'))
    assert.equal(serving?.version, '99.0.0')
    /* Ticks keep coming: still one of it. */
    await new Promise(r => setTimeout(r, 3000))
    assert.equal(readJsonFile(join(home, 'serving.json'))?.pid, serving.pid, 'started once')
    /* An even newer one takes over: it steps aside and goes. */
    const key = readFileSync(join(home, 'handover-key'), 'utf8')
    const stepped = await new Promise(resolve => { const r = http.request({ host: '127.0.0.1', port, path: '/handover', method: 'POST', headers: { 'x-inspeck-version': '100.0.0', 'x-inspeck-key': key } }, res => resolve(res.statusCode)); r.end() })
    assert.equal(stepped, 200)
    assert.ok(await until(async () => { try { process.kill(serving.pid, 0); return false } catch { return true } }, 5000), 'it left')
    /* With no chat left, a background one goes too. */
    const again = spawn(process.execPath, [join(config, 'plugins', 'cache', 'inspeck', 'inspeck', '99.0.0', 'server', 'dist', 'inspeck.mjs'), 'serve'], { stdio: 'ignore', env: { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(port) } })
    assert.ok(await until(async () => (await health(port))?.version === '99.0.0', 9000), 'a background one answers again')
    chat.kill()
    assert.ok(await until(async () => again.exitCode !== null, 25000), 'and goes once no chat is left')
  } finally { chat.kill(); await s.stop(); gh.close(); rmSync(tmp, { recursive: true, force: true }) }
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
  assert.match(first, /Inspeck dev plugin \(the inspeck npm package in .*apps\/admin\) is 0\.10\.2, older than 0\.13\.1/)
  assert.match(first, /`pnpm add -D inspeck@latest`/, "the project's own package manager")
  assert.doesNotMatch(await open(), /Inspeck dev plugin/, 'offered once')

  /* Up to date: nothing to offer. */
  rmSync(home, { recursive: true, force: true })
  writeFileSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck', 'package.json'), JSON.stringify({ name: 'inspeck', version: '0.13.1' }))
  assert.doesNotMatch(await open(), /Inspeck dev plugin/)
  rmSync(tmp, { recursive: true, force: true })
})
