/* Inspeck for Vite: puts the widget on the pages the dev server serves. Only
 * while serving (`apply: 'serve'`): a build never carries it, so it can't
 * reach production by accident.
 *
 * The widget comes from the Inspeck Claude Code plugin, which serves it on
 * 127.0.0.1:4848 while a Claude session is open. Two things make it work
 * wherever the app is opened:
 *
 *  - It's served through the dev server itself, under /__inspeck/, so the page
 *    loads it from its own address. A browser won't let a page on the
 *    "Network" address (192.168.x.x) or on https load from 127.0.0.1, or asks
 *    first; from the page's own address it never has to.
 *  - The tag goes into every HTML page the dev server sends, not only
 *    index.html: SvelteKit, Astro and other frameworks render their pages on
 *    the server, and Vite's index.html hook never sees those.
 *
 * With no Claude session running, /__inspeck/ answers nothing and the app is
 * unaffected.
 *
 * A dev server started with --host is open to the whole network, and so would
 * /__inspeck/ be: someone else on the Wi-Fi could read your notes. So it
 * answers only this computer (see `fromThisMachine`), whatever the dev server
 * listens on; another device still sees the app, just without Inspeck.
 *
 * No dependency on Vite's types: the plugin is a plain object Vite accepts, so
 * this package installs with nothing else.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostname, networkInterfaces } from 'node:os'

export interface InspeckOptions {
  /** Where the Inspeck plugin serves the widget. Default 4848, or INSPECK_PORT if set. */
  port?: number
  /** Turn the tag off without removing the plugin, e.g. `enabled: !process.env.CI`. Default true. */
  enabled?: boolean
}

interface HtmlTag {
  tag: string
  attrs: Record<string, string | boolean>
  injectTo: 'body'
}

type Next = (err?: unknown) => void
type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void

export interface InspeckVitePlugin {
  name: 'inspeck'
  apply: 'serve'
  config(): { server: { proxy: Record<string, unknown> } }
  configureServer(server: { middlewares: { use(fn: Middleware): void } }): void
  transformIndexHtml(): HtmlTag[]
}

/** Where the widget and the plugin's API are reached through the dev server. */
export const PREFIX = '/__inspeck'
const SRC = `${PREFIX}/inspeck.js`

const envPort = (): number | undefined => {
  const raw = typeof process !== 'undefined' ? process.env?.INSPECK_PORT : undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined
}

/** The page with the widget's tag before </body> (at the end if it has none), unless it has one already. */
export function withTag(html: string): string {
  if (html.includes('inspeck.js')) return html
  const tag = `<script src="${SRC}" async></script>`
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i)
}

/** This computer's own addresses (127.0.0.1, and each network address it has), lower case, without brackets. */
function ownAddresses(): Set<string> {
  const out = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) {
    out.add(a.address.toLowerCase())
    if (a.family === 'IPv4') out.add(`::ffff:${a.address}`)
  }
  return out
}

/** Whether a request to /__inspeck/ comes from a browser on this computer, at an address that names it.
    The connection must come from one of this computer's own addresses (only this computer can do that), and
    the address in the browser must be this computer too, so a site that points its own name here (DNS
    rebinding) gets nothing. */
export function fromThisMachine(remote: string | undefined, host: string | undefined): boolean {
  const own = ownAddresses()
  if (!remote || !own.has(remote.toLowerCase())) return false
  const name = (host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!name) return false
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.test') || own.has(name)) return true
  const me = hostname().toLowerCase().replace(/\.local$/, '')
  return name === me || name === `${me}.local`
}

/** Guard /__inspeck/: only this computer, and the page's address goes along as its Origin, so Inspeck can
    tell which site's notes it may show (a same-site request carries none of its own). */
const guard: Middleware = (req, res, next) => {
  if (!req.url?.startsWith(`${PREFIX}/`) && req.url !== PREFIX) return next()
  if (!fromThisMachine(req.socket.remoteAddress, req.headers.host)) {
    res.statusCode = 403
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Inspeck answers only on the computer running it' }))
    return
  }
  if (!req.headers.origin && req.headers.host) {
    const secure = (req.socket as { encrypted?: boolean }).encrypted
    req.headers.origin = `${secure ? 'https' : 'http'}://${req.headers.host}`
  }
  next()
}

const isHtml = (res: ServerResponse) => /text\/html/i.test(String(res.getHeader('content-type') ?? ''))

/**
 * Add the tag to HTML responses, whoever renders them. The response is held back while it's written and
 * finished with the tag in it; anything that isn't HTML passes straight through.
 */
const injectHtml: Middleware = (req, res, next) => {
  if (req.method !== 'GET' || !/text\/html|\*\/\*/.test(req.headers.accept ?? '')) return next()
  const write = res.write.bind(res) as (...a: unknown[]) => boolean
  const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse
  const writeHead = res.writeHead.bind(res) as (...a: unknown[]) => ServerResponse
  const chunks: Buffer[] = []
  let html: boolean | null = null
  const holding = () => (html ??= isHtml(res))
  /* Frameworks write text, Buffers, or plain bytes (Astro and SvelteKit write Uint8Arrays). */
  const toBuffer = (chunk: unknown, enc?: unknown) =>
    Buffer.isBuffer(chunk) ? chunk
    : ArrayBuffer.isView(chunk) ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    : chunk instanceof ArrayBuffer ? Buffer.from(chunk)
    : Buffer.from(String(chunk), typeof enc === 'string' ? enc as BufferEncoding : 'utf8')
  /* A length sent ahead would be wrong once the tag is in. */
  res.writeHead = ((status: number, ...rest: unknown[]) => {
    const headers = rest.find(r => r && typeof r === 'object') as Record<string, unknown> | undefined
    if (headers && !Array.isArray(headers)) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-type' && /text\/html/i.test(String(headers[k]))) html = true
      if (html) for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-length') delete headers[k]
    }
    if (holding()) res.removeHeader('content-length')
    return writeHead(status, ...rest)
  }) as typeof res.writeHead
  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (!holding()) return write(chunk, ...rest)
    if (chunk != null) chunks.push(toBuffer(chunk, rest[0]))
    const cb = rest.find(r => typeof r === 'function') as (() => void) | undefined
    cb?.()
    return true
  }) as typeof res.write
  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (!holding()) return end(chunk, ...rest)
    if (chunk != null && typeof chunk !== 'function') chunks.push(toBuffer(chunk, rest[0]))
    const body = withTag(Buffer.concat(chunks).toString('utf8'))
    if (!res.headersSent) res.setHeader('content-length', Buffer.byteLength(body))
    const cb = [chunk, ...rest].find(r => typeof r === 'function') as (() => void) | undefined
    return end(body, cb)
  }) as typeof res.end
  next()
}

export default function inspeck(options: InspeckOptions = {}): InspeckVitePlugin {
  const port = options.port ?? envPort() ?? 4848
  const enabled = options.enabled ?? true
  return {
    name: 'inspeck',
    apply: 'serve',
    /* /__inspeck/… on the dev server is Inspeck on 127.0.0.1. The Host it sees is its own, so it answers;
       the page's Origin goes along, and the plugin checks that's this machine. */
    config: () => ({
      server: {
        proxy: enabled ? {
          [PREFIX]: { target: `http://127.0.0.1:${port}`, changeOrigin: true, rewrite: (p: string) => p.slice(PREFIX.length) || '/' },
        } : {},
      },
    }),
    /* Before Vite's own middleware, so every page passes through it, server-rendered ones included. */
    configureServer: server => { if (enabled) { server.middlewares.use(guard); server.middlewares.use(injectHtml) } },
    /* An index.html app gets the tag here too (the middleware then sees it and leaves the page alone). */
    transformIndexHtml: () => enabled ? [{ tag: 'script', attrs: { src: SRC, async: true }, injectTo: 'body' }] : [],
  }
}

export { inspeck }
