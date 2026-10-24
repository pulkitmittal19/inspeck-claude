/* Long lists that keep only the visible rows and reuse them as you scroll (widget/dev/tables/virtual.html): a note's
 * marker stays on its row, or waits hidden while the row is scrolled away; never on another row. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

const ROW = 'Order #3'

for (const lib of ['recycle', 'vaadin', 'aggrid']) {
  test(`${lib}: a note's marker never moves to another row`, async ({ page }, info) => {
    const text = `wrong total (${lib}, ${info.project.name})`
    await page.goto(`tables/virtual.html?lib=${lib}`)
    await page.waitForFunction(() => window.listIsReady, null, { timeout: 30_000 })
    await inspeckOn(page)
    /* The row's name: the deepest element whose own words are exactly it. */
    const p = await page.evaluate(row => {
      const e = [...document.querySelectorAll('body *')].find(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === row) && e.getBoundingClientRect().width > 0)
      const b = e.getBoundingClientRect()
      return { x: b.left + 8, y: b.top + b.height / 2 }
    }, ROW)
    await page.mouse.move(p.x, p.y, { steps: 2 })
    await page.waitForTimeout(150)
    await page.mouse.click(p.x, p.y)
    await page.keyboard.type(text, { delay: 10 })
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(async text => {
      const list = await (await fetch(`/comments?page=${encodeURIComponent(location.href)}`, { headers: { 'x-inspeck': '1' } })).json()
      return list.comments.filter(c => c.note === text).length
    }, text), { timeout: 10_000 }).toBe(1)
    await page.keyboard.press('Escape')

    /** The row the marker is on now: its words, or null when it waits hidden. */
    const markedRow = () => page.evaluate(async text => {
      const list = await (await fetch(`/comments?page=${encodeURIComponent(location.href)}`, { headers: { 'x-inspeck': '1' } })).json()
      const note = list.comments.find(c => c.note === text)
      const el = window.__INSPECK__.app.notes.find(note)
      return el ? (el.innerText ?? el.textContent).trim() : null
    }, text)
    expect(await markedRow(), 'on its row').toBe(ROW)
    for (const [to, label] of [[500, 'scrolled far away'], [25, 'beside Order #30'], [0, 'back at the top']]) {
      await page.evaluate(i => window.scrollToRow(i), to)
      await page.waitForTimeout(600)
      const on = await markedRow()
      if (to === 0) expect(on, label).toBe(ROW)
      else expect([ROW, null], `${label}: on “${on}”`).toContain(on)
    }
    /* Words added to it (an edit, as Claude would make): still the same row. */
    if (lib === 'recycle') {
      await page.evaluate(() => { window.ORDERS[2].name = 'Order #3 (late)'; document.getElementById('list').dispatchEvent(new Event('scroll')) })
      await page.waitForTimeout(400)
      expect(await markedRow(), 'words added to it').toBe('Order #3 (late)')
    }
  })
}
