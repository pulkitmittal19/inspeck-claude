/* Things going wrong, as a person meets them. Inspeck away or frozen, or a dev server answering for it: a note says so
 * in plain words, keeps its words, and goes once Inspeck is back. Clearing says what really happened. A page with
 * nothing to talk to asks less and less often, and catches up when Inspeck opens. A failed load during an update
 * doesn't lose the widget. A setting changed meanwhile isn't lost. A change to a note Claude has just read says so. */
import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { api, markers, note, noteBody, ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(120_000)

const inWidget = (page, sel) => page.evaluate(sel => {
  const e = document.querySelector('inspeck-root').shadowRoot.querySelector(sel)
  const r = e?.getBoundingClientRect()
  return r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}, sel)
const click = async (page, sel) => {
  await expect.poll(() => inWidget(page, sel), { timeout: 5000, message: sel }).not.toBeNull()
  const at = await inWidget(page, sel)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(400)
}
const says = page => page.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.card .status')?.textContent ?? '')
const words = page => page.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.note-input')?.value ?? null)
const opened = async page => {
  await page.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true))
  await page.waitForTimeout(450)
  if (await inWidget(page, '.tour-link')) await click(page, '.tour-link')
}
/** Open a note on an element and type into it, with the real mouse and keyboard; not sent yet. */
async function write(page, sel, text) {
  await opened(page)
  const at = await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + Math.min(10, r.width / 2), y: r.top + r.height / 2 } }, sel)
  await page.mouse.move(at.x, at.y, { steps: 2 })
  await page.waitForTimeout(150)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(400)
  await page.keyboard.type(text, { delay: 3 })
}
const CANT_REACH = 'Can’t reach Inspeck. Open a Claude chat, then try again: your note stays here.'
const posting = route => route.request().method() === 'POST'
const app = async ({ context, version } = {}) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir, { version })
  await w.up()
  const p = await context.newPage()
  await p.goto(A.url)
  await ready(p)
  return { A, c, p }
}

test('Inspeck away, whether nothing answers or a dev server answers for it: the note says so in plain words, keeps its words, and goes once Inspeck is back', async ({ context }) => {
  const { A, p } = await app({ context })
  await write(p, '#title', 'written with Inspeck away')
  /* Nothing answers (the tag in a plain page, no chat open). */
  await context.route('**/comments', r => posting(r) ? r.abort() : r.continue())
  await p.keyboard.press('Enter')
  await expect.poll(() => says(p), { timeout: 5000 }).toBe(CANT_REACH)
  expect(await words(p)).toBe('written with Inspeck away')
  await context.unroute('**/comments')
  /* A dev server passing the call on, answering with a bare error of its own (Vite: an empty 500). */
  await context.route('**/comments', r => posting(r) ? r.fulfill({ status: 500, body: '' }) : r.continue())
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
  expect(await says(p)).toBe(CANT_REACH)
  await context.unroute('**/comments')
  /* Or an answer that isn't Inspeck's at all (a page of HTML). */
  await context.route('**/comments', r => posting(r) ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }) : r.continue())
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
  expect(await says(p)).toBe(CANT_REACH)
  await context.unroute('**/comments')
  /* Inspeck's own words are shown as they are. */
  await context.route('**/comments', r => posting(r) ? r.fulfill({ status: 507, contentType: 'application/json', body: JSON.stringify({ error: 'Inspeck can’t save notes: the disk is full.' }) }) : r.continue())
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
  expect(await says(p)).toContain('the disk is full')
  await context.unroute('**/comments')
  /* Back: the same words go, once. */
  await p.keyboard.press('Enter')
  await expect.poll(() => markers(p), { timeout: 5000 }).toEqual(['1'])
  expect((await api(p, 'GET', `/comments?page=${encodeURIComponent(A.url + '/')}`)).json.comments.map(c => c.note)).toEqual(['written with Inspeck away'])
})

test('Inspeck frozen (it takes the call and never answers): the note doesn\'t stay "sending" for good; it says so, keeps its words, and sent again it arrives', async ({ context }) => {
  const { A, p } = await app({ context })
  await write(p, '#title', 'sent to a frozen Inspeck')
  await context.route('**/comments', r => { if (!posting(r)) return r.continue() /* a POST: never answered */ })
  const sent = Date.now()
  await p.keyboard.press('Enter')
  await expect.poll(() => says(p), { timeout: 20_000, intervals: [500] }).toBe(CANT_REACH)
  expect(Date.now() - sent, 'after a moment, not at once').toBeGreaterThan(10_000)
  expect(await words(p)).toBe('sent to a frozen Inspeck')
  await context.unroute('**/comments')
  await p.keyboard.press('Enter')
  await expect.poll(() => markers(p), { timeout: 5000 }).toEqual(['1'])
  expect((await api(p, 'GET', `/comments?page=${encodeURIComponent(A.url + '/')}`)).json.comments).toHaveLength(1)
})

test('Clear tells the truth: when notes couldn\'t be cleared it says so and they stay; when they could, they go', async ({ context }) => {
  const { A, p } = await app({ context })
  await note(p, '#title', 'one'); await note(p, '#intro', 'two')
  const tip = () => p.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('[data-action="clear"]').dataset.say ?? '')
  await context.route('**/comments/*', r => r.request().method() === 'DELETE' ? r.abort() : r.continue())
  await click(p, '[data-action="clear"]'); await click(p, '[data-action="clear"]')
  await expect.poll(tip, { timeout: 3000 }).toContain('Couldn’t clear')
  expect(await markers(p)).toEqual(['1', '2'])
  await context.unroute('**/comments/*')
  await p.waitForTimeout(2500)
  /* One of them already gone (deleted from another tab) is no failure. */
  const [first] = (await api(p, 'GET', `/comments?page=${encodeURIComponent(A.url + '/')}`)).json.comments
  await api(p, 'DELETE', `/comments/${first.id}`)
  await click(p, '[data-action="clear"]'); await click(p, '[data-action="clear"]')
  await expect.poll(tip, { timeout: 3000 }).toBe('Cleared')
  expect(await markers(p)).toEqual([])
})

test('nothing to talk to: a page asks less and less often (each try is a red line in its console), and catches up the moment Inspeck opens', async ({ context }) => {
  const { A, p } = await app({ context })
  await p.bringToFront()
  let asks = 0
  await context.route('**/comments?*', r => { asks++; return r.abort() })
  await p.waitForTimeout(30_000)
  expect(asks, 'at every 4 s it would be 7 or 8').toBeLessThanOrEqual(4)
  expect(asks, 'it does still ask').toBeGreaterThanOrEqual(2)
  /* Inspeck is back, with a note placed elsewhere meanwhile; the page's next look may be half a minute off. */
  await context.unroute('**/comments?*')
  expect((await api(p, 'POST', '/comments', await noteBody(p, 'placed from another tab'))).status).toBeLessThan(300)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(() => markers(p), { timeout: 2000, intervals: [200], message: 'at once, when opened' }).toEqual(['1'])
  expect(A.port).toBe(5301)
})

test('the new widget can\'t be loaded just as a page swaps to it: it keeps trying, and Inspeck comes back by itself', async ({ context }) => {
  const { p } = await app({ context, version: '0.0.1' })
  let tries = 0
  await context.route('**/inspeck.js?v=*', r => { tries++; return tries === 1 ? r.abort() : r.continue() })
  w.serve()
  await p.bringToFront()
  await expect.poll(() => tries, { timeout: 15_000, message: 'it tried' }).toBeGreaterThanOrEqual(1)
  await expect.poll(() => p.evaluate(() => window.__INSPECK__?.version ?? null), { timeout: 15_000, message: 'it came back' }).toEqual(await w.answering())
  expect(await p.evaluate(() => document.querySelectorAll('inspeck-root').length)).toBe(1)
})

test('a setting changed while Inspeck can\'t be reached isn\'t lost: it goes to Inspeck the next time, and holds after a reload', async ({ context }) => {
  const { p } = await app({ context })
  await opened(p)
  await click(p, '[data-action="settings"]')
  await context.route('**/settings', r => r.abort())
  await click(p, '.settings [data-key="sizes"][data-value="rem"]')
  await context.unroute('**/settings')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  expect((await api(p, 'GET', '/settings')).json.sizes ?? 'none', 'not there yet').not.toBe('rem')
  /* The next time Inspeck opens. */
  await p.evaluate(() => window.__INSPECK__.app.setOpen(false)); await p.waitForTimeout(300)
  await p.evaluate(() => window.__INSPECK__.app.setOpen(true))
  await expect.poll(async () => (await api(p, 'GET', '/settings')).json.sizes, { timeout: 3000 }).toBe('rem')
  await p.reload(); await ready(p)
  await opened(p)
  await click(p, '[data-action="settings"]')
  expect(await p.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.settings [data-key="sizes"][data-value="rem"]').getAttribute('aria-checked'))).toBe('true')
})

test('a note Claude reads while its card is open: changing it says Claude already has it, and the words stay', async ({ context }) => {
  const { c, p } = await app({ context })
  await note(p, '#title', 'as Claude reads it')
  const m = await p.evaluate(() => { const r = document.querySelector('inspeck-root').shadowRoot.querySelector('.marker:not([data-gone])').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.mouse.click(m.x, m.y); await p.waitForTimeout(600)
  await c.tool('pending')
  await p.keyboard.press('End')
  await p.keyboard.type(', and more', { delay: 3 })
  await p.keyboard.press('Enter')
  await expect.poll(() => says(p), { timeout: 3000 }).toContain('already read')
  expect(await words(p)).toBe('as Claude reads it, and more')
})

test('the mic isn\'t gone for good because one check failed: it\'s there the next time Inspeck opens', async ({ context }) => {
  const A = w.app('alpha', 5301)
  /* Any file will do for the speech helper here: this only asks whether voice is possible. */
  const helper = join(w.base, 'listen'); writeFileSync(helper, '')
  await w.chat('one', A.dir, { env: { INSPECK_LISTEN: helper } })
  await w.up()
  await context.route('**/voice', r => r.abort())
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await opened(p)
  await p.waitForTimeout(400)
  await context.unroute('**/voice')
  await p.evaluate(() => window.__INSPECK__.app.setOpen(false)); await p.waitForTimeout(300)
  await write(p, '#title', 'x')
  await expect.poll(() => inWidget(p, '.mic'), { timeout: 3000, message: 'the mic is there' }).not.toBeNull()
})
