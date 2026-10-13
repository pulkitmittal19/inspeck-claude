/* The local address pages talk to.
 *
 * Anything that reaches Claude from here reaches it as text Claude reads, so
 * who may post is the security boundary of the whole plugin. An ordinary
 * website open in another tab must not be able to leave a "comment" that asks
 * Claude to do something. Three checks keep it out:
 *
 *   - It listens on 127.0.0.1 only, so nothing off this machine can connect.
 *   - The Host header must name this machine. That stops DNS rebinding, where
 *     a public site points its own hostname at 127.0.0.1 to get in.
 *   - A browser always sends Origin on a cross-site request and a page can't
 *     fake it. Only pages on this machine (localhost, *.localhost, *.test) and
 *     browser extensions are let in; anything else — a LAN address, staging —
 *     must be named in INSPECK_ALLOWED_ORIGINS.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { hostname, networkInterfaces } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './store.js'
import { HOME } from './store.js'
import { bindTab, route as routeNote } from './sessions.js'
import { isThisMachine, NewComment, NOTE_MAX, pageKey, type Comment } from './format.js'
import { resolveSource } from './sourcemap.js'
import { listenStream, stopListening, voiceAvailable, warmVoice } from './voice.js'

/** Settings the widget may keep, and the values each may take. */
const SETTINGS: Record<string, string[]> = {
  sizes: ['written', 'px', 'rem'],
  colors: ['written', 'hex', 'rgb', 'oklch'],
  /* Auto-send notes to Claude (live), or keep them on the page until you send them (ask). */
  send: ['ask', 'live'],
}

export const PORT = Number(process.env.INSPECK_PORT) || 4848

const EXTRA_ORIGINS = (process.env.INSPECK_ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

export function originAllowed(origin: string | undefined): boolean {
  /* No Origin means no browser: a script or curl on this machine, which could
     read the inbox file directly anyway. */
  if (!origin) return true
  if (EXTRA_ORIGINS.includes(origin)) return true
  let u: URL
  try { u = new URL(origin) } catch { return false }
  if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') return true
  return isThisMachine(u.hostname) || ownAddress(u.hostname)
}

/** This Mac's names: its host name, and on a Mac its Bonjour name (System Settings › Sharing), which can differ. */
let names: Set<string> | null = null
function ownNames(): Set<string> {
  if (names) return names
  const list = [hostname()]
  if (process.platform === 'darwin') {
    try { list.push(execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', timeout: 1000 }).trim()) } catch { /* not set */ }
  }
  names = new Set(list.flatMap(n => { const b = n.toLowerCase().replace(/\.local$/, ''); return b ? [b, `${b}.local`] : [] }))
  return names
}

/** Whether a name or IP is this Mac's own on the network (the "Network" address a dev server prints, or
    its Bonjour name): a page there is served from this machine. Another device's address is not. */
export function ownAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (ownNames().has(h)) return true
  return Object.values(networkInterfaces()).some(list => list?.some(a => a.address.toLowerCase() === h))
}

function hostAllowed(host: string | undefined): boolean {
  if (!host) return false
  const name = host.replace(/:\d+$/, '')
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const MAX_BODY = 5 * 1024 * 1024

/** An answer with its own status: too big is 413, not the usual 400. */
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      /* Too big: stop keeping it but read it to the end, so the page gets an answer it can show
         rather than a dropped connection. Far too big, and the connection goes. */
      if (size > MAX_BODY * 10) { req.destroy(); return }
      if (size <= MAX_BODY) chunks.push(c)
    })
    req.on('end', () => {
      if (size > MAX_BODY) { reject(new HttpError(413, `That’s too big for Inspeck: the limit is ${MAX_BODY / 1024 / 1024} MB.`)); return }
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
      catch { reject(new Error('Body is not JSON')) }
    })
    req.on('error', reject)
  })
}

/* The widget is built next to this bundle (server/dist/widget/inspeck.js) and
   read from disk on each request, so a rebuild shows up on the next reload
   without restarting Claude. The ETag makes an unchanged reload a 304. */
const HERE = dirname(fileURLToPath(import.meta.url))
const WIDGET = process.env.INSPECK_WIDGET || join(HERE, 'widget', 'inspeck.js')

function sendFile(req: IncomingMessage, res: ServerResponse, path: string, type: string): void {
  let stat
  try { stat = statSync(path) } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not built. Run npm run build.')
    return
  }
  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`
  const headers = {
    'content-type': type,
    'cache-control': 'no-cache',
    etag,
    'x-content-type-options': 'nosniff',
    /* A page on another port loads this with a plain <script src>. */
    'cross-origin-resource-policy': 'cross-origin',
  }
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return }
  res.writeHead(200, headers).end(readFileSync(path))
}

/* A test page to develop the widget against. Only with INSPECK_DEV=1, and
   only files inside widget/dev — the name can't climb out of that folder. */
const DEV = process.env.INSPECK_DEV === '1'
const DEV_DIR = join(HERE, '..', '..', 'widget', 'dev')

function devFile(req: IncomingMessage, res: ServerResponse, name: string): void {
  const path = normalize(join(DEV_DIR, name || 'index.html'))
  if (!path.startsWith(DEV_DIR)) { send(res, 404, { error: 'Not found' }); return }
  const type = path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'text/javascript'
  sendFile(req, res, path, type)
}

/* What a page gets back about a comment: everything it needs to draw the badge
   and show Claude's replies, minus the file path on this machine. */
function forPage(c: Comment) {
  const { screenshot, ...rest } = c
  return { ...rest, hasScreenshot: Boolean(screenshot) }
}

async function route(req: IncomingMessage, res: ServerResponse, version: string, onNew: (c: Comment) => void): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, name: 'inspeck', version })
  }

  if (req.method === 'GET' && url.pathname === '/inspeck.js') {
    return sendFile(req, res, WIDGET, 'text/javascript; charset=utf-8')
  }

  if (DEV && req.method === 'GET' && parts[0] === '__dev') {
    return devFile(req, res, parts.slice(1).join('/'))
  }

  /* The widget's first-run tour, seen once per machine rather than once per app. */
  if (url.pathname === '/tour' && (req.method === 'GET' || req.method === 'POST')) {
    const flag = join(HOME, 'tour-seen')
    if (req.method === 'POST') { mkdirSync(HOME, { recursive: true }); writeFileSync(flag, new Date().toISOString()) }
    return send(res, 200, { seen: existsSync(flag) })
  }

  /* The widget's settings (Settings in the pill), one set per machine. Only known keys and values are kept. */
  if (url.pathname === '/settings' && (req.method === 'GET' || req.method === 'POST')) {
    const file = join(HOME, 'settings.json')
    const read = (): Record<string, string> => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} } }
    if (req.method === 'POST') {
      const b = (await body(req)) as Record<string, unknown>
      const next = read()
      for (const [key, allowed] of Object.entries(SETTINGS)) {
        const v = b?.[key]
        if (typeof v === 'string' && allowed.includes(v)) next[key] = v
      }
      mkdirSync(HOME, { recursive: true })
      writeFileSync(file, JSON.stringify(next, null, 2))
      return send(res, 200, next)
    }
    return send(res, 200, read())
  }

  /* Voice for notes: whether it works here, a listening session streamed as it goes, and stopping it. */
  if (url.pathname === '/voice' && req.method === 'GET') return send(res, 200, voiceAvailable())
  if (url.pathname === '/voice/listen' && req.method === 'POST') return listenStream(req, res)
  if (url.pathname === '/voice/stop' && req.method === 'POST') return send(res, 200, { stopping: stopListening() })
  if (url.pathname === '/voice/warm' && req.method === 'POST') return send(res, 200, { warm: warmVoice() })

  /* A Claude session hands its pane's widget a code; from then on that tab's notes go to it. */
  if (req.method === 'POST' && url.pathname === '/bind') {
    const b = (await body(req)) as { tabId?: unknown; token?: unknown }
    if (typeof b.tabId !== 'string' || typeof b.token !== 'string' || b.tabId.length > 64) return send(res, 400, { error: 'Send { tabId, token }' })
    const s = bindTab(b.tabId, b.token)
    return s ? send(res, 200, { ok: true, project: s.cwd }) : send(res, 404, { error: 'That code belongs to no open Claude session' })
  }

  if (parts[0] !== 'comments') return send(res, 404, { error: 'Not found' })
  const id = parts[1]

  /* Send the notes held on a page (the pill's Send), or on a whole site (Auto-send notes to Claude turned on). */
  if (id === 'send' && req.method === 'POST') {
    const b = (await body(req)) as { page?: unknown; site?: unknown }
    const origin = (u: string) => { try { return new URL(u).origin } catch { return null } }
    let which: ((c: Comment) => boolean) | null = null
    if (typeof b.page === 'string') { const key = pageKey(b.page); which = c => c.page === key }
    else if (typeof b.site === 'string' && origin(b.site)) { const o = origin(b.site); which = c => origin(c.page) === o }
    if (!which) return send(res, 400, { error: 'Send { page } or { site }' })
    const sent = store.release(which)
    for (const c of sent) onNew(c)
    return send(res, 200, { sent: sent.length })
  }

  if (!id && req.method === 'GET') {
    const page = url.searchParams.get('page')
    const list = page ? store.forPage(page) : store.open()
    return send(res, 200, { comments: list.map(forPage) })
  }

  if (!id && req.method === 'POST') {
    const parsed = NewComment.safeParse(await body(req))
    if (!parsed.success) {
      return send(res, 400, { error: 'Comment is not in the Inspeck format', issues: parsed.error.issues })
    }
    /* Places in compiled server code (a server component's JSX) become places in the source. */
    const note = parsed.data
    if (note.source) note.source = note.source.map(resolveSource)
    for (const m of note.group ?? []) if (m.source) m.source = resolveSource(m.source)
    const created = store.add(note, routeNote(note.page, note.tabId))
    onNew(created)
    return send(res, 201, { comment: forPage(created) })
  }

  if (id && req.method === 'PATCH') {
    const b = (await body(req)) as { note?: unknown }
    if (typeof b.note !== 'string') return send(res, 400, { error: 'Send { note: string }' })
    if (b.note.length > NOTE_MAX) return send(res, 400, { error: `A note holds up to ${NOTE_MAX.toLocaleString('en')} characters` })
    if (!b.note.trim()) return send(res, 400, { error: 'A note needs some words (delete it instead)' })
    const c = store.editNote(id, b.note)
    return c ? send(res, 200, { comment: forPage(c) }) : send(res, 404, { error: 'No such comment' })
  }

  /* The person answering Claude on the badge. */
  if (id && parts[2] === 'replies' && req.method === 'POST') {
    const b = (await body(req)) as { text?: unknown }
    if (typeof b.text !== 'string' || !b.text.trim()) return send(res, 400, { error: 'Send { text: string }' })
    if (b.text.length > NOTE_MAX) return send(res, 400, { error: `A reply holds up to ${NOTE_MAX.toLocaleString('en')} characters` })
    const c = store.say(id, 'you', b.text.trim())
    return c ? send(res, 201, { comment: forPage(c) }) : send(res, 404, { error: 'No such comment' })
  }

  if (id && req.method === 'DELETE') {
    return store.remove(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'No such comment' })
  }

  return send(res, 405, { error: 'Method not allowed' })
}

/** How often a session sharing the port tries for it again. */
const RETRY_MS = 5000

/** Whether version a is newer than b ("0.15.0" > "0.14.2"). */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN) || !pa.length) return false
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/** Ask the Inspeck on the port to step aside, if it's an older one. True when it agreed. */
async function handover(mine: string): Promise<boolean> {
  try {
    const h = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) }).then(r => r.json()) as { name?: string; version?: string }
    if (h.name !== 'inspeck' || !h.version || !newer(mine, h.version)) return false
    const r = await fetch(`http://127.0.0.1:${PORT}/handover`, { method: 'POST', headers: { 'x-inspeck-version': mine }, signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

/**
 * Start listening. Resolves true when this process owns the port, false when
 * another Inspeck already does — in which case both share the inbox file and
 * nothing is lost; this one just doesn't answer pages. It keeps trying, so if
 * the other session closes, this one takes the port over. And if the one on the
 * port is an older Inspeck (an update arrived while a chat was open), it's asked
 * to step aside, so pages get the newest widget without closing any chat.
 */
export function listen(version: string, log: (msg: string) => void, onNew: (c: Comment) => void = () => {}): Promise<boolean> {
  let attempt = () => {}
  const server = createServer((req, res) => {
    const origin = req.headers.origin
    if (!hostAllowed(req.headers.host) || !originAllowed(origin)) {
      return send(res, 403, { error: 'Inspeck only accepts comments from local pages and the Inspeck extension' })
    }
    /* A newer Inspeck has started (an update came while this session was open) and asks for the port:
       this one steps aside and shares its inbox, so pages get the newest widget without anyone closing
       a chat. Only another Inspeck asks this, never a page (a browser always says where it's from). */
    if (req.method === 'POST' && req.url === '/handover') {
      const theirs = String(req.headers['x-inspeck-version'] ?? '')
      if (origin || !newer(theirs, version)) return send(res, 409, { error: 'Only a newer Inspeck can take over' })
      log(`Inspeck ${theirs} has started: handing it the port and sharing its inbox.`)
      res.on('finish', () => {
        server.close()
        server.closeIdleConnections()
        /* If that one goes away, take the port back. */
        setTimeout(attempt, RETRY_MS).unref()
      })
      return send(res, 200, { stepping: true })
    }
    if (origin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type')
      /* Chrome asks before a public page (say, staging) may call a local
         address. Only reached for origins already allowed above. */
      if (req.headers['access-control-request-private-network']) {
        res.setHeader('access-control-allow-private-network', 'true')
      }
      res.writeHead(204).end()
      return
    }
    route(req, res, version, onNew).catch((err: Error) => send(res, err instanceof HttpError ? err.status : 400, { error: err.message }))
  })

  return new Promise(resolve => {
    let warned = false
    attempt = () => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE') { log(`Could not listen on ${PORT}: ${err.message}`); resolve(false); return }
        if (!warned) { log(`Port ${PORT} is taken, probably by another Claude session's Inspeck. Sharing its inbox.`); warned = true }
        resolve(false)
        /* An older Inspeck on the port is asked to hand it over; then it's ours in a moment. */
        void handover(version).then(ok => setTimeout(attempt, ok ? 300 : RETRY_MS).unref())
      }
      server.once('error', onError)
      server.listen(PORT, '127.0.0.1', () => {
        server.off('error', onError)
        log(`Listening for comments on http://127.0.0.1:${PORT}`)
        resolve(true)
      })
    }
    attempt()
  })
}
