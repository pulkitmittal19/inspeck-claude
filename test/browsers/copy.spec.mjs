/* Copy on a note's card gives the note (sent or not), where the element is, and its CSS. widget/dev/picking.html. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

test('Copy gives the note, the place and the CSS', async ({ page }) => {
  await page.goto('picking.html')
  await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async t => { window.__copied.push(t) } })
  await inspeckOn(page)
  const p = await page.evaluate(() => { const e = document.getElementById('card-title'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 } })
  await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.waitForTimeout(150)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.type('make this bolder', { delay: 10 })
  const copy = await page.evaluate(() => { const b = document.querySelector('inspeck-root').shadowRoot.querySelector('.card [data-action="copy"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
  await page.mouse.click(copy.x, copy.y)
  await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(1)
  const text = await page.evaluate(() => window.__copied[0])
  console.log(text)
  expect(text).toMatch(/^Note: make this bolder\nPage: [^\n]+\/picking\.html\nElement: [^\n]*#card-title[^\n]*"Quarterly report"/)
  expect(text).toMatch(/\n\n#card-title \{\n  [a-z-]+: [^\n]+;\n[\s\S]*\}$/)
})
