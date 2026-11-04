/* An update arriving while pages are open, as it does when a running chat installs one (see updates.ts): a newer
 * Inspeck takes the port, and every open page, on every localhost, swaps to it by itself, but only when Inspeck
 * isn't open there. After the swap, notes, markers, writing and freezing all still work; and when the newer one
 * goes and an older chat's answers again, no page swaps back. */
import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { markers, note, PORT, ready, world } from './hosts-lib.mjs'

const ROOT = join(import.meta.dirname, '..', '..')

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(180_000)

const version = page => page.evaluate(() => window.__INSPECK__?.version ?? null)
const answering = async () => { try { return (await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).version } catch { return null } }

test('a newer Inspeck takes over: open pages on two localhosts swap to it by themselves, never while Inspeck is open there; everything still works after', async ({ context }) => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  const one = await w.chat('one', A.dir)
  await w.up()
  const ours = await answering()
  const pa = await context.newPage(); await pa.goto(A.url); await ready(pa)
  const pb = await context.newPage(); await pb.goto(B.url); await ready(pb)
  await note(pb, '#title', 'placed before the update')
  expect(await markers(pb)).toEqual(['1'])
  await pb.evaluate(() => window.__INSPECK__.app.setOpen(false))

  /* On A, Inspeck is open with a note being written. */
  await pa.evaluate(() => window.__INSPECK__.app.setOpen(true)); await pa.waitForTimeout(450)
  const at = await pa.evaluate(() => { const r = document.querySelector('#buy').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await pa.mouse.move(at.x, at.y, { steps: 2 }); await pa.waitForTimeout(150); await pa.mouse.click(at.x, at.y); await pa.waitForTimeout(400)
  await pa.keyboard.type('half written', { delay: 5 })

  /* The update: a newer Inspeck starts and takes the port. */
  await w.chat('newer', w.app('elsewhere', 5303).dir, { version: '9.9.9' })
  await expect.poll(answering, { timeout: 15_000 }).toBe('9.9.9')

  /* B, with Inspeck closed, swaps by itself; its note's marker comes back. */
  await expect.poll(() => version(pb), { timeout: 15_000 }).toBe('9.9.9')
  await pb.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => markers(pb), { timeout: 8000 }).toEqual(['1'])
  expect(await pb.evaluate(() => document.querySelectorAll('inspeck-root').length), 'one widget on the page').toBe(1)

  /* A doesn't, while Inspeck is open and a note is half written there. */
  await pa.waitForTimeout(6000)
  expect(await version(pa)).toBe(ours)
  expect(await pa.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.card textarea')?.value)).toBe('half written')
  /* Closed, it swaps. */
  for (let i = 0; i < 4 && await pa.evaluate(() => window.__INSPECK__?.app.open); i++) { await pa.keyboard.press('Escape'); await pa.waitForTimeout(400) }
  expect(await pa.evaluate(() => window.__INSPECK__?.app.open ?? false), 'Inspeck closed').toBe(false)
  await expect.poll(() => version(pa), { timeout: 15_000 }).toBe('9.9.9')

  /* After the swap: a new note goes through, and freezing still holds the page's network answers. */
  await note(pa, '#title', 'placed after the update')
  expect(await one.tool('pending')).toContain('placed after the update')
  await pb.evaluate(() => window.__INSPECK__.app.setOpen(true)); await pb.waitForTimeout(300)
  await pb.mouse.move(5, 5); await pb.keyboard.press('f'); await pb.waitForTimeout(300)
  const whileFrozen = await pb.evaluate(() => Promise.race([fetch('/index.html').then(() => 'answered'), new Promise(r => setTimeout(() => r('held'), 1500))]))
  expect(whileFrozen, 'frozen: the answer waits').toBe('held')
  await pb.keyboard.press('f')
  expect(await pb.evaluate(() => fetch('/index.html').then(() => 'answered'))).toBe('answered')
})

test('when the newer Inspeck goes and an older chat\'s answers again, a page that swapped stays on the newer one', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const ours = await answering()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const newer = await w.chat('newer', A.dir, { version: '9.9.9' })
  await expect.poll(() => version(p), { timeout: 20_000 }).toBe('9.9.9')
  await newer.close()
  await expect.poll(answering, { timeout: 15_000 }).toBe(ours)
  await p.waitForTimeout(9000)
  expect(await version(p), 'no swap back to the older one').toBe('9.9.9')
  expect(await p.evaluate(() => document.querySelectorAll('inspeck-root').length)).toBe(1)
})

test('the whole chain, with no new chat: a running chat finds a newer version installed, starts it, and the open page swaps to it', async ({ context }, info) => {
  test.skip(info.project.name !== 'chrome', 'the chain, not the engine')
  const ours = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  /* Claude's plugins folder: Inspeck from its GitHub marketplace, this version and a newer one installed (as an
     update by Claude Code, or by Inspeck itself, leaves it). */
  const config = mkdtempSync(join(tmpdir(), 'inspeck-chain-'))
  const cache = v => join(config, 'plugins', 'cache', 'inspeck', 'inspeck', v)
  mkdirSync(join(cache('9.9.9'), 'server', 'dist', 'widget'), { recursive: true })
  for (const f of ['inspeck.mjs', 'widget/inspeck.js']) writeFileSync(join(cache('9.9.9'), 'server', 'dist', f), readFileSync(join(ROOT, 'server', 'dist', f), 'utf8').split(`"${ours}"`).join('"9.9.9"'))
  writeFileSync(join(config, 'plugins', 'known_marketplaces.json'), JSON.stringify({ inspeck: { source: { source: 'github', repo: 'pulkitmittal19/inspeck-claude' } } }))
  /* GitHub says 9.9.9 too: already installed, so nothing to install, only to serve. */
  const gh = createServer((q, r) => r.end(JSON.stringify({ version: '9.9.9' })))
  await new Promise(r => gh.listen(0, '127.0.0.1', r))
  mkdirSync(w.home, { recursive: true })
  writeFileSync(join(w.home, 'update-check-minutes'), '0.03')
  try {
    const A = w.app('alpha', 5301)
    await w.chat('running', A.dir, { env: { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: cache(ours), INSPECK_LATEST_URL: `http://127.0.0.1:${gh.address().port}/plugin.json`, INSPECK_AUTO_UPDATE: '', DISABLE_AUTOUPDATER: '1', INSPECK_CLAUDE_BIN: '/usr/bin/false' } })
    await w.up()
    const p = await context.newPage(); await p.goto(A.url); await ready(p)
    expect(await version(p)).toBe(ours)
    /* While the chat runs, the newer version gets installed (by Claude Code when another chat starts, or by this one). */
    writeFileSync(join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'inspeck@inspeck': [{ scope: 'user', installPath: cache('9.9.9'), version: '9.9.9' }] } }))
    await expect.poll(answering, { timeout: 20_000, message: 'the newer one answers pages' }).toBe('9.9.9')
    await expect.poll(() => version(p), { timeout: 15_000, message: 'and the open page swapped to it' }).toBe('9.9.9')
    await note(p, '#title', 'through the newer one')
    expect(await markers(p)).toEqual(['1'])
  } finally {
    gh.close()
    try { process.kill(JSON.parse(readFileSync(join(w.home, 'serving.json'), 'utf8')).pid) } catch { /* gone */ }
    rmSync(config, { recursive: true, force: true })
  }
})
