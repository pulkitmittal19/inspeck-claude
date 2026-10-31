/* A QA pass over how people really use Inspeck: chats opened and closed around their apps, notes edited and
 * deleted from more than one tab, many at once, hostile words, navigation, a damaged notes file. Each test is one
 * thing a person does, checked with the real mouse and keyboard where a person would use them. */
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { api, deleteNote, markers, note, noteBody, ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(120_000)

const root = page => page.evaluateHandle(() => document.querySelector('inspeck-root').shadowRoot)
const card = page => page.evaluate(() => {
  const r = document.querySelector('inspeck-root').shadowRoot
  return { status: r.querySelector('.card .status')?.textContent ?? '', text: r.querySelector('.card textarea')?.value ?? null }
})
const clickMarker = async (page, n) => {
  const m = await page.evaluate(n => { const m = [...document.querySelector('inspeck-root').shadowRoot.querySelectorAll('.marker')].find(m => m.textContent === String(n)); const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, n)
  await page.mouse.click(m.x, m.y)
  await page.waitForTimeout(500)
}

/* ---------------- chats ---------------- */

test('two chats in the same project (a new chat opened): "read my notes" works in either', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const older = await w.chat('older', A.dir)
  await w.up()
  await new Promise(r => setTimeout(r, 1100))
  const newer = await w.chat('newer', A.dir)
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'asked for in the older chat')
  expect(await older.tool('pending'), 'the chat the person asks in gets it').toContain('asked for in the older chat')
  expect(await newer.tool('pending')).not.toContain('asked for in the older chat')
})

test('a site linked to a chat that has since closed: the next chat in the project gets its notes', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const first = await w.chat('first', A.dir)
  await w.up()
  await first.tool('bind', { page: A.url })
  await first.close()
  const next = await w.chat('next', A.dir)
  await new Promise(r => setTimeout(r, 400))
  expect(await w.up()).toBe(true)
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'after the linked chat closed')
  expect(await next.tool('pending')).toContain('after the linked chat closed')
})

test('a monorepo: the chat at the repo root gets notes from an app served from a package folder', async ({ context }) => {
  const mono = join(w.app('mono', 5309).dir)
  const web = w.app('mono/packages/web', 5301)
  const elsewhere = w.app('elsewhere', 5304)
  const rootChat = await w.chat('root', mono)
  await w.up()
  const other = await w.chat('other', elsewhere.dir)
  const p = await context.newPage(); await p.goto(web.url); await ready(p)
  await note(p, '#title', 'from the web package')
  expect(await rootChat.tool('pending')).toContain('from the web package')
  expect(await other.tool('pending')).not.toContain('from the web package')
})

/* ---------------- notes ---------------- */

test('editing a waiting note: Claude reads the new words, under the same number', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'first words')
  await note(p, '#buy', 'second note')
  await clickMarker(p, 1)
  expect((await card(p)).text).toBe('first words')
  await p.keyboard.press('ControlOrMeta+a')
  await p.keyboard.type('edited words', { delay: 5 })
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
  const read = await c.tool('pending')
  expect(read).toContain('Fix 1 · localhost:5301\nedited words')
  expect(read).not.toContain('first words')
})

test('two tabs of one page: a note in one shows in the other; deleted in one while open in the other', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const t1 = await context.newPage(), t2 = await context.newPage()
  await t1.goto(A.url); await t2.goto(A.url); await ready(t1); await ready(t2)
  await note(t1, '#title', 'seen in both tabs')
  await t2.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => markers(t2), { timeout: 8000, message: 'the other tab shows it' }).toEqual(['1'])
  /* Open it in tab 2, delete it in tab 1, then save in tab 2. */
  await clickMarker(t2, 1)
  await deleteNote(t1, 1)
  await t2.keyboard.press('ControlOrMeta+a')
  await t2.keyboard.type('saved after it was deleted', { delay: 5 })
  await t2.keyboard.press('Enter')
  await t2.waitForTimeout(1000)
  const read = await c.tool('pending')
  expect(read, 'a deleted note doesn\'t come back').not.toContain('saved after it was deleted')
  expect((await card(t2)).status, 'tab 2 says what happened').not.toBe('')
  await expect.poll(() => markers(t2), { timeout: 8000 }).toEqual([])
})

test('twenty notes placed at the same moment get twenty different numbers', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const bodies = await Promise.all(Array.from({ length: 20 }, (_, i) => noteBody(p, `burst ${i}`)))
  const out = await Promise.all(bodies.map(b => api(p, 'POST', '/comments', b)))
  expect(out.every(r => r.status === 201)).toBe(true)
  const numbers = out.map(r => r.json.comment.n).sort((a, b) => a - b)
  expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
})

test('reading while notes are being placed: none lost, none read twice', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const placed = []
  const reads = []
  for (let round = 0; round < 6; round++) {
    const bodies = await Promise.all(Array.from({ length: 5 }, (_, i) => noteBody(p, `race ${round}-${i}`)))
    const [, read] = await Promise.all([Promise.all(bodies.map(b => api(p, 'POST', '/comments', b))), c.tool('pending')])
    placed.push(...bodies.map(b => b.note)); reads.push(read)
  }
  reads.push(await c.tool('pending'))
  const all = reads.join('\n')
  for (const t of placed) {
    const times = all.split(`\n${t}\n`).length - 1
    expect(times, `${t} read once in full`).toBe(1)
  }
})

test('after Claude closes notes, two open notes on a page never share a number', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'n1'); await note(p, '#buy', 'n2')
  const read = await c.tool('pending')
  for (const id of [...read.matchAll(/id ([0-9a-f]{8})/g)].map(m => m[1])) await c.tool('resolve', { id, summary: 'done' })
  await note(p, '#intro', 'n3'); await note(p, '#card-title', 'n4')
  const list = (await api(p, 'GET', `/comments?page=${encodeURIComponent(A.url + '/')}`)).json.comments
  const open = list.filter(x => x.status === 'new' || x.status === 'seen').map(x => x.n)
  expect(new Set(open).size).toBe(open.length)
  expect(await markers(p)).toEqual(open.map(String).sort())
})

test('hostile words in a note stay words: on the page, in the card, and for Claude', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const evil = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> 👩🏽‍💻 مرحبا "quotes" & ${'long '.repeat(700)}`.slice(0, 3900)
  await note(p, '#title', evil)
  /* Hover its marker (the preview), then open it (the card). */
  const m = await p.evaluate(() => { const r = document.querySelector('inspeck-root').shadowRoot.querySelector('.marker').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.mouse.move(m.x, m.y); await p.waitForTimeout(600)
  await p.mouse.click(m.x, m.y); await p.waitForTimeout(500)
  expect(await p.evaluate(() => window.__pwned)).toBeUndefined()
  expect((await card(p)).text, 'shown as typed (trimmed, as notes are)').toBe(evil.trim())
  expect(await c.tool('pending')).toContain(evil.slice(0, 200))
})

/* ---------------- pages ---------------- */

test('back and forward: Inspeck and its markers come back, and still work', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'before leaving')
  await p.goto(A.url + '/second.html'); await ready(p)
  await p.goBack(); await ready(p); await p.waitForTimeout(1000)
  expect(await markers(p)).toEqual(['1'])
  await note(p, '#buy', 'after coming back')
  expect(await markers(p)).toEqual(['1', '2'])
  expect(await c.tool('pending')).toContain('after coming back')
})

test('a single-page app changes route: each route has its own notes', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'on home')
  await p.evaluate(() => history.pushState({}, '', '/inbox')); await p.waitForTimeout(1500)
  expect(await markers(p), 'another route, none of home\'s').toEqual([])
  await note(p, '#title', 'on inbox')
  expect(await markers(p)).toEqual(['1'])
  await p.evaluate(() => history.back()); await p.waitForTimeout(1500)
  expect(await markers(p), 'home\'s own note back').toEqual(['1'])
})

test('an element removed after it was noted: its marker waits, and Claude still gets the note', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#buy', 'the button that goes away')
  await p.evaluate(() => document.getElementById('buy').remove()); await p.waitForTimeout(800)
  expect(await p.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.marker')?.hasAttribute('data-lost'))).toBe(true)
  expect(await c.tool('pending')).toContain('the button that goes away')
})

test('an app that uses the window name itself: Inspeck leaves it alone', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage()
  await p.addInitScript(() => { if (!window.name) window.name = 'app-owned-name' })
  await p.goto(A.url); await ready(p)
  expect(await p.evaluate(() => window.name)).toBe('app-owned-name')
  await note(p, '#title', 'works anyway')
  expect(await markers(p)).toEqual(['1'])
})

test('reload while writing a note: what was typed is still there', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true)); await p.waitForTimeout(400)
  const at = await p.evaluate(() => { const r = document.getElementById('title').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await p.mouse.move(at.x, at.y); await p.waitForTimeout(150); await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  await p.keyboard.type('half a thought', { delay: 5 })
  await p.reload(); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true)); await p.waitForTimeout(400)
  await p.mouse.move(at.x, at.y); await p.waitForTimeout(150); await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  expect((await card(p)).text).toBe('half a thought')
})

/* ---------------- the server ---------------- */

test('a damaged notes file: it\'s set aside, nothing crashes, and new notes work', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const home = c.env.INSPECK_HOME
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'inbox.json'), '{"comments": [ {"id": "half-writ')
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await note(p, '#title', 'after the damage')
  expect(await markers(p)).toEqual(['1'])
  expect(await c.tool('pending')).toContain('after the damage')
  expect(readdirSync(home).some(f => f.startsWith('inbox.unreadable-')), 'the damaged file is kept, not deleted').toBe(true)
})

test('another program holds Inspeck\'s port: Claude can say so', async () => {
  const http = await import('node:http')
  const squatter = http.createServer((q, r) => r.end('not inspeck')).listen(4880, '127.0.0.1')
  try {
    const A = w.app('alpha', 5301)
    const c = await w.chat('one', A.dir)
    await new Promise(r => setTimeout(r, 1500))
    const said = await c.tool('pending')
    expect(said).toMatch(/port|4880|another program|in use/i)
  } finally { squatter.close() }
})
