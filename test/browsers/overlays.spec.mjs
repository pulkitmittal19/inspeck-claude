/* Dialogs, side sheets, popovers, menus, tooltips and toasts from real libraries: with each open, Inspeck stays
 * on top and usable, and a note placed inside it is typed and sent with the real mouse and keyboard, while the
 * overlay stays open. widget/dev/tables/overlays.html. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

const OVERLAYS = [
  'native-dialog', 'native-popover', 'radix-dialog', 'radix-sheet', 'radix-popover', 'radix-menu', 'radix-tooltip',
  'headless-dialog', 'mui-dialog', 'mui-drawer', 'mui-snackbar', 'antd-modal', 'antd-drawer', 'sonner', 'hot', 'antd-message',
]
const TOAST = { sonner: '.toast-sonner', hot: '.toast-hot', 'antd-message': '.toast-antd' }

for (const k of OVERLAYS) {
  test(k, async ({ page }, info) => {
    const text = `note on ${k} (${info.project.name})`
    await page.goto('tables/overlays.html')
    await page.waitForFunction(() => !!window.overlay && !!window.__INSPECK__?.app)
    await page.evaluate(k => window.overlay.open(k), k)
    await expect.poll(() => page.evaluate(k => window.overlay.isOpen(k), k)).toBe(true)
    await page.waitForTimeout(400)
    await inspeckOn(page)

    /* Inspeck's pill: on top, and a click on Settings opens it. */
    const settings = await page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline')).shadowRoot
      const b = root.querySelector('.bar [data-action="settings"]').getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    await page.mouse.click(settings.x, settings.y)
    await expect.poll(() => page.evaluate(() => window.__INSPECK__.app.settings.open), 'the pill answers clicks').toBe(true)
    await page.mouse.click(settings.x, settings.y)

    /* The thing inside the overlay: hovered, clicked for a note, the note typed, sent. */
    const p = await page.evaluate(({ k, toast }) => {
      let el = document.querySelector(`[data-ov="${k}"] .ov-title`) ?? document.querySelector(`[data-ov="${k}"]`) ?? document.querySelector(toast)
      if (getComputedStyle(el).pointerEvents === 'none') el = [...el.querySelectorAll('*')].find(e => getComputedStyle(e).pointerEvents !== 'none' && e.getBoundingClientRect().width > 0) ?? el
      const b = el.getBoundingClientRect()
      return { x: b.left + Math.min(12, b.width / 2), y: b.top + b.height / 2 }
    }, { k, toast: TOAST[k] })
    await page.mouse.move(p.x, p.y, { steps: 3 })
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => !!window.__INSPECK__.app.target), 'hovering picks something').toBe(true)
    await page.mouse.click(p.x, p.y)
    /* The note box grows open: click it once it's there to click (as a person would), not mid-reveal. */
    const where = () => page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline')).shadowRoot
      const t = root.querySelector('textarea')
      if (!t) return null
      const b = t.getBoundingClientRect()
      const p = { x: b.left + 20, y: b.top + b.height / 2 }
      return root.elementFromPoint(p.x, p.y) === t ? p : null
    })
    await expect.poll(where, { message: 'the note box opens' }).not.toBeNull()
    const box = await where()
    expect(await page.evaluate(k => window.overlay.isOpen(k), k), 'still open after the click').toBe(true)
    await page.mouse.click(box.x, box.y)
    await page.keyboard.type(text, { delay: 15 })
    expect(await page.evaluate(() => {
      const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline'))
      return document.activeElement === host && host.shadowRoot.activeElement?.tagName === 'TEXTAREA' && host.shadowRoot.activeElement.value
    }), 'typing went into the note').toBe(text)
    expect(await page.evaluate(k => window.overlay.isOpen(k), k), 'still open while typing').toBe(true)
    await page.keyboard.press('Enter')
    await expect.poll(async () => page.evaluate(async text => {
      const list = await (await fetch(`/comments?page=${encodeURIComponent(location.href)}`, { headers: { 'x-inspeck': '1' } })).json()
      return list.comments.filter(c => c.note === text).length
    }, text), { timeout: 10_000, message: 'the note is saved, once' }).toBe(1)
    if (!TOAST[k]) expect(await page.evaluate(k => window.overlay.isOpen(k), k), 'still open after sending').toBe(true)
  })
}

test('a toast hovered before Inspeck opens stays while a note is written on it', async ({ page }) => {
  await page.goto('tables/overlays.html')
  await page.waitForFunction(() => !!window.overlay && !!window.__INSPECK__?.app)
  await page.evaluate(() => window.overlay.open('sonner'))
  await page.waitForSelector('.toast-sonner')
  /* It slides in: aim at where it settles, and make sure the pointer is really on it. */
  await page.waitForTimeout(600)
  const p = await page.evaluate(() => { const b = document.querySelector('.toast-sonner').getBoundingClientRect(); return { x: b.left + 30, y: b.top + b.height / 2 } })
  await page.mouse.move(p.x, p.y, { steps: 3 })
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.toast-sonner'), p), 'the pointer is on the toast').toBe(true)
  await page.keyboard.press('i')
  await page.waitForTimeout(6000)
  expect(await page.evaluate(() => window.overlay.isOpen('sonner')), 'still there after its 4 seconds').toBe(true)
})
