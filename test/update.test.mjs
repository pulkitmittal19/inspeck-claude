/* Staying up to date: Inspeck looks for a newer version twice a week, when a chat starts and while it keeps
 * running, and installs it, with a stand-in `claude` that only records what it's asked; a newer installed
 * version starts in the background to answer pages; it never touches Claude's settings; and a newer Inspeck
 * takes the port from an older one. Run against the built server, started over stdio as Claude Code starts it,
 * with DISABLE_AUTOUPDATER=1 as the Claude desktop app sets it for everything it starts. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from 'node:net'
import http from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/* These run like real installs: none of them may count as one. */
process.env.INSPECK_TELEMETRY = 'off'

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
  srv.unref()
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

test('a look or an install that failed tries again within the hour; a good look waits the half week', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-up-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude'), file = join(home, 'latest.json')
  marketplace(config, GITHUB)
  const port = 49800 + Math.floor(Math.random() * 90)
  const gh = await github('0.0.0')
  const anHourAgo = () => writeFileSync(file, JSON.stringify({ ...readJsonFile(file), checkedAt: new Date(Date.now() - 61 * 60_000).toISOString() }))
  /* With a claude to run, a look also waits for its commands, which can take longer on a busy machine. */
  const chat = async (latest, claude = '') => { const c = await start({ port, home, config, pluginRoot: INSTALLED, latest, claude }); await new Promise(r => setTimeout(r, claude ? 4000 : 800)); await c.stop() }

  /* Offline: GitHub can't be read. */
  await chat('http://127.0.0.1:9/plugin.json')
  assert.equal(readJsonFile(file)?.failed, true)
  /* Back online, within the hour: left for now. */
  await chat(gh.url)
  assert.equal(gh.seen.asks, 0)
  /* An hour on: it looks. */
  anHourAgo()
  await chat(gh.url)
  assert.equal(gh.seen.asks, 1)
  assert.equal(readJsonFile(file)?.failed, undefined, 'a good look')
  /* A good look an hour ago: not again for half a week. */
  anHourAgo()
  await chat(gh.url)
  assert.equal(gh.seen.asks, 1)

  /* A newer version that can't be installed (Claude's command fails): again within the hour too. */
  gh.seen.version = '99.0.0'
  rmSync(file)
  const failing = join(tmp, 'claude-failing')
  writeFileSync(failing, `#!/bin/sh\necho "$*" >> "${join(tmp, 'failing.log')}"\nexit 1\n`)
  chmodSync(failing, 0o755)
  await chat(gh.url, failing)
  assert.equal(readJsonFile(file)?.failed, true)
  anHourAgo()
  await chat(gh.url, failing)
  assert.equal(readFileSync(join(tmp, 'failing.log'), 'utf8').trim().split('\n').length, 2, 'tried twice')
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

test('with older chats waiting for the port (real 0.19.5 code), a newer Inspeck takes it and keeps it: no flapping', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-race-'))
  const home = join(tmp, 'home'), port = 49600 + Math.floor(Math.random() * 90)
  /* The released 0.19.5 server, as chats opened before an update still run it. */
  const old = join(tmp, 'old.mjs')
  writeFileSync(old, execFileSync('git', ['show', 'c8a9cb3:server/dist/inspeck.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }))
  const stamped = (v) => { const f = join(tmp, `new-${v}.mjs`); mkdirSync(join(tmp, 'widget'), { recursive: true }); writeFileSync(f, readFileSync(join(root, 'server/dist/inspeck.mjs'), 'utf8').split(`"${VERSION}"`).join(`"${v}"`)); return f }
  const chat = spawn('sleep', ['120'], { stdio: 'ignore' })
  const env = { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(port), INSPECK_LATEST_URL: 'off', INSPECK_SESSION_PID: String(chat.pid), CLAUDE_PLUGIN_ROOT: '' }
  const clients = []
  const open = async (file) => { const c = new Client({ name: 'chat', version: '0' }); await c.connect(new StdioClientTransport({ command: process.execPath, args: [file], cwd: tmp, env, stderr: 'ignore' })); clients.push(c) }
  let serve
  try {
    for (let i = 0; i < 3; i++) await open(old)
    assert.ok(await until(async () => (await health(port))?.version === '0.19.5', 9000), 'an old chat answers')
    await open(stamped('0.20.0'))
    assert.ok(await until(async () => (await health(port))?.version === '0.20.0', 12000), 'a 0.20.0 chat takes it')
    /* The update: a newer one starts to answer pages, while three older chats wait for the port every 5 s. */
    serve = spawn(process.execPath, [stamped('9.9.9'), 'serve'], { stdio: 'ignore', env })
    assert.ok(await until(async () => (await health(port))?.version === '9.9.9', 12000), 'the newer one takes it')
    const seen = new Set()
    for (let i = 0; i < 80; i++) { const v = (await health(port))?.version ?? 'none'; seen.add(v); await new Promise(r => setTimeout(r, 250)) }
    assert.deepEqual([...seen].filter(v => v !== '9.9.9' && v !== 'none'), [], `over 20 s the port only answered ${[...seen].join(', ')}`)
    assert.equal((await health(port))?.version, '9.9.9')
    assert.equal(serve.exitCode, null, 'and it stays')
  } finally {
    serve?.kill(); chat.kill()
    for (const c of clients) await c.close().catch(() => {})
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('counting installs: once when new, then twice a week, only the id, version and install type; never with a switch off or from a checkout', async () => {
  const seen = []
  let refuse = 0
  const stub = http.createServer((req, res) => {
    let b = ''
    req.on('data', c => { b += c })
    req.on('end', () => { if (refuse > 0) { refuse--; res.statusCode = 500 } else seen.push(JSON.parse(b)); res.end('{}') })
  })
  await new Promise(r => stub.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${stub.address().port}/capture/`
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-count-'))
  const home = join(tmp, 'home'), config = join(tmp, 'claude'), port = 49900 + Math.floor(Math.random() * 90)
  marketplace(config, GITHUB)
  const gh = await github('0.0.0')
  /* A chat that opens, and stays until `expected` have come, or long enough to see nothing does. */
  const chat = async (expected, more = {}, pluginRoot = INSTALLED) => {
    const c = await start({ port, home, config, pluginRoot, latest: gh.url, env: { INSPECK_TELEMETRY: '', DO_NOT_TRACK: '', INSPECK_TELEMETRY_URL: url, ...more } })
    await until(() => seen.length >= expected, 5000)
    await new Promise(r => setTimeout(r, 800))
    await c.stop()
    assert.equal(seen.length, expected)
  }
  const kept = join(home, 'telemetry.json')
  const halfAWeekOn = () => writeFileSync(kept, JSON.stringify({ ...readJsonFile(kept), lastActive: Date.now() - 4 * 24 * 3600 * 1000 }))
  try {
    await chat(0, { INSPECK_TELEMETRY: 'off' })
    await chat(0, { DO_NOT_TRACK: '1' })
    assert.equal(existsSync(kept), false, 'switched off, it doesn\'t even make an id')

    /* Couldn't send (offline, say): it tries again. */
    refuse = 1
    await chat(0)
    await chat(2)
    assert.deepEqual(seen.map(e => e.event), ['inspeck_installed', 'inspeck_active'])
    for (const e of seen) {
      assert.deepEqual(Object.keys(e).sort(), ['api_key', 'distinct_id', 'event', 'properties'])
      assert.match(e.api_key, /^phc_/)
      assert.match(e.distinct_id, /^[0-9a-f]{32}$/)
      assert.deepEqual(e.properties, { version: VERSION, install: 'plugin', surface: 'plugin', $process_person_profile: false, $geoip_disable: true })
    }

    await chat(2)
    halfAWeekOn()
    await chat(3)
    assert.equal(seen[2].event, 'inspeck_active')
    assert.equal(seen[2].distinct_id, seen[0].distinct_id, 'the same install')

    halfAWeekOn()
    writeFileSync(join(home, 'telemetry-off'), '')
    await chat(3)
    rmSync(join(home, 'telemetry-off'))
    await chat(3, {}, '')

    writeFileSync(join(config, 'settings.json'), JSON.stringify({ extraKnownMarketplaces: { inspeck: GITHUB } }))
    await chat(4)
    assert.equal(seen[3].properties.install, 'init')
  } finally {
    gh.close()
    stub.close()
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

test('a connection a browser still holds to an Inspeck that handed over the port answers once and closes, so the page\'s next call reaches the newer one', async () => {
  const port = 49800 + Math.floor(Math.random() * 90)
  const tmp = mkdtempSync(join(tmpdir(), 'inspeck-held-'))
  mkdirSync(join(tmp, 'home'))
  writeFileSync(join(tmp, 'home', 'handover-key'), 'the-key')
  const s = await start({ port, home: join(tmp, 'home'), config: join(tmp, 'claude'), pluginRoot: '' })
  try {
    assert.ok(await until(async () => (await health(port))?.version === VERSION))
    /* The spare connection Chromium keeps: open, nothing asked on it yet, so it isn't idle and survives the handover. */
    const spare = connect(port, '127.0.0.1')
    let reset = null
    spare.on('error', e => { reset = e })
    await new Promise(r => spare.once('connect', r))
    /* Connected isn't accepted: one still queued when the port is let go gets reset, and a browser just connects again. */
    await new Promise(r => setTimeout(r, 300))
    const stepped = await new Promise(resolve => http.request({ host: '127.0.0.1', port, path: '/handover', method: 'POST', headers: { 'x-inspeck-version': '999.0.0', 'x-inspeck-key': 'the-key' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) }).end())
    assert.equal(stepped, 200)
    let said = ''
    spare.on('data', d => { said += d })
    const closed = new Promise(r => spare.once('close', () => r(true)))
    spare.write(`GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`)
    assert.equal(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 3000))]), true, 'the connection closes, rather than waiting on the next call')
    assert.equal(reset, null)
    assert.match(said, /^HTTP\/1\.1 200/, 'and it answered first')
    spare.destroy()
  } finally {
    await s.stop()
    rmSync(tmp, { recursive: true, force: true })
  }
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
  assert.match(first, /Inspeck dev plugin \(the inspeck npm package in .*apps\/admin\) is 0\.10\.2, older than 0\.13\.4/)
  assert.match(first, /`pnpm add -D inspeck@latest`/, "the project's own package manager")
  assert.doesNotMatch(await open(), /Inspeck dev plugin/, 'offered once')

  /* Up to date: nothing to offer. */
  rmSync(home, { recursive: true, force: true })
  writeFileSync(join(project, 'apps', 'admin', 'node_modules', 'inspeck', 'package.json'), JSON.stringify({ name: 'inspeck', version: '0.13.4' }))
  assert.doesNotMatch(await open(), /Inspeck dev plugin/)
  rmSync(tmp, { recursive: true, force: true })
})
