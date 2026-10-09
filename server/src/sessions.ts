/* Which Claude session a note belongs to.
 *
 * Every Claude Code session is one `claude` process. Its MCP servers (this
 * plugin) and the commands it runs (the `wait` watcher) are both its children,
 * so "my nearest claude ancestor" names the session from either side.
 *
 * Each session registers itself in ~/.inspeck/sessions/<pid>.json with its
 * project folder and a short code. A browser tab is bound to a session when
 * Claude hands that code to the widget in its own pane (the `bind` tool).
 *
 * A site can be linked too (`site:http://localhost:5180`): that's how a page in
 * an ordinary browser, which Claude can't hand a code to, finds its session.
 * The link is made when a session takes notes nobody else could, or by `bind`
 * with the page's address.
 *
 * A note from a tab that isn't bound, on a site that isn't linked, is routed by
 * elimination:
 *   - only one session open → that one;
 *   - else the project serving the page (the process listening on its port,
 *     and the folder it runs in) → the session opened in that project;
 *   - else nobody yet: it waits, and a session in that project claims it.
 * It never goes to a session in a different project.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, isAbsolute } from 'node:path'
import { HOME } from './store.js'

export interface Session {
  pid: number
  cwd: string
  startedAt: string
  token: string
}

export interface Route {
  /** The session's claude process. */
  pid?: number
  /** The project the note belongs to, when known. */
  cwd?: string
  how: 'bound' | 'site' | 'only' | 'project' | 'waiting' | 'claimed'
}

const DIR = join(HOME, 'sessions')
const BINDINGS = join(HOME, 'bindings.json')

function ps(pid: number): { ppid: number; comm: string } | null {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8', timeout: 1500 }).trim()
    const m = /^(\d+)\s+(.*)$/.exec(out)
    return m ? { ppid: Number(m[1]), comm: m[2] } : null
  } catch { return null }
}

/** This process's Claude session: the nearest ancestor named `claude`. */
export function claudePid(): number | null {
  if (process.env.INSPECK_SESSION_PID) return Number(process.env.INSPECK_SESSION_PID)
  let pid = process.ppid
  for (let i = 0; i < 8 && pid > 1; i++) {
    const p = ps(pid)
    if (!p) return null
    if (basename(p.comm) === 'claude') return pid
    pid = p.ppid
  }
  return null
}

export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(DIR, { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

/** Register this session. Safe to call from every MCP server of the same session. */
export function register(folder: string): Session | null {
  const cwd = real(folder)
  const pid = claudePid()
  if (!pid) return null
  const path = join(DIR, `${pid}.json`)
  const existing = readJson<Session>(path)
  const s: Session = existing && existing.pid === pid
    ? { ...existing, cwd }
    : { pid, cwd, startedAt: new Date().toISOString(), token: randomBytes(9).toString('base64url') }
  writeJson(path, s)
  return s
}

/** Every session whose claude process is still running; stale files are removed. */
export function liveSessions(): Session[] {
  if (!existsSync(DIR)) return []
  const out: Session[] = []
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue
    const s = readJson<Session>(join(DIR, f))
    if (s && alive(s.pid)) out.push(s)
    else rmSync(join(DIR, f), { force: true })
  }
  return out
}

export function sessionOf(pid: number): Session | null {
  return readJson<Session>(join(DIR, `${pid}.json`))
}

/* ---------------- tab bindings ---------------- */

type Bindings = Record<string, { pid: number; at: string }>

export function bindTab(tabId: string, token: string): Session | null {
  const s = liveSessions().find(x => x.token === token)
  if (!s) return null
  saveBinding(tabId, s.pid)
  return s
}

/** The site a page is on, as its link is stored: `site:http://localhost:5180`. */
export function siteKey(page: string): string | null {
  try { return `site:${new URL(page).origin}` } catch { return null }
}

/** Send every later note from this page's site to session `pid`, in any browser. */
export function bindSite(page: string, pid: number): void {
  const key = siteKey(page)
  if (key) saveBinding(key, pid)
}

function saveBinding(key: string, pid: number): void {
  const all = readJson<Bindings>(BINDINGS) ?? {}
  all[key] = { pid, at: new Date().toISOString() }
  /* Keep the newest 200; old tabs are long gone. */
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 200))
  mkdirSync(HOME, { recursive: true })
  const tmp = `${BINDINGS}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(kept, null, 2))
  renameSync(tmp, BINDINGS)
}

function boundPid(tabId: string): number | null {
  const b = (readJson<Bindings>(BINDINGS) ?? {})[tabId]
  return b && alive(b.pid) ? b.pid : null
}

/* ---------------- which project serves a page ---------------- */

/** The folder of the process listening on a local port (the dev server), via lsof. */
export function projectOf(page: string): string | null {
  let port: number
  try {
    const u = new URL(page)
    port = Number(u.port || (u.protocol === 'https:' ? 443 : 80))
  } catch { return null }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  try {
    const pid = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0]
    if (!/^\d+$/.test(pid)) return null
    const out = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 2000 })
    const line = out.split('\n').find(l => l.startsWith('n'))
    return line ? real(line.slice(1)) : null
  } catch { return null }
}

/** A folder with symlinks resolved (/var → /private/var on macOS), so paths from lsof and process.cwd() compare. */
export function real(path: string): string {
  try { return realpathSync(path) } catch { return path }
}

/** True when one folder is inside the other (a monorepo package and its root). */
export function sameProject(a: string, b: string): boolean {
  const inside = (child: string, parent: string) => {
    const r = relative(parent, child)
    return r === '' || (!r.startsWith('..') && !isAbsolute(r))
  }
  a = real(a); b = real(b)
  return inside(a, b) || inside(b, a)
}

export function route(page: string, tabId?: string): Route {
  if (tabId) {
    const pid = boundPid(tabId)
    if (pid) return { pid, cwd: sessionOf(pid)?.cwd, how: 'bound' }
  }
  const site = siteKey(page)
  const sitePid = site ? boundPid(site) : null
  if (sitePid) return { pid: sitePid, cwd: sessionOf(sitePid)?.cwd, how: 'site' }
  const live = liveSessions()
  if (live.length === 1) return { pid: live[0].pid, cwd: live[0].cwd, how: 'only' }
  const cwd = projectOf(page)
  if (cwd) {
    const matches = live.filter(s => sameProject(s.cwd, cwd)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    if (matches.length) return { pid: matches[0].pid, cwd, how: 'project' }
    return { cwd, how: 'waiting' }
  }
  return { how: 'waiting' }
}

/**
 * Whether no open session will ever pick this note up by itself: its session
 * closed (or it never had one) and no session is open in its project. Such a
 * note goes to the first session that asks for its notes.
 */
export function unclaimed(to: Route | undefined, live: Session[] = liveSessions()): boolean {
  if (!to) return false
  if (to.pid && alive(to.pid)) return false
  return !to.cwd || !live.some(s => sameProject(s.cwd, to.cwd!))
}

/** Whether a note routed this way belongs to the session `me` (in folder `myCwd`). */
export function belongsTo(to: Route | undefined, me: number | null, myCwd: string): boolean {
  if (!to) return true
  if (to.pid && to.pid === me) return true
  /* Addressed to a session that is still open: theirs. */
  if (to.pid && alive(to.pid)) return false
  /* Its session closed, or nobody had it yet: any session in the same project may take it.
     With no project known (a page whose server isn't on this machine's ports), only a session
     that asks for its notes takes it (see `unclaimed`), never a watcher by itself. */
  return !!to.cwd && sameProject(myCwd, to.cwd)
}
