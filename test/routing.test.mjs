/* Notes reach the right Claude session.
 *
 * Each fake session is a real, live process standing in for `claude`
 * (INSPECK_SESSION_PID), with its own project folder, and both share one
 * inbox — as two Claude sessions on one machine do. */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'inspeck-route-'))
const port = 48100 + Math.floor(Math.random() * 800)
const cleanup = []
after(() => { for (const f of cleanup.reverse()) f() })

function standIn() {
  const p = spawn('sleep', ['600'], { stdio: 'ignore' })
  cleanup.push(() => p.kill())
  return p.pid
}

async function session(name, project) {
  const dir = project ? mkdtempSync(join(project, `${name}-`)) : mkdtempSync(join(tmpdir(), `inspeck-${name}-`))
  copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
  mkdirSync(join(dir, 'widget'))
  copyFileSync(join(root, 'server/dist/widget/inspeck.js'), join(dir, 'widget/inspeck.js'))
  const pid = standIn()
  const env = { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(port), INSPECK_SESSION_PID: String(pid), INSPECK_LATEST_URL: 'off' }
  const client = new Client({ name: `claude-${name}`, version: '0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dir, 'inspeck.mjs')], cwd: dir, env, stderr: 'ignore' }))
  cleanup.push(() => { void client.close(); rmSync(dir, { recursive: true, force: true }) })
  return { name, dir, pid, env, client, tool: async (n, a = {}) => (await client.callTool({ name: n, arguments: a })).content.filter(c => c.type === 'text').map(c => c.text).join('\n') }
}

function post(path, body, origin = 'http://localhost:5173') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path, headers: { origin, 'x-inspeck': '1', 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null }))
    })
    req.on('error', reject)
    req.end(data)
  })
}

const note = (text, extra = {}) => ({ note: text, page: 'http://localhost:5173/settings', element: { selector: '#save', tag: 'button' }, ...extra })
const tokenFrom = (bindText) => /bind\("([^"]+)"\)/.exec(bindText)[1]

let A, B
test('two sessions start and share one inbox', async () => {
  A = await session('a')
  B = await session('b')
  for (let i = 0; i < 50; i++) {
    try { if ((await post('/bind', {})).status) break } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
})

test('a tab bound to session B sends its notes to B, and only B sees them', async () => {
  const bound = await post('/bind', { tabId: 'tab-b', token: tokenFrom(await B.tool('bind')) })
  assert.equal(bound.status, 200)
  assert.equal(bound.json.project, realpathSync(B.dir))

  const r = await post('/comments', note('Only for B', { tabId: 'tab-b' }))
  assert.equal(r.status, 201)
  assert.match(await B.tool('pending'), /Only for B/)
  assert.doesNotMatch(await A.tool('pending'), /Only for B/, 'A owns the port but the note is B’s')
})

test('a code no session owns binds nothing', async () => {
  const r = await post('/bind', { tabId: 'tab-x', token: 'not-a-real-code' })
  assert.equal(r.status, 404)
})

test('the background watcher wakes for its own session’s note and leaves others alone', async () => {
  const bindA = await post('/bind', { tabId: 'tab-a', token: tokenFrom(await A.tool('bind')) })
  assert.equal(bindA.status, 200)
  /* B has read what was waiting for it (checking its notes, above), so the watcher starts clean. */
  await B.tool('pending')
  const waiter = spawn(process.execPath, [join(B.dir, 'inspeck.mjs'), 'wait', '--minutes', '1'], { env: B.env, cwd: B.dir })
  let out = ''
  waiter.stdout.on('data', c => { out += c })
  const exited = new Promise(r => waiter.on('exit', r))

  await post('/comments', note('For A, not B', { tabId: 'tab-a' }))
  await new Promise(r => setTimeout(r, 1500))
  assert.equal(waiter.exitCode, null, 'B’s watcher ignores A’s note')

  await post('/comments', note('Wake B up', { tabId: 'tab-b' }))
  await exited
  assert.match(out, /Inspeck: a new note from the page/)
  assert.match(out, /Wake B up/)
  assert.doesNotMatch(out, /For A, not B/)
  assert.match(out, /inspeck\.mjs" wait/, 'tells Claude how to keep listening')
})

test('Settings can tell whether a note from a tab reaches a chat that\'s listening', async () => {
  const listening = tab => new Promise(resolve => {
    const q = new URLSearchParams({ page: 'http://localhost:5173/settings', tab })
    http.get({ host: '127.0.0.1', port, path: `/listening?${q}`, headers: { origin: 'http://localhost:5173', 'x-inspeck': '1' } }, res => {
      let raw = ''; res.on('data', c => { raw += c }); res.on('end', () => resolve(JSON.parse(raw).listening))
    })
  })
  const D = await session('d')
  const bindD = await post('/bind', { tabId: 'tab-listen', token: tokenFrom(await D.tool('bind')) })
  assert.equal(bindD.status, 200)
  assert.equal(await listening('tab-listen'), false, 'no watcher: Settings gives the line to send')
  const waiter = spawn(process.execPath, [join(D.dir, 'inspeck.mjs'), 'wait', '--minutes', '1'], { env: D.env, cwd: D.dir })
  const exited = new Promise(r => waiter.on('exit', r))
  let on = false
  for (let i = 0; i < 30 && !on; i++) { on = await listening('tab-listen'); if (!on) await new Promise(r => setTimeout(r, 100)) }
  assert.equal(on, true, 'watcher running: Settings says notes go straight to the chat')
  /* A note wakes it; Claude handles it and listens again, so it still counts as listening meanwhile. */
  await post('/comments', note('Heard', { tabId: 'tab-listen' }))
  await exited
  assert.equal(await listening('tab-listen'), true)
  /* A page can't ask about another site. */
  const other = await new Promise(resolve => http.get({ host: '127.0.0.1', port, path: '/listening?page=http%3A%2F%2Flocalhost%3A9999%2F', headers: { origin: 'http://localhost:5173', 'x-inspeck': '1' } }, res => { res.resume(); resolve(res.statusCode) }))
  assert.equal(other, 403)
})

test('a note from an ordinary browser that no session can place goes to the first session that checks, and so does the rest of that site', async () => {
  /* Nothing listens on this port, so no project can be found for the page: as
     with an app in Chrome when no session is open in its folder. */
  const page = 'http://localhost:5199/inbox'
  const first = await post('/comments', note('From Chrome', { page }), new URL(page).origin)
  assert.equal(first.json.comment.to.how, 'waiting')
  assert.doesNotMatch(await A.tool('watch', { seconds: 5 }), /From Chrome/, 'nobody picks it up by themselves')

  const checked = await B.tool('pending')
  assert.match(checked, /Took 1 note no other session had, from http:\/\/localhost:5199/)
  assert.match(checked, /From Chrome/)
  assert.doesNotMatch(await A.tool('pending'), /From Chrome/)

  const next = await post('/comments', note('Second from Chrome', { page: 'http://localhost:5199/settings' }), 'http://localhost:5199')
  assert.equal(next.json.comment.to.how, 'site')
  assert.equal(next.json.comment.to.pid, B.pid)
})

test('bind with a page links that whole site to the session', async () => {
  assert.match(await A.tool('bind', { page: 'http://localhost:5198' }), /Notes from http:\/\/localhost:5198 now come to this session/)
  const r = await post('/comments', note('Site linked to A', { page: 'http://localhost:5198/x' }), 'http://localhost:5198')
  assert.equal(r.json.comment.to.how, 'site')
  assert.equal(r.json.comment.to.pid, A.pid)
  assert.match(await A.tool('pending'), /Site linked to A/)
  assert.doesNotMatch(await B.tool('pending'), /Site linked to A/)
})

test('when a chat closes, the next one gets its unread notes, not the ones it already read', async () => {
  const C = await session('c')
  assert.match(await C.tool('bind', { page: 'http://localhost:5197' }), /now come to this session/)
  await post('/comments', note('Read by C', { page: 'http://localhost:5197/a' }), 'http://localhost:5197')
  assert.match(await C.tool('pending'), /Read by C/)
  await post('/comments', note('Never read', { page: 'http://localhost:5197/b' }), 'http://localhost:5197')
  /* C's chat closes. */
  process.kill(C.pid)
  await new Promise(r => setTimeout(r, 200))
  const next = await A.tool('pending')
  assert.match(next, /Never read/, 'an unread note is handed over')
  assert.doesNotMatch(next, /Read by C/, 'a note the closed chat read is not listed again')
  assert.match(await A.tool('pending'), /Never read/, 'and what this chat read stays listed for it')
})

test('with two chats open in one project, the chat the person asks takes the notes placed on that project’s page', async () => {
  /* Both chats are in the project whose dev server serves the page, so a note goes to the newer one by guess.
     The person asks the older one: it must take the note, or its marker stays on the page for good. */
  const project = mkdtempSync(join(tmpdir(), 'inspeck-proj-'))
  cleanup.push(() => rmSync(project, { recursive: true, force: true }))
  const devPort = port + 2
  const dev = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('ok')).listen(${devPort}, '127.0.0.1')`], { cwd: project, stdio: 'ignore' })
  cleanup.push(() => dev.kill())
  const Older = await session('older', project)
  const Newer = await session('newer', project)
  await new Promise(r => setTimeout(r, 300))
  const page = `http://localhost:${devPort}/style-guide.html`
  const r = await post('/comments', note('Placed with Auto-send off', { page, held: true }), `http://localhost:${devPort}`)
  assert.equal(r.json.comment.to.how, 'project')
  assert.equal(r.json.comment.to.pid, Newer.pid)

  const asked = await Older.tool('pending')
  assert.match(asked, /Placed with Auto-send off/)
  const left = await new Promise(resolve => http.get({ host: '127.0.0.1', port, path: `/comments?page=${encodeURIComponent(page)}`, headers: { origin: `http://localhost:${devPort}`, 'x-inspeck': '1' } }, res => {
    let raw = ''; res.on('data', c => { raw += c }); res.on('end', () => resolve(JSON.parse(raw).comments))
  }))
  assert.deepEqual(left.map(c => c.status), ['seen'], 'read: its marker leaves the page')
  assert.doesNotMatch(await Newer.tool('pending'), /Placed with Auto-send off/, 'and the other chat doesn’t get it twice')
  const id = left[0].id
  assert.match(await Older.tool('resolve', { id, summary: 'done' }), /Done/)
})

test('with one session open, an unbound tab’s note goes to it', async () => {
  const solo = mkdtempSync(join(tmpdir(), 'inspeck-solo-'))
  const S = await (async () => {
    /* A separate inbox, so A and B don't count as open sessions here. */
    const dir = mkdtempSync(join(tmpdir(), 'inspeck-s-'))
    copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
    const pid = standIn()
    const p = port + 1
    const env = { ...process.env, INSPECK_HOME: solo, INSPECK_PORT: String(p), INSPECK_SESSION_PID: String(pid), INSPECK_LATEST_URL: 'off' }
    const client = new Client({ name: 'claude-solo', version: '0' })
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dir, 'inspeck.mjs')], cwd: dir, env, stderr: 'ignore' }))
    cleanup.push(() => { void client.close(); rmSync(dir, { recursive: true, force: true }); rmSync(solo, { recursive: true, force: true }) })
    return { client, p }
  })()
  let r
  for (let i = 0; i < 50; i++) {
    r = await new Promise(resolve => {
      const data = JSON.stringify(note('Unbound tab'))
      const req = http.request({ host: '127.0.0.1', port: S.p, method: 'POST', path: '/comments', headers: { origin: 'http://localhost:5173', 'x-inspeck': '1', 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
        let raw = ''; res.on('data', c => { raw += c }); res.on('end', () => resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null }))
      })
      req.on('error', () => resolve(null))
      req.end(data)
    })
    if (r) break
    await new Promise(res => setTimeout(res, 100))
  }
  assert.equal(r.status, 201)
  assert.equal(r.json.comment.to.how, 'only')
  const pending = (await S.client.callTool({ name: 'pending', arguments: {} })).content.map(c => c.text ?? '').join('\n')
  assert.match(pending, /Unbound tab/)
})
