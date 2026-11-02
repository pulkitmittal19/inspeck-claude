/* Load and the edges of a person's day: many notes at once from many tabs, a page with hundreds of notes,
 * thousands of notes to read, settings saved by an older Inspeck, Inspeck going away mid-note, and another
 * Mac user's Inspeck on the same port. The heavy ones run in Chrome only: they measure Inspeck, not the engine. */
import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { api, markers, noteBody, PORT, ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(180_000)

const root = page => page.evaluateHandle(() => document.querySelector('inspeck-root').shadowRoot)

test('fifty notes from five tabs of one page within seconds: fifty different numbers, every one read once', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const tabs = await Promise.all(Array.from({ length: 5 }, () => context.newPage()))
  for (const t of tabs) { await t.goto(A.url); await ready(t) }
  const sent = await Promise.all(tabs.flatMap((t, i) => Array.from({ length: 10 }, async (_, j) => api(t, 'POST', '/comments', await noteBody(t, `tab ${i} note ${j}`)))))
  expect(sent.every(r => r.status === 201)).toBe(true)
  expect(sent.map(r => r.json.comment.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
  const read = await c.tool('pending')
  for (let i = 0; i < 5; i++) for (let j = 0; j < 10; j++) expect(read.split(`\ntab ${i} note ${j}\n`).length - 1, `tab ${i} note ${j}`).toBe(1)
})

test('a page with 200 notes: every marker shows, and scrolling stays smooth', async ({ context }, info) => {
  test.skip(info.project.name !== 'chrome', 'measures Inspeck, not the engine')
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  /* A long page, so there's something to scroll, with notes spread down it. */
  await p.evaluate(() => { for (let i = 0; i < 200; i++) { const el = document.createElement('p'); el.id = `row-${i}`; el.textContent = `Row ${i}`; el.style.margin = '40px 0'; document.body.append(el) } })
  for (let i = 0; i < 200; i += 20) await Promise.all(Array.from({ length: 20 }, async (_, k) => api(p, 'POST', '/comments', await noteBody(p, `row note ${i + k}`, `#row-${i + k}`))))
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => markers(p).then(m => m.length), { timeout: 20_000 }).toBe(200)
  /* Frames longer than 50 ms while scrolling top to bottom and back. */
  const long = await p.evaluate(async () => {
    const seen = []
    new PerformanceObserver(l => seen.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: false })
    const step = () => new Promise(r => requestAnimationFrame(() => r()))
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await step() }
    for (let y = document.body.scrollHeight; y > 0; y -= 400) { window.scrollTo(0, y); await step() }
    await new Promise(r => setTimeout(r, 300))
    return seen
  })
  console.log(`long tasks while scrolling past 200 markers: ${long.length} (${long.map(Math.round).join(', ')} ms)`)
  expect(long.filter(d => d > 100).length, 'no frame held up 100 ms or more').toBe(0)
})

test('2,000 notes over 50 pages: reading them all takes a couple of seconds, and a page still opens fast', async ({ context }, info) => {
  test.skip(info.project.name !== 'chrome', 'measures the server, not the engine')
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const post = (page, i) => fetch(`http://127.0.0.1:${PORT}/comments`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-inspeck': '1', origin: 'http://localhost:5301' },
    body: JSON.stringify({ note: `bulk ${page}-${i}`, page: `http://localhost:5301/page-${page}`, element: { selector: '#title', tag: 'h1', text: 'alpha home' }, held: true }),
  }).then(r => r.status)
  for (let page = 0; page < 50; page++) expect(new Set(await Promise.all(Array.from({ length: 40 }, (_, i) => post(page, i))))).toEqual(new Set([201]))
  const p = await context.newPage()
  const opened = Date.now(); await p.goto(A.url); await ready(p)
  console.log(`a page opened with 2,000 notes elsewhere: ${Date.now() - opened} ms`)
  const t = Date.now()
  const read = await c.tool('pending')
  const took = Date.now() - t
  console.log(`pending read 2,000 notes in ${took} ms, ${Math.round(read.length / 1024)} KB of text`)
  expect(read).toContain('bulk 49-39')
  expect(took).toBeLessThan(3000)
})

test('settings saved by an older Inspeck (sizes and colours) are ignored, and Auto-send still holds', async ({ context }) => {
  mkdirSync(w.home, { recursive: true })
  writeFileSync(join(w.home, 'settings.json'), JSON.stringify({ sizes: 'rem', colors: 'oklch', send: 'live' }))
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage()
  const errors = []; p.on('pageerror', e => errors.push(e.message))
  await p.goto(A.url); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await p.waitForTimeout(800)
  const btn = await (await root(p)).evaluate(s => { const b = s.querySelector('[data-action="settings"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
  await p.mouse.click(btn.x, btn.y)
  await p.waitForTimeout(500)
  const shown = await (await root(p)).evaluate(s => ({ rows: s.querySelectorAll('.settings .seg-opt').length, live: s.querySelector('.settings .switch')?.getAttribute('aria-checked') }))
  expect(shown).toEqual({ rows: 0, live: 'true' })
  expect(errors).toEqual([])
})

test('every chat closes while a note is being written: it says so and keeps the words; with a chat back, it sends', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const one = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await p.waitForTimeout(450)
  const at = await p.evaluate(() => { const b = document.querySelector('#card-title').getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 } })
  await p.mouse.move(at.x, at.y, { steps: 2 }); await p.waitForTimeout(150); await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  await one.close()
  await expect.poll(async () => { try { await fetch(`http://127.0.0.1:${PORT}/health`); return 'up' } catch { return 'down' } }, { timeout: 10_000 }).toBe('down')
  await p.keyboard.type('written while Inspeck went away', { delay: 5 })
  await p.keyboard.press('Enter')
  const card = () => p.evaluate(() => { const r = document.querySelector('inspeck-root').shadowRoot; return { status: r.querySelector('.card .status')?.textContent ?? '', text: r.querySelector('.card textarea')?.value ?? null } })
  await expect.poll(card, { timeout: 8000 }).toEqual({ status: expect.stringContaining('Can’t reach Inspeck'), text: 'written while Inspeck went away' })
  const two = await w.chat('two', A.dir)
  expect(await w.up()).toBe(true)
  await p.keyboard.press('Enter')
  await expect.poll(() => markers(p), { timeout: 8000 }).toEqual(['1'])
  expect(await two.tool('pending')).toContain('written while Inspeck went away')
})

test('another Mac user\'s Inspeck (its own notes folder) can\'t take this one\'s port, even when it\'s newer', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const mine = await w.chat('mine', A.dir)
  await w.up()
  /* Someone else on this Mac: their own ~/.inspeck, and a newer Inspeck that would normally take the port. */
  const theirs = world()
  try {
    const B = theirs.app('beta', 5302)
    const other = await theirs.chat('theirs', B.dir, { version: '9.9.9' })
    await new Promise(r => setTimeout(r, 3000))
    const answering = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.json())
    expect(answering.version, 'still this user\'s Inspeck on the port').not.toBe('9.9.9')
    /* Where their page's notes go while both are on: recorded, so the limitation stays known. */
    const p = await context.newPage(); await p.goto(B.url); await ready(p)
    const sent = await api(p, 'POST', '/comments', await noteBody(p, 'from the other user\'s app'))
    const minesees = (await mine.tool('pending')).includes('from the other user\'s app')
    const theysee = (await other.tool('pending')).includes('from the other user\'s app')
    console.log(`another user's note: placed ${sent.status}; reaches this user's chat: ${minesees}; reaches theirs: ${theysee}`)
  } finally { await theirs.cleanup() }
})

test('the notes folder can\'t be written: the note says so plainly and keeps the words; once it can, it sends', async ({ context }, info) => {
  test.skip(info.project.name !== 'chrome', 'the server\'s answer, not the engine')
  const { chmodSync } = await import('node:fs')
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await p.waitForTimeout(450)
  const at = await p.evaluate(() => { const b = document.querySelector('#card-title').getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 } })
  await p.mouse.move(at.x, at.y, { steps: 2 }); await p.waitForTimeout(150); await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  await p.keyboard.type('saved once the folder is back', { delay: 5 })
  chmodSync(w.home, 0o500)
  try {
    await p.keyboard.press('Enter')
    const card = () => p.evaluate(() => { const r = document.querySelector('inspeck-root').shadowRoot; return { status: r.querySelector('.card .status')?.textContent ?? '', text: r.querySelector('.card textarea')?.value ?? null } })
    await expect.poll(card, { timeout: 8000 }).toEqual({ status: expect.stringContaining('Inspeck can’t save notes: it isn’t allowed to write to'), text: 'saved once the folder is back' })
  } finally { chmodSync(w.home, 0o700) }
  await p.keyboard.press('Enter')
  await expect.poll(() => markers(p), { timeout: 8000 }).toEqual(['1'])
  expect(await c.tool('pending')).toContain('saved once the folder is back')
})
