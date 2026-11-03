/* A note's whole life, as a person sees it: how notes are numbered as they're placed, deleted, read and closed;
 * and one chat reaching a second localhost, including an app that doesn't load Inspeck itself, with its notes
 * read automatically by the chat's watcher (Auto-send) and on asking (check my notes). */
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { api, deleteNote, markers, note, ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(180_000)

/** The chat's background watcher, as Claude runs it: resolves with what it printed when it hands notes over. */
function watcher(c) {
  const kid = spawn(process.execPath, [join(c.dir, 'inspeck.mjs'), 'wait', '--minutes', '2'], { cwd: c.cwd, env: c.env, stdio: ['ignore', 'pipe', 'ignore'] })
  let out = ''
  kid.stdout.on('data', d => { out += d })
  const done = new Promise(r => kid.on('exit', () => r(out)))
  return { done, stop: () => kid.kill() }
}

test('numbers on a page: a deleted waiting note closes its gap; after Claude reads or closes notes, new ones carry on; another page starts at 1', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const steps = []
  const log = async what => { steps.push(`${what}: ${JSON.stringify(await markers(p))}`) }

  await note(p, '#title', 'first'); await note(p, '#intro', 'second'); await note(p, '#card-title', 'third')
  expect(await markers(p)).toEqual(['1', '2', '3']); await log('three placed')
  await deleteNote(p, 2)
  expect(await markers(p), 'deleting #2 while waiting: #3 becomes #2').toEqual(['1', '2']); await log('#2 deleted')
  await note(p, '#buy', 'fourth')
  expect(await markers(p)).toEqual(['1', '2', '3']); await log('one more placed')

  const read = await c.tool('pending')
  expect(read).toMatch(/Fix 1 ·[\s\S]*first/); expect(read).toMatch(/Fix 2 ·[\s\S]*third/); expect(read).toMatch(/Fix 3 ·[\s\S]*fourth/)
  await expect.poll(() => markers(p), { timeout: 8000 }).toEqual([]); await log('Claude read them')
  await note(p, '#title', 'after reading')
  expect(await markers(p), 'carries on after the ones Claude has, so "Fix 1" in the chat never means two notes').toEqual(['4']); await log('placed after Claude read')

  for (const id of [...read.matchAll(/id ([0-9a-f]{8})/g)].map(m => m[1])) await c.tool('resolve', { id, summary: 'done' })
  await note(p, '#intro', 'after closing')
  expect(await markers(p), 'and after Claude closes them').toEqual(['4', '5']); await log('placed after Claude closed 1–3')
  await deleteNote(p, 5)
  await note(p, '#buy', 'again')
  expect(await markers(p), 'a deleted waiting note frees its number').toEqual(['4', '5']); await log('#5 deleted, one placed')

  const q = await context.newPage(); await q.goto(A.url + '/second.html'); await ready(q)
  await note(q, '#title', 'other page')
  expect(await markers(q), 'each page has its own numbers').toEqual(['1'])
  console.log(steps.join('\n'))
})

test('one chat, a second localhost that doesn\'t load Inspeck: linking the tab adds it, and the watcher reads notes from both apps by itself', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const B = w.app('beta', 5302, { tag: false })
  const c = await w.chat('one', A.dir)
  await w.up()
  const pa = await context.newPage(); await pa.goto(A.url); await ready(pa)
  expect((await api(pa, 'POST', '/settings', { send: 'live' })).status, 'Auto-send on').toBe(200)

  let watch = watcher(c)
  await note(pa, '#title', 'from the first app')
  expect(await watch.done).toContain('from the first app')

  /* The chat opens another app, one that doesn't load Inspeck: linking its tab is what adds it. */
  const pb = await context.newPage(); await pb.goto(B.url)
  expect(await pb.evaluate(() => !!window.__INSPECK__), 'not there before linking').toBe(false)
  await c.bindTab(pb); await ready(pb)
  watch = watcher(c)
  await note(pb, '#buy', 'from the second app')
  const got = await watch.done
  expect(got).toContain('from the second app')
  expect(got).toContain('localhost:5302')

  /* A full reload takes it away again (that's why Claude offers to add it to the app), and linking brings it back. */
  await pb.reload()
  await pb.waitForTimeout(1500)
  expect(await pb.evaluate(() => !!window.__INSPECK__), 'gone after a full reload').toBe(false)
  await c.bindTab(pb); await ready(pb)

  /* Auto-send off: notes wait on the page until the chat is asked. */
  expect((await api(pb, 'POST', '/settings', { send: 'ask' })).status).toBe(200)
  await pb.reload(); await c.bindTab(pb); await ready(pb)
  watch = watcher(c)
  await note(pb, '#card-title', 'waits until asked')
  const early = await Promise.race([watch.done.then(() => 'delivered'), new Promise(r => setTimeout(() => r('waiting'), 4000))])
  watch.stop()
  expect(early, 'with Auto-send off the watcher doesn\'t take it').toBe('waiting')
  expect(await c.tool('pending')).toContain('waits until asked')
})
