/* One chat, several localhosts; several chats, one machine. Notes reach the right chat whichever local address a
 * page is on, the same tab keeps its chat when it moves to another port, localhost and 127.0.0.1 are one app,
 * deleting and reading work across them, and a page left open across an update says to reload. */
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deleteNote, markers, note, ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(120_000)

test('one chat, two localhosts: notes, deleting and reading, and the markers after', async ({ context }) => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  const c = await w.chat('one', A.dir)
  await w.up()
  const pa = await context.newPage(), pb = await context.newPage()
  await pa.goto(A.url); await pb.goto(B.url); await ready(pa); await ready(pb)
  await note(pa, '#card-title', 'A one'); await note(pa, '#buy', 'A two')
  await note(pb, '#title', 'B one'); await note(pb, '#card-price', 'B two'); await note(pb, '#buy', 'B three')
  expect(await markers(pa)).toEqual(['1', '2'])
  expect(await markers(pb)).toEqual(['1', '2', '3'])
  await deleteNote(pb, 2)
  expect(await markers(pb), 'B renumbers; A is untouched').toEqual(['1', '2'])
  expect(await markers(pa)).toEqual(['1', '2'])
  const read = await c.tool('pending')
  for (const t of ['A one', 'A two', 'B one', 'B three']) expect(read).toContain(t)
  expect(read).not.toContain('B two')
  await expect.poll(async () => [...await markers(pa), ...await markers(pb)], { timeout: 8000, message: 'read notes leave both pages' }).toEqual([])
})

test('several chats: each app\'s notes go to the chat in its folder; linking a tab, or the same tab moving to another port, keeps its chat', async ({ context }, info) => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  const one = await w.chat('one', A.dir), two = await w.chat('two', B.dir)
  await w.up()
  const pa = await context.newPage(), pb = await context.newPage()
  await pa.goto(A.url); await pb.goto(B.url); await ready(pa); await ready(pb)
  await note(pa, '#title', 'A by project'); await note(pb, '#title', 'B by project')
  let r1 = await one.tool('pending'), r2 = await two.tool('pending')
  expect(r1).toContain('A by project'); expect(r1).not.toContain('B by project'); expect(r2).toContain('B by project')
  /* Chat one links B's tab (as Claude does opening it in its pane): B's notes from that tab now go to chat one. */
  await one.bindTab(pb)
  await note(pb, '#buy', 'B after link')
  expect(await one.tool('pending')).toContain('B after link')
  /* A tab linked to chat one goes to another port: it's still chat one's. The tab carries that in its window name,
     which Chromium keeps across ports, as in Claude's browser pane, where tabs are linked. Firefox and Safari clear
     it between origins (a privacy measure): there a site is linked by its address instead. */
  if (info.project.name !== 'chrome') return
  await one.bindTab(pa)
  await pa.goto(B.url + '/second.html'); await ready(pa)
  await note(pa, '#title', 'same tab, now on B')
  r1 = await one.tool('pending'); r2 = await two.tool('pending')
  expect(r1).toContain('same tab, now on B')
  expect(r2).not.toContain('same tab, now on B')
})

test('localhost and 127.0.0.1 are one app: the same notes, numbers and markers, and deleting from either', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p1 = await context.newPage(); await p1.goto(A.url); await ready(p1)
  await note(p1, '#title', 'loop one'); await note(p1, '#card-title', 'loop two'); await note(p1, '#buy', 'loop three')
  const p2 = await context.newPage(); await p2.goto(`http://127.0.0.1:${A.port}/`); await ready(p2)
  await p2.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => markers(p2), { timeout: 12_000 }).toEqual(['1', '2', '3'])
  await deleteNote(p2, 1)
  expect(await markers(p2)).toEqual(['1', '2'])
  await expect.poll(() => markers(p1), { timeout: 12_000 }).toEqual(['1', '2'])
  await note(p2, '#intro', 'loop four')
  const read = await c.tool('pending')
  expect(read, 'numbered after the others, under one address').toContain('Fix 3 · localhost:5301\nloop four')
  expect(read).not.toContain('loop one')
})

test('the chat running the server closes: another takes over, and nothing is lost', async ({ context }) => {
  const A = w.app('alpha', 5301), Z = w.app('zeta', 5304)
  const one = await w.chat('one', A.dir)
  await w.up()
  const two = await w.chat('two', Z.dir)
  const pa = await context.newPage(); await pa.goto(A.url); await ready(pa)
  await one.close()
  await new Promise(r => setTimeout(r, 300))
  expect(await w.up(), 'the other chat takes the port').toBe(true)
  await note(pa, '#title', 'after chat one closed')
  expect(await two.tool('pending')).toContain('after chat one closed')
})

test('a page left open across an update says to reload it', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const file = join(c.dir, 'widget', 'inspeck.js')
  const v = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')).version
  writeFileSync(file, readFileSync(file, 'utf8').split(`"${v}"`).join('"0.0.1"'))
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => p.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.bar-status')?.textContent), { timeout: 8000 }).toBe('Inspeck was updated: reload this page')
})
