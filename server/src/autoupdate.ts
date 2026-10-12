/* Keeping Inspeck up to date, for everyone.
 *
 * Claude Code updates a plugin by itself only when its marketplace is set to
 * auto-update, and a marketplace can't set that for itself. `npx inspeck init`
 * sets it in the person's settings; people who added Inspeck from /plugin
 * instead never ran that. So the first time an installed Inspeck runs, it sets
 * it here, the same way, and says so once in the chat.
 *
 * Only once, ever: a flag in Inspeck's folder remembers it was done, so if the
 * person turns auto-update off afterwards, it stays off. A switch already set
 * either way (in the settings, or in Claude's list of marketplaces) is left as it is. And only for an
 * installed copy from the GitHub marketplace (Claude says where a plugin runs
 * from), never for a copy run from a checkout.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { HOME } from './store.js'

const MARKETPLACE_NAME = 'inspeck'
const MARKETPLACE = 'pulkitmittal19/inspeck-claude'
const FLAG = () => join(HOME, 'auto-update-set')
const configDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const settingsFile = () => join(configDir(), 'settings.json')

/** What Claude's own list of marketplaces says about Inspeck's: a switch the person set in /plugin, or another source. */
function listed(): 'on' | 'off' | 'other' | null {
  try {
    const entry = JSON.parse(readFileSync(join(configDir(), 'plugins', 'known_marketplaces.json'), 'utf8'))?.[MARKETPLACE_NAME]
    if (!entry) return null
    if (entry.source && !(entry.source.source === 'github' && entry.source.repo === MARKETPLACE)) return 'other'
    return entry.autoUpdate === true ? 'on' : entry.autoUpdate === false ? 'off' : null
  } catch {
    return null
  }
}

/** The settings with Inspeck's marketplace set to auto-update (the same change `npx inspeck init` makes).
    'other': there from another source (a local folder), left alone. 'manual': not readable as settings. */
export function withAutoUpdate(src: string | null): { src: string; result: 'added' | 'present' | 'off' | 'other' | 'manual' } {
  let settings: Record<string, any>
  try { settings = src?.trim() ? JSON.parse(src) : {} } catch { return { src: src ?? '', result: 'manual' } }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { src: src ?? '', result: 'manual' }
  const known = settings.extraKnownMarketplaces ?? {}
  if (typeof known !== 'object' || Array.isArray(known)) return { src: src ?? '', result: 'manual' }
  const entry = known[MARKETPLACE_NAME]
  const ours = !entry?.source || (entry.source.source === 'github' && entry.source.repo === MARKETPLACE)
  if (!ours) return { src: src ?? '', result: 'other' }
  if (entry?.autoUpdate === true) return { src: src ?? '', result: 'present' }
  if (entry?.autoUpdate === false) return { src: src ?? '', result: 'off' }
  known[MARKETPLACE_NAME] = { ...entry, source: { source: 'github', repo: MARKETPLACE }, autoUpdate: true }
  settings.extraKnownMarketplaces = known
  return { src: JSON.stringify(settings, null, 2) + '\n', result: 'added' }
}

/** Turn auto-update on if this is an installed Inspeck that has never done it. True when it was turned on just now. */
export function keepUpToDate(): boolean {
  const root = process.env.CLAUDE_PLUGIN_ROOT ?? ''
  if (!/[\\/]plugins[\\/]cache[\\/]/.test(root)) return false
  if (existsSync(FLAG())) return false
  try {
    const file = settingsFile()
    const set = listed()
    const { src, result } = set ? { src: '', result: set } : withAutoUpdate(existsSync(file) ? readFileSync(file, 'utf8') : null)
    if (result === 'added') {
      /* Written beside it and moved into place, so Claude never reads half a file. */
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(`${file}.inspeck-tmp`, src)
      renameSync(`${file}.inspeck-tmp`, file)
    }
    mkdirSync(HOME, { recursive: true })
    writeFileSync(FLAG(), `${new Date().toISOString()} ${result}\n`)
    return result === 'added'
  } catch {
    return false
  }
}
