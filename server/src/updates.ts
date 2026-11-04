/* Keeping Inspeck up to date, without anyone having to think about it.
 *
 * A chat runs the Inspeck that was installed when it started (measured: Claude Code never swaps a running
 * chat's plugin server, not on its own reload nor on /reload-plugins), and Claude Code only downloads a new
 * version when a chat starts or restarts. So Inspeck does two things itself, in every chat, quietly:
 *
 *   - It looks for a newer version on GitHub at most twice a week per Mac (all chats share one note of the
 *     last look): when a chat starts, and while it keeps running. One small request, sending nothing about
 *     the person. When there's a newer one, it installs it with Claude Code's own commands, in the background.
 *   - When a newer version is installed than the one this chat runs (installed by this, by Claude Code, or by
 *     the person), it starts that version to answer pages, unless one that new already does. It takes the
 *     port from the older ones, so every page on every localhost gets the newest widget, which swaps itself
 *     in when Inspeck isn't in use. Chats keep working as they are, on the same notes.
 *
 * Only an installed copy from Inspeck's GitHub marketplace does this: a marketplace that is a folder (a
 * checkout someone is working on) is left alone. Off with INSPECK_AUTO_UPDATE=off, or with Claude Code's
 * DISABLE_UPDATES or CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC. Not with DISABLE_AUTOUPDATER: the Claude desktop
 * app sets that for everything it starts, Inspeck included (it updates Claude Code itself), so it says nothing
 * about the person's wishes (measured; Claude Code updates plugins there all the same).
 *
 * For trying it on one Mac: a number in ~/.inspeck/update-check-minutes replaces twice a week with that many
 * minutes. It's read on every tick, so a chat that's already open picks it up.
 */
import { execFile, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { HOME } from './store.js'

const run = promisify(execFile)
const REPO = 'pulkitmittal19/inspeck-claude'
const MARKETPLACE = 'inspeck'
const LATEST_URL = process.env.INSPECK_LATEST_URL ?? `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`
/** Twice a week. */
const CHECK_EVERY_MS = 3.5 * 24 * 3600 * 1000
/** How often a running chat sees whether a look is due, or a newer version is waiting to answer pages. */
const TICK_MS = 10 * 60 * 1000
const LATEST = () => join(HOME, 'latest.json')
const LOCK = () => join(HOME, 'updating.lock')
const SERVING = () => join(HOME, 'serving.json')
const configDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

const readJson = (p: string): Record<string, any> | null => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const writeJson = (p: string, v: unknown) => { try { mkdirSync(HOME, { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2)) } catch { /* only a reminder */ } }

/** Whether version a is newer than b ("0.18.0" > "0.17.1"). */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN) || !pa.length) return false
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/** The person has turned updates off, Inspeck's or Claude Code's. */
function turnedOff(): boolean {
  const on = (v?: string) => !!v && v !== '0' && v.toLowerCase() !== 'false'
  if (process.env.INSPECK_AUTO_UPDATE === 'off' || LATEST_URL === 'off') return true
  const claudeOff = on(process.env.DISABLE_UPDATES) || on(process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
  return claudeOff && !on(process.env.FORCE_AUTOUPDATE_PLUGINS)
}

/** Whether this copy keeps itself current: an installed copy from the GitHub marketplace, not turned off. */
export function updater(config = configDir()): 'inspeck' | 'none' {
  if (turnedOff()) return 'none'
  if (!(process.env.CLAUDE_PLUGIN_ROOT ?? '').includes(`${join('plugins', 'cache')}`)) return 'none'
  /* /plugin keeps the marketplace in the plugins folder; `npx inspeck init` in the settings too. */
  const known = readJson(join(config, 'plugins', 'known_marketplaces.json'))?.[MARKETPLACE]
  const extra = readJson(join(config, 'settings.json'))?.extraKnownMarketplaces?.[MARKETPLACE]
  const source = known?.source ?? extra?.source
  return source?.source === 'github' && source.repo === REPO ? 'inspeck' : 'none'
}

/** The newest Inspeck Claude Code has installed, and where (from its record of installs). */
export function installed(config = configDir()): { version: string; path: string } | null {
  const entries = readJson(join(config, 'plugins', 'installed_plugins.json'))?.plugins?.[`inspeck@${MARKETPLACE}`]
  if (!Array.isArray(entries)) return null
  let best: { version: string; path: string } | null = null
  for (const e of entries) {
    if (typeof e?.version !== 'string' || typeof e?.installPath !== 'string') continue
    try { statSync(join(e.installPath, 'server', 'dist', 'inspeck.mjs')) } catch { continue }
    if (!best || newer(e.version, best.version)) best = { version: e.version, path: e.installPath }
  }
  return best
}

/** How long between looks: twice a week, or the minutes set for trying it on this Mac. */
function checkEvery(): number {
  try {
    const minutes = Number(readFileSync(join(HOME, 'update-check-minutes'), 'utf8').trim())
    if (minutes > 0) return minutes * 60_000
  } catch { /* not set */ }
  return CHECK_EVERY_MS
}

/** Another chat is installing it right now (a lock younger than ten minutes). */
function busy(): boolean {
  try { return Date.now() - statSync(LOCK()).mtimeMs < 10 * 60_000 } catch { return false }
}

/** A look on GitHub, if one is due, and an install if there's a newer version than the one installed. */
export async function checkNow(current: string, claude: string): Promise<'skipped' | 'current' | 'updated' | 'failed'> {
  const kept = readJson(LATEST())
  if (kept?.checkedAt && Date.now() - Date.parse(kept.checkedAt) < checkEvery()) return 'skipped'
  if (busy()) return 'skipped'
  let latest: string | undefined
  try {
    const r = await fetch(LATEST_URL, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    const v = r.ok ? (await r.json() as { version?: unknown }).version : undefined
    if (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)) latest = v
  } catch { /* offline: at the next look */ }
  if (!latest) { writeJson(LATEST(), { checkedAt: new Date().toISOString() }); return 'failed' }
  /* Already installed (by Claude Code, or another chat): nothing to install, only to serve. */
  const have = installed()?.version ?? current
  if (!newer(latest, have)) { writeJson(LATEST(), { checkedAt: new Date().toISOString(), version: latest }); return 'current' }
  writeJson(LOCK(), { pid: process.pid, at: new Date().toISOString() })
  try {
    await run(claude, ['plugin', 'marketplace', 'update', MARKETPLACE], { timeout: 120_000 })
    await run(claude, ['plugin', 'update', `inspeck@${MARKETPLACE}`], { timeout: 120_000 })
    writeJson(LATEST(), { checkedAt: new Date().toISOString(), version: latest, installed: latest })
    return 'updated'
  } catch {
    writeJson(LATEST(), { checkedAt: new Date().toISOString(), version: latest })
    return 'failed'
  } finally {
    try { rmSync(LOCK(), { force: true }) } catch { /* gone */ }
  }
}

const alive = (pid: unknown) => { try { process.kill(Number(pid), 0); return true } catch { return false } }

/**
 * A newer installed Inspeck than the one answering pages: start it to answer them (`inspeck.mjs serve`), once
 * per Mac. It takes the port from the older ones and goes when no chat is left (see serve in index.ts).
 */
export async function serveNewer(port: number, log: (msg: string) => void): Promise<string | null> {
  const ready = installed()
  if (!ready) return null
  let answering: string | undefined
  try { answering = ((await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })).json()) as { version?: string }).version } catch { /* nobody */ }
  if (answering && !newer(ready.version, answering)) return null
  const serving = readJson(SERVING())
  if (serving && alive(serving.pid) && !newer(ready.version, String(serving.version))) return null
  const kid = spawn(process.execPath, [join(ready.path, 'server', 'dist', 'inspeck.mjs'), 'serve'], { detached: true, stdio: 'ignore', env: { ...process.env, CLAUDE_PLUGIN_ROOT: ready.path } })
  kid.unref()
  writeJson(SERVING(), { pid: kid.pid, version: ready.version, at: new Date().toISOString() })
  log(`Inspeck ${ready.version} is installed: started it to answer pages.`)
  return ready.version
}

/**
 * In every chat: a look when it starts, then a tick every ten minutes (or sooner, when trying it out with a few
 * minutes) that looks when one is due and serves a newer installed version. Never throws; never holds up the chat.
 */
export function keepCurrent(current: string, claude: string, port: number, log: (msg: string) => void): void {
  if (updater() !== 'inspeck') return
  let going = false
  const tick = async () => {
    if (going) return
    going = true
    try {
      await checkNow(current, claude)
      const v = installed()?.version
      if (v && newer(v, current)) await serveNewer(port, log)
    } catch { /* at the next tick */ } finally { going = false }
  }
  void tick()
  const every = () => Math.max(1000, Math.min(TICK_MS, checkEvery() / 2))
  const next = () => setTimeout(() => { void tick().finally(next) }, every()).unref()
  next()
}
