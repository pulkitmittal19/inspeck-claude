/* Counting installs, so we know Inspeck is used and which versions are out there. Nothing else.
 *
 * Each Mac makes up a random id, tells PostHog once that it's new, and then twice a week that it's still here,
 * with that id, the version, and how it was installed. Never a note, a page address, a file path, code, or anything
 * about the person; PostHog is told not to look up a location. The README says the same; keep them in step.
 *
 * Only an install that keeps itself current does this (see keepCurrent), so not a checkout someone is working on.
 * Off with INSPECK_TELEMETRY=off, DO_NOT_TRACK=1, or a file ~/.inspeck/telemetry-off (the Claude desktop app
 * doesn't read shell profiles, so a file is the one switch that works everywhere).
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME } from './store.js'

/** PostHog's project key: it can only send events, never read them, and is meant to be public. */
const KEY = 'phc_qhCwzGBjT45ap9Htagx9ne5KXXtuheQoZ52kvTeWiSGo'
const ENDPOINT = process.env.INSPECK_TELEMETRY_URL ?? 'https://us.i.posthog.com/capture/'
/** Twice a week, as with looking for a new version. */
const EVERY_MS = 3.5 * 24 * 3600 * 1000
const FILE = () => join(HOME, 'telemetry.json')

interface Kept { id: string; told?: boolean; lastActive?: number }

function off(): boolean {
  const on = (v?: string) => !!v && v !== '0' && v.toLowerCase() !== 'false'
  const said = (process.env.INSPECK_TELEMETRY ?? '').toLowerCase()
  return said === 'off' || said === '0' || said === 'false' || on(process.env.DO_NOT_TRACK) || existsSync(join(HOME, 'telemetry-off'))
}

const read = (): Kept | null => { try { const k = JSON.parse(readFileSync(FILE(), 'utf8')); return typeof k?.id === 'string' ? k : null } catch { return null } }
const write = (k: Kept) => { try { mkdirSync(HOME, { recursive: true }); writeFileSync(FILE(), JSON.stringify(k, null, 2)) } catch { /* the next tick tries again */ } }

async function send(event: string, id: string, version: string, install: string): Promise<boolean> {
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: KEY, event, distinct_id: id, properties: { version, install, surface: 'plugin', $process_person_profile: false, $geoip_disable: true } }),
    })
    return r.ok
  } catch { return false }
}

/** Called on each tick. Never throws. All of a Mac's chats share one record, so they count as one install. */
export async function countInstall(version: string, install: string): Promise<void> {
  if (off()) return
  const kept = read() ?? { id: randomBytes(16).toString('hex') }
  /* Written before sending, so chats starting together don't all send; put back if it didn't go, to try again. */
  if (!kept.told) {
    write({ ...kept, told: true })
    if (!await send('inspeck_installed', kept.id, version, install)) return write({ ...kept, told: false })
    kept.told = true
  }
  if (Date.now() - (kept.lastActive ?? 0) < EVERY_MS) return
  write({ ...kept, lastActive: Date.now() })
  if (!await send('inspeck_active', kept.id, version, install)) write(kept)
}
