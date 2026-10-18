/* Saying when a newer Inspeck is out, and offering to install it.
 *
 * Claude Code updates a plugin by itself only from a marketplace set to
 * auto-update, which a GitHub one like Inspeck's isn't until the person turns
 * it on, and a plugin mustn't change their settings for them. So Inspeck asks
 * instead:
 *
 *   - Once a day it reads the latest version number from GitHub: one small
 *     request, sending nothing about the person. Offline, it just tries again
 *     the next day.
 *   - When a newer one is out, Inspeck's Settings say so, and Claude offers
 *     once in the chat to install it. A "no" holds for that version.
 *
 * Off with Settings › Check for updates, or INSPECK_LATEST_URL=off.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME } from './store.js'

const LATEST_URL = process.env.INSPECK_LATEST_URL ?? 'https://raw.githubusercontent.com/pulkitmittal19/inspeck-claude/main/.claude-plugin/plugin.json'
const DAY_MS = 24 * 3600 * 1000
const LATEST = () => join(HOME, 'latest.json')
const OFFERED = () => join(HOME, 'plugin-update-offered.json')

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

/** Whether the person has turned the check off. */
function off(): boolean {
  return LATEST_URL === 'off' || !LATEST_URL || readJson(join(HOME, 'settings.json'))?.updates === 'off'
}

/** Look for a newer Inspeck, at most once a day. Never throws, never waits on anything but the request. */
export async function checkDaily(): Promise<void> {
  if (off()) return
  const kept = readJson(LATEST())
  if (kept?.checkedAt && Date.now() - Date.parse(kept.checkedAt) < DAY_MS) return
  let version: string | undefined = kept?.version
  try {
    const r = await fetch(LATEST_URL, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    const v = r.ok ? (await r.json() as { version?: unknown }).version : undefined
    if (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)) version = v
  } catch { /* offline: tomorrow */ }
  writeJson(LATEST(), { checkedAt: new Date().toISOString(), ...(version ? { version } : {}) })
}

/** The newest Inspeck known to be out, if it's newer than this one. */
export function newerOut(current: string): string | null {
  if (off()) return null
  const v = readJson(LATEST())?.version
  return typeof v === 'string' && newer(v, current) ? v : null
}

/** For Settings: this version, and a newer one if there is. */
export function updateState(current: string): { version: string; latest: string | null; checking: boolean } {
  return { version: current, latest: newerOut(current), checking: !off() }
}

/** A newer Inspeck Claude hasn't offered yet: remembered as offered, so it's offered once per version. */
export function offerOnce(current: string): string | null {
  const latest = newerOut(current)
  if (!latest || readJson(OFFERED())?.version === latest) return null
  writeJson(OFFERED(), { version: latest, at: new Date().toISOString() })
  return latest
}
