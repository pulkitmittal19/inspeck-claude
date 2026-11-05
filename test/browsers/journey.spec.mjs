/* The first-run tour and every shortcut on the Shortcuts list, really pressed, on a fresh Mac (a notes folder of
 * its own): the tour shows once with its three steps and is never shown again, not after a reload nor in another
 * app; I, C, hold ⇧, ↑/↓, F, hold Space and Esc each do what the list says; and the Shortcuts page lights each key. */
import { test, expect } from '@playwright/test'
import { ready, world } from './hosts-lib.mjs'

let w
test.beforeEach(() => { w = world() })
test.afterEach(async () => { await w.cleanup() })
test.setTimeout(120_000)

const shadow = (page, fn, arg) => page.evaluate(([src, arg]) => new Function('root', 'arg', `return (${src})(root, arg)`)(document.querySelector('inspeck-root').shadowRoot, arg), [fn.toString(), arg])
const at = (page, sel) => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + Math.min(10, r.width / 2), y: r.top + r.height / 2 } }, sel)
const inside = (page, sel) => shadow(page, (root, sel) => { const r = root.querySelector(sel)?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, sel)
const tour = page => shadow(page, root => { const t = root.querySelector('.tour'); return !t || t.hidden ? null : { title: t.querySelector('.tour-title')?.textContent, line: t.querySelector('.tour-line')?.textContent, next: t.querySelector('.tour-next')?.textContent, link: t.querySelector('.tour-link')?.textContent } })
const open = async page => { await page.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true)); await page.waitForTimeout(500) }
const tap = async (page, sel) => { const p = await inside(page, sel); await page.mouse.click(p.x, p.y); await page.waitForTimeout(350) }

test('the first-run tour: three steps, Next and Back, worded as Inspeck works; never shown again, after a reload or in another app', async ({ context }) => {
  const A = w.app('alpha', 5301), B = w.app('beta', 5302)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await open(p)
  await expect.poll(() => tour(p), { timeout: 5000 }).toMatchObject({ title: 'Point and note', next: 'Next', link: 'Skip' })
  expect((await tour(p)).line).toContain('Click it to leave a note')
  await tap(p, '.tour-next')
  expect(await tour(p)).toMatchObject({ title: 'Send to Claude' })
  expect((await tour(p)).line, 'Auto-send is off at first: notes wait').toContain('Notes wait on the page until you ask Claude')
  await tap(p, '.tour-next')
  expect(await tour(p)).toMatchObject({ title: 'One key', next: 'Got it', link: 'Back' })
  expect((await tour(p)).line).toContain('to turn Inspeck on or off')
  await tap(p, '.tour-link')
  expect((await tour(p)).title, 'Back goes back').toBe('Send to Claude')
  await tap(p, '.tour-next'); await tap(p, '.tour-next')
  expect(await tour(p), 'Got it closes it').toBeNull()

  await p.reload(); await ready(p); await open(p); await p.waitForTimeout(1500)
  expect(await tour(p), 'not after a reload').toBeNull()
  const q = await context.newPage(); await q.goto(B.url); await ready(q); await open(q); await q.waitForTimeout(1500)
  expect(await tour(q), 'nor in another app on another port').toBeNull()
})

test('Skip ends the tour for good too', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await open(p)
  await expect.poll(() => tour(p), { timeout: 5000 }).toMatchObject({ title: 'Point and note' })
  await tap(p, '.tour-link')
  expect(await tour(p)).toBeNull()
  await p.reload(); await ready(p); await open(p); await p.waitForTimeout(1500)
  expect(await tour(p)).toBeNull()
})

test('each shortcut on the list does what it says: I, C, hold ⇧, ↑/↓, F, hold Space, Esc; and the Shortcuts page lights each key', async ({ context }) => {
  const A = w.app('alpha', 5301)
  await w.chat('one', A.dir)
  await w.up()
  const p = await context.newPage(); await p.goto(A.url); await ready(p)
  await open(p)
  if (await tour(p)) await tap(p, '.tour-link')
  const state = () => p.evaluate(() => { const a = window.__INSPECK__.app; return { open: a.open, css: a.cssOnHover, target: a.target ? (a.target.id || a.target.className || a.target.tagName) : null, pinned: !!a.pinned } })

  /* I: on and off, with the pointer on the page. */
  await p.mouse.move(300, 300)
  await p.keyboard.press('i'); await p.waitForTimeout(400)
  expect((await state()).open).toBe(false)
  await p.keyboard.press('i'); await p.waitForTimeout(400)
  expect((await state()).open).toBe(true)

  /* C: CSS on hover, on; the card follows the pointer; remembered after a reload; C again turns it off. */
  await p.keyboard.press('c'); await p.waitForTimeout(300)
  expect((await state()).css).toBe(true)
  const price = await at(p, '#card-price')
  await p.mouse.move(price.x, price.y, { steps: 3 }); await p.waitForTimeout(700)
  expect(await shadow(p, root => { const c = root.querySelector('.card'); return !!c && c.dataset.state !== 'out' && !c.hidden && getComputedStyle(c).opacity !== '0' && !!c.querySelector('.decl') })).toBe(true)
  await p.reload(); await ready(p); await open(p)
  expect((await state()).css, 'remembered').toBe(true)
  await p.keyboard.press('c'); await p.waitForTimeout(300)
  expect((await state()).css).toBe(false)

  /* ↑ / ↓: the parent of what's hovered, then back to the child. */
  const priceAgain = await at(p, '#card-price')
  await p.mouse.move(priceAgain.x, priceAgain.y, { steps: 3 }); await p.waitForTimeout(500)
  expect((await state()).target).toBe('card-price')
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300)
  expect((await state()).target, 'its parent').toBe('card')
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(300)
  expect((await state()).target, 'and back').toBe('card-price')

  /* Hold ⇧: spacing shows while held, and goes on release. */
  await p.keyboard.down('Shift'); await p.waitForTimeout(400)
  expect(await shadow(p, root => { const s = root.querySelector('.spacing'); return !!s && !s.hidden })).toBe(true)
  await p.keyboard.up('Shift'); await p.waitForTimeout(300)
  expect(await shadow(p, root => { const s = root.querySelector('.spacing'); return !s || s.hidden })).toBe(true)

  /* Hold Space: a click goes to the app (its button works), and no note opens; Inspeck stays on. */
  await p.evaluate(() => { window.__clicks = 0; document.querySelector('#buy').addEventListener('click', () => window.__clicks++) })
  const buy = await at(p, '#buy')
  await p.mouse.move(buy.x, buy.y, { steps: 2 }); await p.waitForTimeout(300)
  await p.keyboard.down(' '); await p.waitForTimeout(200)
  await p.mouse.click(buy.x, buy.y); await p.waitForTimeout(300)
  await p.keyboard.up(' '); await p.waitForTimeout(300)
  expect(await p.evaluate(() => window.__clicks), 'the app got the click').toBe(1)
  expect(await state()).toMatchObject({ open: true, pinned: false })
  /* Without Space, the same click is a note, and the app doesn't see it. */
  await p.mouse.click(buy.x, buy.y); await p.waitForTimeout(500)
  expect(await p.evaluate(() => window.__clicks)).toBe(1)
  expect((await state()).pinned).toBe(true)

  /* Esc: the note first, then the freeze, then Inspeck. */
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  expect((await state()).pinned, 'Esc closes the note').toBe(false)
  await p.mouse.move(300, 300); await p.keyboard.press('f'); await p.waitForTimeout(400)
  const frozen = () => p.evaluate(() => !!window.__INSPECK__.app.freeze?.active)
  expect(await frozen(), 'F freezes').toBe(true)
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  expect(await frozen(), 'Esc releases the freeze').toBe(false)
  expect((await state()).open).toBe(true)
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  expect((await state()).open, 'then closes Inspeck').toBe(false)

  /* The Shortcuts page: each key lights its keycap while it's down. */
  await open(p)
  await tap(p, '[data-action="settings"]')
  await tap(p, '[data-page="keys"]')
  await p.waitForTimeout(400)
  for (const [key, cap] of [['c', 'c'], ['f', 'f'], ['ArrowUp', 'arrowup'], ['Shift', 'shift']]) {
    await p.keyboard.down(key); await p.waitForTimeout(150)
    expect(await shadow(p, (root, cap) => root.querySelector(`.settings .cap[data-k="${cap}"]`)?.hasAttribute('data-down'), cap), `${key} lights its keycap`).toBe(true)
    await p.keyboard.up(key); await p.waitForTimeout(150)
    expect(await shadow(p, (root, cap) => root.querySelector(`.settings .cap[data-k="${cap}"]`)?.hasAttribute('data-down'), cap)).toBe(false)
  }
})
