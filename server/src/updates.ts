/* Keeping Inspeck up to date, without anyone having to think about it.
 *
 * Installed with `npx inspeck init`, Claude Code's own auto-update is on for Inspeck's marketplace: Claude
 * Code fetches new versions itself, and this does nothing. Installed any other way, it's off, so Inspeck does
 * the same itself: when a chat starts, at most once a week, it reads the latest version number from GitHub
 * (one small request, sending nothing about the person) and, when there's a newer one, installs it with
 * Claude Code's own commands, in the background. The next chat runs it; notes are kept. Offline, or the
 * install failed: next week.
 *
 * Only an installed copy from Inspeck's GitHub marketplace updates itself: a marketplace that is a folder (a
 * checkout someone is working on) is left alone. Off with INSPECK_AUTO_UPDATE=off, for teams that decide
 * what gets installed.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { HOME } from './store.js'

const run = promisify(execFile)
const REPO = 'pulkitmittal19/inspeck-claude'
const MARKETPLACE = 'inspeck'
const LATEST_URL = process.env.INSPECK_LATEST_URL ?? `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`
const WEEK_MS = 7 * 24 * 3600 * 1000
const LATEST = () => join(HOME, 'latest.json')
const LOCK = () => join(HOME, 'updating.lock')

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

/**
 * Who keeps this copy current: Claude Code (its auto-update is on for the marketplace), Inspeck (an installed
 * copy from the GitHub marketplace), or nobody (a folder marketplace, a checkout, or turned off).
 */
export function updater(config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')): 'claude' | 'inspeck' | 'none' {
  if (process.env.INSPECK_AUTO_UPDATE === 'off' || LATEST_URL === 'off') return 'none'
  if (!(process.env.CLAUDE_PLUGIN_ROOT ?? '').includes(`${join('plugins', 'cache')}`)) return 'none'
  /* /plugin's switch keeps it in the plugins folder; `npx inspeck init` in the settings. */
  const known = readJson(join(config, 'plugins', 'known_marketplaces.json'))?.[MARKETPLACE]
  const extra = readJson(join(config, 'settings.json'))?.extraKnownMarketplaces?.[MARKETPLACE]
  if (known?.autoUpdate === true || extra?.autoUpdate === true) return 'claude'
  const source = known?.source ?? extra?.source
  return source?.source === 'github' && source.repo === REPO ? 'inspeck' : 'none'
}

/** Another chat is installing it right now (a lock younger than ten minutes). */
function busy(): boolean {
  try { return Date.now() - statSync(LOCK()).mtimeMs < 10 * 60_000 } catch { return false }
}

/**
 * When a chat starts: if Inspeck keeps itself current and hasn't looked this week, look, and install a newer
 * version in the background. Never throws; never holds up the chat.
 */
export async function keepCurrent(current: string, claude: string): Promise<'skipped' | 'current' | 'updated' | 'failed'> {
  if (updater() !== 'inspeck') return 'skipped'
  const kept = readJson(LATEST())
  if (kept?.checkedAt && Date.now() - Date.parse(kept.checkedAt) < WEEK_MS) return 'skipped'
  if (busy()) return 'skipped'
  let latest: string | undefined
  try {
    const r = await fetch(LATEST_URL, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    const v = r.ok ? (await r.json() as { version?: unknown }).version : undefined
    if (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)) latest = v
  } catch { /* offline: next week */ }
  if (!latest) { writeJson(LATEST(), { checkedAt: new Date().toISOString() }); return 'failed' }
  if (!newer(latest, current)) { writeJson(LATEST(), { checkedAt: new Date().toISOString(), version: latest }); return 'current' }
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
