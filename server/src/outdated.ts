/* The `inspeck` npm package in a project (the Vite plugin, `npx inspeck init`) is a dependency of that
 * project: nothing updates it by itself. Since 0.11.0 it's a thin pass-through (and since 0.12.0 it answers only this computer) and everything that
 * changes lives in this plugin, which does update itself; so a project only needs bringing up to date
 * once. When a chat opens in a project still on an older one, Claude is asked to offer that, once.
 *
 * Once per project for each version needed: a note in Inspeck's folder remembers it was offered, so a "no"
 * is respected until a newer fix needs a newer package.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HOME } from './store.js'

/** The first version that's a pass-through (see above), with its forwarding closed to other devices on the network. */
export const NEEDED = '0.12.0'
const OFFERED = () => join(HOME, 'package-update-offered.json')
/** What the offer is remembered under: the project, and the version it was offered for. */
const offerKey = (dir: string) => `${dir} ${NEEDED}`

export interface Outdated { dir: string; version: string; command: string }

const older = (a: string, b: string) => {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0), pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  return false
}

const readJson = (p: string): Record<string, any> | null => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo', '.git'])

/** The folders a project's package.json files may be in: this one and two levels down (a monorepo's
    apps/admin, a folder holding a project like neo-prototype/jc-neo/next), skipping builds and modules. */
function candidates(cwd: string): string[] {
  const out = [cwd]
  let level = [cwd]
  for (let depth = 0; depth < 2 && out.length < 80; depth++) {
    const next: string[] = []
    for (const dir of level) {
      try {
        for (const d of readdirSync(dir, { withFileTypes: true })) {
          if (d.isDirectory() && !SKIP.has(d.name) && !d.name.startsWith('.')) next.push(join(dir, d.name))
        }
      } catch { /* unreadable */ }
    }
    out.push(...next)
    level = next
  }
  return out.slice(0, 80)
}

/** The version a project really has: what's installed, else the lowest its package.json allows. */
function versionIn(dir: string, spec: string): string | null {
  const installed = readJson(join(dir, 'node_modules', 'inspeck', 'package.json'))?.version
  if (typeof installed === 'string') return installed
  return /(\d+\.\d+\.\d+)/.exec(spec)?.[1] ?? null
}

/** The command that adds the latest, in the project's own package manager (from its lockfile, here or above). */
function updateCommand(dir: string): string {
  for (let d = dir, i = 0; i < 5; i++, d = dirname(d)) {
    if (existsSync(join(d, 'pnpm-lock.yaml'))) return `pnpm add -D inspeck@latest`
    if (existsSync(join(d, 'yarn.lock'))) return `yarn add -D inspeck@latest`
    if (existsSync(join(d, 'bun.lockb')) || existsSync(join(d, 'bun.lock'))) return `bun add -d inspeck@latest`
    if (existsSync(join(d, 'package-lock.json'))) break
    if (dirname(d) === d) break
  }
  return `npm install -D inspeck@latest`
}

/** A project under this folder still on an inspeck package older than NEEDED, not offered an update yet. */
export function outdatedPackage(cwd: string): Outdated | null {
  const offered = readJson(OFFERED()) ?? {}
  for (const dir of candidates(cwd)) {
    const pkg = readJson(join(dir, 'package.json'))
    const spec = pkg?.devDependencies?.inspeck ?? pkg?.dependencies?.inspeck
    if (typeof spec !== 'string' || /^(file:|link:|workspace:|git|https?:)/.test(spec)) continue
    const version = versionIn(dir, spec)
    if (!version || !older(version, NEEDED) || offered[offerKey(dir)]) continue
    return { dir, version, command: updateCommand(dir) }
  }
  return null
}

/** Remember it was offered for this project, so it's offered once. */
export function markOffered(dir: string): void {
  try {
    const offered = readJson(OFFERED()) ?? {}
    offered[offerKey(dir)] = new Date().toISOString()
    mkdirSync(HOME, { recursive: true })
    writeFileSync(OFFERED(), JSON.stringify(offered, null, 2))
  } catch { /* can't remember: it may be offered again */ }
}
