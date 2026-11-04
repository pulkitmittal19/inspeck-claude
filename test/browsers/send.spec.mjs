/* Sending notes, as a person does it with the real Settings switch: notes wait until Claude is asked for them;
 * turning Auto-send on sends the waiting ones at once and each new one as it's placed; with no chat listening,
 * Settings gives the line to send in the chat (copied exactly), and the notes arrive once a chat follows it;
 * turning it off holds notes again; and the choice holds after a reload and in another app. */
import { test, expect } from '@playwright/test'
import { markers, note, ready, watcher, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(180_000)

const inWidget = (page, sel) => page.evaluate(sel => {
  const e = document.querySelector('inspeck-root').shadowRoot.querySelector(sel)
  if (!e) return null
  const r = e.getBoundingClientRect()
  return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}, sel)
const click = async (page, sel) => {
  await expect.poll(() => inWidget(page, sel), { timeout: 5000, message: sel }).not.toBeNull()
  const at = await inWidget(page, sel)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(350)
}
/** Open Settings from the pill, flip Auto-send, and say what the panel shows then. */
async function flipAutoSend(page) {
  await page.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true))
  await page.waitForTimeout(400)
  if (!await page.evaluate(() => !document.querySelector('inspeck-root').shadowRoot.querySelector('.settings').hidden)) await click(page, '[data-action="settings"]')
  await click(page, '.settings [data-action="live"]')
  await page.waitForTimeout(1200)
  return page.evaluate(() => {
    const s = document.querySelector('inspeck-root').shadowRoot.querySelector('.settings')
    const shows = el => !!el && !el.hidden && el.getBoundingClientRect().height > 0
    return {
      on: s.querySelector('.switch').getAttribute('aria-checked') === 'true',
      going: shows(s.querySelector('.listen-ok')) && s.querySelector('.listen-wrap').hasAttribute('data-open'),
      line: shows(s.querySelector('.listen-msg')) && s.querySelector('.listen-wrap').hasAttribute('data-open') ? s.querySelector('.listen-msg span').textContent : null,
    }
  })
}
const closeSettings = async page => { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
const sendLabel = page => page.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.card [data-action="send"]')?.getAttribute('aria-label'))

test('notes wait until Claude is asked; turning Auto-send on sends the waiting ones at once, then each new one as it\'s placed', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  const listening = watcher(c)

  /* Auto-send off (the start): notes stay on the page, and the listening chat isn't handed them. */
  await note(p, '#title', 'waiting one'); await note(p, '#intro', 'waiting two')
  expect(await markers(p)).toEqual(['1', '2'])
  const early = await Promise.race([listening.done.then(() => 'handed over'), new Promise(r => setTimeout(() => r('still waiting'), 3000))])
  expect(early).toBe('still waiting')

  /* On: Settings says where they go, and the two waiting notes go now. */
  expect(await flipAutoSend(p)).toEqual({ on: true, going: true, line: null })
  const got = await listening.done
  expect(got).toContain('waiting one'); expect(got).toContain('waiting two')
  await closeSettings(p)
  await expect.poll(() => markers(p), { timeout: 8000, message: 'markers leave once Claude has them' }).toEqual([])

  /* Each new one goes as it's placed: the note's button says so. */
  const next = watcher(c)
  await p.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true))
  const at = await p.evaluate(() => { const r = document.querySelector('#buy').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } })
  await p.mouse.move(at.x, at.y, { steps: 2 }); await p.waitForTimeout(150); await p.mouse.click(at.x, at.y); await p.waitForTimeout(400)
  expect(await sendLabel(p)).toBe('Send to Claude')
  await p.keyboard.type('sent as placed', { delay: 5 }); await p.keyboard.press('Enter')
  expect(await next.done).toContain('sent as placed')
})

test('Auto-send on with no chat listening: Settings gives the line to send (copied exactly), and once a chat follows it the notes arrive', async ({ context }) => {
  const A = w.app('alpha', 5301)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await p.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async t => { window.__copied.push(t) } })

  const shown = await flipAutoSend(p)
  expect(shown).toEqual({ on: true, going: false, line: 'Listen for my Inspeck notes on http://localhost:5301' })
  await click(p, '.settings [data-action="copy-listen"]')
  expect(await p.evaluate(() => window.__copied)).toEqual(['Listen for my Inspeck notes on http://localhost:5301'])
  await closeSettings(p)

  /* Placed before any chat listens: sent, and kept for the chat (its marker stays until a chat has it). */
  await note(p, '#title', 'before anyone listened')
  expect(await markers(p)).toEqual(['1'])

  /* The chat does what the line asks: links the site, takes what's waiting, and listens. */
  await c.tool('bind', { page: 'http://localhost:5301' })
  expect(await c.tool('pending')).toContain('before anyone listened')
  await expect.poll(() => markers(p), { timeout: 8000 }).toEqual([])
  const listening = watcher(c)
  await new Promise(r => setTimeout(r, 1500))
  await note(p, '#intro', 'now someone listens')
  expect(await listening.done).toContain('now someone listens')

  /* Turning it on again now says where notes go. */
  expect((await flipAutoSend(p)).on).toBe(false)
  expect(await flipAutoSend(p)).toEqual({ on: true, going: true, line: null })
})

test('turning Auto-send off holds notes again until asked; the choice holds after a reload and in another app', async ({ context }) => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  const c = await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  expect((await flipAutoSend(p)).on).toBe(true)
  expect((await flipAutoSend(p)).on).toBe(false)
  await closeSettings(p)

  const listening = watcher(c)
  await new Promise(r => setTimeout(r, 1500))
  await note(p, '#title', 'held after turning it off')
  const early = await Promise.race([listening.done.then(() => 'handed over'), new Promise(r => setTimeout(() => r('still waiting'), 3000))])
  listening.stop()
  expect(early).toBe('still waiting')
  expect(await markers(p)).toEqual(['1'])
  expect(await c.tool('pending')).toContain('held after turning it off')

  /* On again, then a reload and another app: both show it on. */
  expect((await flipAutoSend(p)).on).toBe(true)
  await p.reload(); await ready(p)
  const q = await context.newPage(); await q.goto(B.url); await ready(q)
  for (const page of [p, q]) {
    await page.evaluate(() => window.__INSPECK__.app.setOpen(true)); await page.waitForTimeout(400)
    await click(page, '[data-action="settings"]')
    expect(await page.evaluate(() => document.querySelector('inspeck-root').shadowRoot.querySelector('.settings .switch').getAttribute('aria-checked'))).toBe('true')
  }
})
