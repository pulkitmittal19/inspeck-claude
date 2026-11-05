/* What counts as one project (a monorepo's packages, yes; a git worktree and the main checkout around it, no; a
 * submodule, with the repository around it), and closed notes going after 30 days, as the README promises. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'inspeck-projects-home-'))
process.env.INSPECK_HOME = home
let sessions, store

before(async () => {
  const out = mkdtempSync(join(tmpdir(), 'inspeck-projects-'))
  const bundle = async entry => {
    const file = join(out, entry.replace(/\W/g, '_') + '.mjs')
    await build({ entryPoints: [join(root, entry)], outfile: file, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' })
    return import(pathToFileURL(file).href)
  }
  sessions = await bundle('server/src/sessions.ts')
  store = await bundle('server/src/store.ts')
})

/** A repository as git lays it out: a main checkout with a .git folder, a worktree inside it as Claude makes them
    (.claude/worktrees/<name>, its .git a file pointing into the main repository's worktrees), and a submodule. */
function repo() {
  const r = realpathSync(mkdtempSync(join(tmpdir(), 'inspeck-repo-')))
  mkdirSync(join(r, '.git', 'worktrees', 'brave-lovelace'), { recursive: true })
  mkdirSync(join(r, 'apps', 'web'), { recursive: true })
  const wt = join(r, '.claude', 'worktrees', 'brave-lovelace')
  mkdirSync(join(wt, 'apps', 'web'), { recursive: true })
  writeFileSync(join(wt, '.git'), `gitdir: ${join(r, '.git', 'worktrees', 'brave-lovelace')}\n`)
  const wt2 = join(r, '.claude', 'worktrees', 'calm-turing')
  mkdirSync(wt2, { recursive: true })
  writeFileSync(join(wt2, '.git'), `gitdir: ${join(r, '.git', 'worktrees', 'calm-turing')}\n`)
  const sub = join(r, 'vendor', 'ui')
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(sub, '.git'), 'gitdir: ../../.git/modules/vendor/ui\n')
  return { r, wt, wt2, sub }
}

test('a monorepo\'s root and its packages are one project; unrelated folders aren\'t', () => {
  const { r } = repo()
  assert.equal(sessions.sameProject(r, join(r, 'apps', 'web')), true)
  assert.equal(sessions.sameProject(join(r, 'apps', 'web'), r), true)
  assert.equal(sessions.sameProject(r, realpathSync(tmpdir())), true, 'a folder above counts (a chat opened there)')
  assert.equal(sessions.sameProject(join(r, 'apps'), join(r, '.claude')), false, 'siblings')
})

test('a worktree is its own project: not the main checkout around it, nor another worktree; its own folders are', () => {
  const { r, wt, wt2 } = repo()
  assert.equal(sessions.worktreeOf(r), null)
  assert.equal(sessions.worktreeOf(join(wt, 'apps', 'web')), wt)
  assert.equal(sessions.sameProject(r, wt), false, 'main checkout vs its worktree')
  assert.equal(sessions.sameProject(r, join(wt, 'apps', 'web')), false)
  assert.equal(sessions.sameProject(wt, wt2), false, 'two worktrees')
  assert.equal(sessions.sameProject(wt, join(wt, 'apps', 'web')), true, 'within the worktree')
})

test('a submodule goes with the repository around it (its .git file points to modules, not worktrees)', () => {
  const { r, sub } = repo()
  assert.equal(sessions.worktreeOf(sub), null)
  assert.equal(sessions.sameProject(r, sub), true)
})

test('closed notes are deleted 30 days after they were closed, with their screenshots; open ones never', () => {
  const day = 24 * 3600 * 1000
  const ago = d => new Date(Date.now() - d * day).toISOString()
  mkdirSync(join(home, 'shots'), { recursive: true })
  const shot = join(home, 'shots', 'old.png')
  writeFileSync(shot, 'x')
  const note = (id, extra) => ({ id, n: 1, kind: 'fix', status: 'new', note: id, page: 'http://localhost:5173/', createdAt: ago(40), element: { selector: '#a', tag: 'div' }, measured: [], thread: [], ...extra })
  writeFileSync(join(home, 'inbox.json'), JSON.stringify({ version: 1, comments: [
    note('closed-31-days', { status: 'resolved', outcome: { summary: 'done', at: ago(31) }, screenshot: shot }),
    note('closed-29-days', { status: 'dismissed', outcome: { summary: 'no', at: ago(29) } }),
    note('open-40-days', {}),
  ] }))
  /* Any change to the inbox tidies it. */
  store.add({ note: 'a new one', page: 'http://localhost:5174/', element: { selector: '#b', tag: 'div' } })
  const ids = JSON.parse(readFileSync(join(home, 'inbox.json'), 'utf8')).comments.map(c => c.id)
  assert.ok(!ids.includes('closed-31-days'), 'gone after 30 days')
  assert.ok(ids.includes('closed-29-days'), 'kept before 30 days')
  assert.ok(ids.includes('open-40-days'), 'an open note is never deleted, however old')
  assert.equal(existsSync(shot), false, 'its screenshot went too')
})
