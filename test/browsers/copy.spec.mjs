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

test('a CSS row\'s tip lists its sizes and colours every way they\'re written, the code\'s way first and marked', async ({ page }) => {
  await page.goto('picking.html')
  await page.addStyleTag({ content: '#conv { --brand: #3b82f6; padding: 0.75rem; font-size: 14px; color: var(--brand); background: red; }' })
  await page.evaluate(() => { const p = document.createElement('p'); p.id = 'conv'; p.textContent = 'Convert me'; document.body.prepend(p) })
  await inspeckOn(page)
  const at = await page.evaluate(() => { const e = document.getElementById('conv'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 } })
  await page.mouse.move(at.x, at.y, { steps: 2 })
  await page.waitForTimeout(150)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(500)
  const root = () => page.evaluateHandle(() => document.querySelector('inspeck-root').shadowRoot)
  /** Rest on the row for a property; the tip's lines, each "label value [code]", grouped by part. */
  const tipFor = async prop => {
    const r = await page.evaluate(prop => {
      const row = [...document.querySelector('inspeck-root').shadowRoot.querySelectorAll('.card .decl')].find(d => d.querySelector('.c-prop')?.textContent === prop)
      const b = row.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }
    }, prop)
    await page.mouse.move(r.x, r.y, { steps: 3 })
    await page.waitForTimeout(600)
    return (await root()).evaluate(s => [...s.querySelectorAll('.card-tip[data-show] .tip-part')].map(p => [...p.children].map(l => [...l.children].map(c => c.textContent).join(' '))))
  }
  /* The note's CSS, opened from its head if it's folded. */
  if (await (await root()).evaluate(s => !s.querySelector('.card .css-wrap')?.hasAttribute('data-open'))) {
    const head = await (await root()).evaluate(s => { const b = s.querySelector('.card .card-head .label').getBoundingClientRect(); return { x: b.left + 4, y: b.top + b.height / 2 } })
    await page.mouse.click(head.x, head.y)
    await page.waitForTimeout(500)
  }
  expect(await tipFor('font-size')).toEqual([['px 14px code', 'rem 0.875rem']])
  const blue = await tipFor('color')
  expect(blue[0].slice(0, 2), 'a token: its resolved colour, which isn\'t the code\'s way').toEqual(['hex #3B82F6', 'rgb rgb(59, 130, 246)'])
  expect(blue[0][2]).toMatch(/^oklch oklch\(/)
  expect(await tipFor('padding'), 'rem to px too').toEqual([['rem 0.75rem code', 'px 12px']])
  expect((await tipFor('background'))[0].slice(0, 3), 'a named colour, in all three').toEqual(['name red code', 'hex #F00', 'rgb rgb(255, 0, 0)'])
  /* Settings has no sizes or colours rows any more. */
  expect(await (await root()).evaluate(s => s.querySelectorAll('.seg-opt').length)).toBe(0)
})
