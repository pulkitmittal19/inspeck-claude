/* An update landing while notes are in flight. A chat runs the older Inspeck; the update starts the newer one in the
 * background (`inspeck.mjs serve`), which takes the port; open pages swap to its widget by themselves. Across that:
 * waiting notes on three localhosts keep their numbers and markers, and Claude reads each once; a note being written
 * isn't disturbed and arrives once; notes sent while the port changes hands, twice, each arrive once; Auto-send keeps
 * handing notes to the listening chat, whichever localhost they're on; a linked tab keeps its chat; and an older and
 * a newer chat in two projects each get only their own project's notes; and dictating isn't lost, and the microphone
 * stops, whichever Inspeck was listening. */
import { test, expect } from '@playwright/test'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORT, api, deleteNote, markers, note, noteBody, ready, watcher, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(180_000)

/* What the chats ran before the update, the update, and the one after it. */
const CURRENT = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')).version
const [MAJOR, MINOR, PATCH] = CURRENT.split('.').map(Number)
const OLDER = PATCH > 0 ? `${MAJOR}.${MINOR}.${PATCH - 1}` : `${MAJOR}.${MINOR - 1}.9`
const NEXT = `${MAJOR}.${MINOR}.${PATCH + 1}`

const version = page => page.evaluate(() => window.__INSPECK__?.version)
const open = async (...pages) => Promise.all(pages.map(async app => { const p = await w.context.newPage(); await p.goto(app.url); await ready(p); return p }))
const comments = async (page, app) => (await api(page, 'GET', `/comments?page=${encodeURIComponent(app.url + '/')}`)).json.comments
const takenBy = v => expect.poll(() => w.answering(), { timeout: 15_000, message: `Inspeck ${v} takes the port` }).toBe(v)
/** The page, looked at (a widget checks in only while its page is visible), swaps to it by itself. */
const swapped = async (page, v) => {
  await page.bringToFront()
  await expect.poll(() => version(page), { timeout: 20_000, message: 'the page swaps to it by itself' }).toBe(v)
}
/** Inspeck put away (its Close button): a page swaps only then, never while Inspeck is open. */
const putAway = (...pages) => Promise.all(pages.map(p => p.evaluate(() => window.__INSPECK__?.app?.open && window.__INSPECK__.app.setOpen(false))))
/** What a read handed over as new, without its "Read before" list. */
const fresh = out => out.split('Read before, still open:')[0]
const times = (out, text) => out.split(text).length - 1
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(what)), ms))])

/** Auto-send on, with the real switch in Settings. */
async function autoSendOn(page) {
  await page.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true))
  await page.waitForTimeout(400)
  for (const sel of ['[data-action="settings"]', '.settings [data-action="live"]']) {
    const at = await page.evaluate(sel => { const r = document.querySelector('inspeck-root').shadowRoot.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
    await page.mouse.click(at.x, at.y)
    await page.waitForTimeout(700)
  }
  expect(await page.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.settings .switch').getAttribute('aria-checked'))).toBe('true')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

test.beforeEach(({ context }) => { w.context = context })

test('waiting notes on three localhosts across an update: same notes, numbers and markers once each page swaps; a linked tab keeps its chat; Claude reads each once', async () => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302), C = w.app('gamma', 5303)
  const one = await w.chat('one', A.dir, { version: OLDER })
  await w.up()
  const [pa, pb, pc] = await open(A, B, C)
  for (const p of [pa, pb, pc]) expect(await version(p)).toBe(OLDER)
  await one.bindTab(pa)
  await note(pa, '#title', 'A one'); await note(pa, '#card-title', 'A two'); await note(pa, '#buy', 'A three')
  await note(pb, '#title', 'B one')
  await note(pc, '#intro', 'C one'); await note(pc, '#buy', 'C two')
  const before = [await markers(pa), await markers(pb), await markers(pc)]
  expect(before).toEqual([['1', '2', '3'], ['1'], ['1', '2']])

  await putAway(pa, pb, pc)
  w.serve()
  await takenBy(CURRENT)
  for (const p of [pa, pb, pc]) await swapped(p, CURRENT)
  await expect.poll(async () => [await markers(pa), await markers(pb), await markers(pc)], { timeout: 8000, message: 'the markers are back' }).toEqual(before)
  expect((await comments(pa, A)).map(c => c.note).sort()).toEqual(['A one', 'A three', 'A two'])
  for (const p of [pa, pb, pc]) expect(await p.evaluate(() => document.querySelectorAll('inspeck-root').length), 'one Inspeck on the page').toBe(1)

  /* The linked tab still sends to its chat; numbering goes on; deleting renumbers. */
  await note(pa, '#intro', 'A four, after the update')
  expect(await markers(pa)).toEqual(['1', '2', '3', '4'])
  expect((await comments(pa, A)).find(c => c.note === 'A four, after the update').to).toMatchObject({ pid: Number(one.env.INSPECK_SESSION_PID), how: 'bound' })
  await deleteNote(pa, 2)
  expect(await markers(pa)).toEqual(['1', '2', '3'])

  /* "Check my notes": every open one, once, with its page's address. */
  const read = fresh(await one.tool('pending'))
  for (const t of ['A one', 'A three', 'A four, after the update', 'B one', 'C one', 'C two']) expect(times(read, t), t).toBe(1)
  expect(read).not.toContain('A two')
  for (const app of [A, B, C]) expect(read).toContain(`localhost:${app.port}`)
  await expect.poll(async () => [...await markers(pa), ...await markers(pb), ...await markers(pc)], { timeout: 8000, message: 'read notes leave the pages' }).toEqual([])
  /* None swaps back down. */
  await pa.waitForTimeout(3000)
  for (const p of [pa, pb, pc]) expect(await version(p)).toBe(CURRENT)
})

test('a note being written when the update lands: the page doesn\'t swap under it, the words stay, it arrives once; then the page swaps', async () => {
  const A = w.app('alpha', 5301)
  const one = await w.chat('one', A.dir, { version: OLDER })
  await w.up()
  const [p] = await open(A)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await p.waitForTimeout(450)
  const at = await p.evaluate(() => { const r = document.querySelector('#title').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await p.mouse.move(at.x, at.y, { steps: 2 }); await p.waitForTimeout(150)
  await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  await p.keyboard.type('half written when the update came', { delay: 5 })

  w.serve()
  await takenBy(CURRENT)
  await p.waitForTimeout(5000)
  expect(await version(p), 'not while the note is open').toBe(OLDER)
  expect(await p.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.note-input')?.value)).toBe('half written when the update came')
  /* Sent to the newer Inspeck, which the page now knows of: still no swap while Inspeck is open. */
  await p.keyboard.press('Enter')
  await p.waitForTimeout(3000)
  expect(await version(p), 'not while Inspeck is open').toBe(OLDER)
  expect((await comments(p, A)).filter(c => c.note === 'half written when the update came')).toHaveLength(1)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.evaluate(() => window.__INSPECK__?.app?.open && window.__INSPECK__.app.setOpen(false))
  await swapped(p, CURRENT)
  await expect.poll(() => markers(p), { timeout: 8000 }).toEqual(['1'])
  expect(times(fresh(await one.tool('pending')), 'half written when the update came')).toBe(1)
})

test('notes sent while the port changes hands, twice: each arrives once; one that couldn\'t be sent arrives once when sent again', async () => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir, { version: OLDER })
  await w.up()
  const [p] = await open(A)
  const body = await noteBody(p, '')
  const N = 250
  /* From the page, as the widget sends them: one every 20 ms, each recording which Inspeck answered. */
  const run = p.evaluate(async ([body, port, N]) => {
    const sent = []
    for (let i = 1; i <= N; i++) {
      const text = `loop ${i}`
      fetch(`http://127.0.0.1:${port}/comments`, { method: 'POST', headers: { 'x-inspeck': '1', 'content-type': 'application/json' }, body: JSON.stringify({ ...body, note: text }) })
        .then(r => sent.push({ text, ok: r.ok, by: r.headers.get('x-inspeck-version') }), () => sent.push({ text, ok: false }))
      await new Promise(r => setTimeout(r, 20))
    }
    while (sent.length < N) await new Promise(r => setTimeout(r, 50))
    return sent
  }, [body, PORT, N])
  await new Promise(r => setTimeout(r, 600))
  w.serve()
  await takenBy(CURRENT)
  await new Promise(r => setTimeout(r, 400))
  w.serve(NEXT)
  const sent = await run
  await takenBy(NEXT)
  expect([...new Set(sent.filter(s => s.ok).map(s => s.by))].sort(), 'the notes went across both handovers').toEqual([OLDER, CURRENT, NEXT].sort())

  /* Each one that failed, sent again as the person would (its words stay in the note). */
  const failed = sent.filter(s => !s.ok)
  for (const s of failed) expect((await api(p, 'POST', '/comments', { ...body, note: s.text })).status).toBeLessThan(300)
  const all = await comments(p, A)
  const count = new Map()
  for (const c of all) count.set(c.note, (count.get(c.note) ?? 0) + 1)
  const wrong = Array.from({ length: N }, (_, i) => `loop ${i + 1}`).filter(t => count.get(t) !== 1).map(t => `${t} ×${count.get(t) ?? 0}`)
  expect(wrong, `each note exactly once (${failed.length} of ${N} couldn't be sent at first)`).toEqual([])
  expect(new Set(all.map(c => c.n)).size, 'no two share a number').toBe(all.length)
})

test('Auto-send on, three localhosts, across an update: each note reaches the listening chat by itself, once, in order', async () => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302), C = w.app('gamma', 5303)
  const one = await w.chat('one', A.dir, { version: OLDER })
  await w.up()
  const [pa, pb, pc] = await open(A, B, C)
  const got = []
  let listening = watcher(one)
  await autoSendOn(pa)
  await note(pa, '#title', 'auto, before the update, on alpha')
  got.push(await within(listening.done, 15_000, 'the note before the update reached the chat'))

  listening = watcher(one)
  w.serve()
  await note(pb, '#title', 'auto, as the update lands, on beta')
  got.push(await within(listening.done, 15_000, 'the note during the update reached the chat'))

  await takenBy(CURRENT)
  await swapped(pc, CURRENT)
  listening = watcher(one)
  await note(pc, '#title', 'auto, after the update, on gamma')
  got.push(await within(listening.done, 15_000, 'the note after the update reached the chat'))

  expect(got[0]).toContain('before the update'); expect(got[1]).toContain('as the update lands'); expect(got[2]).toContain('after the update')
  for (const t of ['auto, before the update, on alpha', 'auto, as the update lands, on beta', 'auto, after the update, on gamma']) expect(times(got.join('\n'), t), t).toBe(1)
  await expect.poll(async () => [...await markers(pa), ...await markers(pb), ...await markers(pc)], { timeout: 8000 }).toEqual([])
})

test('an older chat in one project and a newer one in another, across an update: each gets only its own project\'s notes, from before and after, once', async () => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  const old = await w.chat('old', A.dir, { version: OLDER })
  await w.up()
  const [pa] = await open(A)
  await note(pa, '#title', 'alpha one, before'); await note(pa, '#intro', 'alpha two, before')
  /* A chat opened in the other project after the update runs the newer Inspeck, which takes the port. */
  const neu = await w.chat('new', B.dir)
  await takenBy(CURRENT)
  const [pb] = await open(B)
  await putAway(pa)
  await swapped(pa, CURRENT)
  await note(pa, '#card-title', 'alpha three, after')
  await note(pb, '#title', 'beta, after')

  const byNew = fresh(await neu.tool('pending')), byOld = fresh(await old.tool('pending'))
  for (const t of ['alpha one, before', 'alpha two, before', 'alpha three, after']) {
    expect(times(byOld, t), `${t}: to the chat in its project`).toBe(1)
    expect(byNew).not.toContain(t)
  }
  expect(times(byNew, 'beta, after'), 'beta\'s, to the chat in its project').toBe(1)
  expect(byOld).not.toContain('beta, after')
})

/* ---------------- dictating when the update lands ---------------- */

/** A stand-in for the speech helper, by its protocol (native/listen/main.swift): words until "stop" or stdin closing
    (Inspeck gone), and it notes on disk when the microphone goes on and off. */
function speechHelper() {
  const file = join(w.base, 'listen.cjs'), MIC_LOG = join(w.base, 'mic.log')
  writeFileSync(file, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
let on = false, words = '', rest = ''
const say = o => console.log(JSON.stringify(o))
const off = why => { if (on) appendFileSync(process.env.MIC_LOG, 'off: ' + why + '\\n'); process.exit(0) }
process.on('SIGTERM', () => off('stopped'))
process.stdin.setEncoding('utf8')
process.stdin.on('end', () => off('stdin closed'))
process.stdin.on('data', d => {
  rest += d
  for (let i; (i = rest.indexOf('\\n')) >= 0; rest = rest.slice(i + 1)) {
    const line = rest.slice(0, i).trim()
    if (line === 'start' && !on) {
      on = true; appendFileSync(process.env.MIC_LOG, 'on\\n'); say({ type: 'listening' })
      setInterval(() => { words += 'word '; say({ type: 'text', final: words, partial: '' }) }, 150)
    }
    if (line === 'stop') { say({ type: 'done', text: words.trim() }); off('stopped') }
  }
})
say({ type: 'ready' })
`)
  chmodSync(file, 0o755)
  return { INSPECK_LISTEN: file, MIC_LOG }
}
const inNote = (page, sel) => page.evaluate(sel => {
  const e = document.querySelector('inspeck-root').shadowRoot.querySelector(sel)
  const r = e?.getBoundingClientRect()
  return r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, value: e.value ?? e.textContent } : null
}, sel)
const heard = async page => (await inNote(page, '.note-input'))?.value ?? ''
/** Open a note and press its mic, with the real mouse; returns once words are in the box. */
async function dictate(page) {
  await page.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await page.waitForTimeout(450)
  const at = await page.evaluate(() => { const r = document.querySelector('#title').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await page.mouse.move(at.x, at.y, { steps: 2 }); await page.waitForTimeout(150)
  await page.mouse.click(at.x, at.y); await page.waitForTimeout(400)
  await expect.poll(() => inNote(page, '.mic'), { timeout: 8000, message: 'the note has its mic' }).not.toBeNull()
  const mic = await inNote(page, '.mic')
  await page.mouse.click(mic.x, mic.y)
  await expect.poll(() => heard(page), { timeout: 8000, message: 'the words appear' }).toContain('word')
}
const micLog = env => existsSync(env.MIC_LOG) ? readFileSync(env.MIC_LOG, 'utf8') : ''

test('dictating in a chat\'s Inspeck when the update takes the port: the words keep coming, Enter saves them all within seconds, and the microphone stops', async () => {
  const A = w.app('alpha', 5301)
  const env = speechHelper()
  await w.chat('one', A.dir, { version: OLDER, env })
  await w.up()
  const [p] = await open(A)
  await dictate(p)
  w.serve()
  await takenBy(CURRENT)
  const soFar = (await heard(p)).length
  await p.waitForTimeout(1000)
  expect((await heard(p)).length, 'still listening').toBeGreaterThan(soFar)
  const pressed = Date.now()
  await p.keyboard.press('Enter')
  await expect.poll(async () => (await comments(p, A)).filter(c => c.note.startsWith('word')).length, { timeout: 10_000, message: 'saved, once' }).toBe(1)
  expect(Date.now() - pressed, 'at most the five seconds it waits for the last words').toBeLessThan(8000)
  expect((await comments(p, A))[0].note.split(' ').length, 'with all that was heard').toBeGreaterThan(5)
  await expect.poll(() => micLog(env), { timeout: 5000, message: 'the microphone goes off' }).toContain('off:')
})

test('dictating in a background Inspeck when the next update replaces it: what was heard stays, the note says it stopped, Enter saves it, and the microphone stops', async () => {
  const A = w.app('alpha', 5301)
  const env = speechHelper()
  await w.chat('one', A.dir, { version: OLDER })
  await w.up()
  w.serve(undefined, env)
  await takenBy(CURRENT)
  const [p] = await open(A)
  await dictate(p)
  w.serve(NEXT)
  await takenBy(NEXT)
  await expect.poll(() => micLog(env), { timeout: 5000, message: 'the microphone goes off with the Inspeck it ran under' }).toContain('off: stdin closed')
  await expect.poll(() => inNote(p, '.card .status').then(s => s?.value), { timeout: 5000, message: 'the note says it stopped' }).toContain('Listening stopped')
  const kept = await heard(p)
  expect(kept, 'what was heard stays').toContain('word')
  await p.waitForTimeout(800)
  await p.keyboard.press('Enter')
  await expect.poll(async () => (await comments(p, A)).filter(c => c.note === kept.trim()).length, { timeout: 10_000, message: 'saved, once' }).toBe(1)
})
