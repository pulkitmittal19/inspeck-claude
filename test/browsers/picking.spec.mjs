/* Picking with the real mouse: the smallest real thing under the pointer, in each engine. widget/dev/picking.html. */
import { test, expect } from '@playwright/test'
import { hover, inspeckOn, picked } from './helpers.mjs'

/** A point on an element (fractions of its box), or on a word inside it. */
const at = (id, fx = 0.5, fy = 0.5) => ({ id, fx, fy })
const word = (id, w) => ({ id, word: w })

const CASES = [
  ['button text', word('save', 'changes'), 'text in #save'],
  ['button icon that ignores the pointer', at('save-icon'), '#save-icon'],
  ['button padding', at('save', 0.97), '#save'],
  ['button label span', at('export-label'), '#export-label'],
  ['icon-only button: icon', at('more-icon'), '#more-icon'],
  ['icon-only button: edge', at('more', 0.08), '#more'],
  ['role table: name', at('aria-name'), '#aria-name'],
  ['role table: avatar', at('aria-avatar'), '#aria-avatar'],
  ['role table: badge', at('aria-badge'), '#aria-badge'],
  ['role table: plain cell', word('aria-plan', 'Pro'), '#aria-plan'],
  ['table: name', at('td-name'), '#td-name'],
  ['table: badge', at('td-badge'), '#td-badge'],
  ['table: padded cell text', word('td-plan', 'Team'), 'text in #td-plan'],
  ['table: padded cell edge', at('td-plan', 0.95), '#td-plan'],
  ['link card: title', at('card-title'), '#card-title'],
  ['link card: paragraph', at('card-desc', 0.2), '#card-desc'],
  ['link card: image', at('card-img'), '#card-img'],
  ['link card: chip', at('card-chip'), '#card-chip'],
  ['link card: padding', at('card', 0.02), '#card'],
  ['avatar with initials', word('initials', 'AL'), '#initials'],
  ['stretched link card: title', at('stretched-title'), '#stretched-title'],
  ['stretched link card: link', at('stretched-link'), '#stretched-link'],
  ['stretched link card: padding', at('stretched', 0.02, 0.9), '#stretched'],
  ['menu item: label', at('mi-label'), '#mi-label'],
  ['menu item: icon', at('mi-icon'), '#mi-icon'],
  ['menu item: shortcut', at('mi-kbd'), '#mi-kbd'],
  ['label: text', at('label-text'), '#label-text'],
  ['label: checkbox', at('checkbox'), '#checkbox'],
]

test('the smallest real thing under the pointer is picked', async ({ page }) => {
  await page.goto('picking.html')
  await inspeckOn(page)
  const misses = []
  for (const [name, where, want] of CASES) {
    const p = await page.evaluate(({ id, fx, fy, word }) => {
      const el = document.getElementById(id)
      el.scrollIntoView({ block: 'center' })
      if (word) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n; (n = w.nextNode());) {
          const i = n.textContent.indexOf(word)
          if (i < 0) continue
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length)
          const b = r.getBoundingClientRect()
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        }
      }
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width * (fx ?? 0.5), y: b.top + b.height * (fy ?? 0.5) }
    }, where)
    await hover(page, page.mainFrame(), p.x, p.y)
    const got = await picked(page)
    if (got !== want) misses.push(`${name}: ${got} (want ${want})`)
  }
  expect(misses).toEqual([])
})

test('a tooltip is picked once the pointer rests on it; a decoration that ignores the pointer never is', async ({ page }) => {
  await page.goto('picking.html')
  await inspeckOn(page)
  for (const [id, want] of [['tip', '#tip'], ['near-spin', '#near-spin'], ['copy', 'text in #copy']]) {
    const p = await page.evaluate(id => { const e = document.getElementById(id); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, id)
    await hover(page, page.mainFrame(), p.x, p.y, 900)
    expect(await picked(page), id).toBe(want)
  }
})

test('I opens and closes Inspeck', async ({ page }) => {
  await page.goto('picking.html')
  await page.waitForFunction(() => !!window.__INSPECK__?.app)
  await page.mouse.move(400, 300)
  await page.keyboard.press('i')
  await expect.poll(() => page.evaluate(() => window.__INSPECK__.app.open)).toBe(true)
  await page.keyboard.press('i')
  await expect.poll(() => page.evaluate(() => window.__INSPECK__.app.open)).toBe(false)
})
