/* Tables inside iframes: same-site, nested, inline (srcdoc), scaled, added later; and another site's frame. */
import { test, expect } from '@playwright/test'
import { hover, inspeckOn, probe, picked } from './helpers.mjs'

test('every frame Inspeck can reach runs it, and picks inside it', async ({ page }) => {
  await page.goto('tables/frames.html')
  await inspeckOn(page)
  await page.waitForSelector('#f-late')
  const frameOf = async sel => (await page.$(sel)).contentFrame()
  const nested = await (await (await frameOf('#f-nested')).$('#inner')).contentFrame()
  const frames = {
    native: await frameOf('#f-native'), srcdoc: await frameOf('#f-srcdoc'), scaled: await frameOf('#f-scaled'),
    late: await frameOf('#f-late'), nested,
  }
  for (const [name, f] of Object.entries(frames)) {
    await f.waitForFunction(() => !!window.__INSPECK__?.app, null, { timeout: 20_000 })
    const r = await probe(page, f, { limit: 25 })
    expect(r.tested, `${name}: something tested`).toBeGreaterThan(2)
    expect(r.bad, name).toEqual([])
  }
})

test('a frame from another site is noted as a whole', async ({ page }, info) => {
  const text = `embed is too tall (${info.project.name})`
  await page.goto('tables/frames.html')
  await inspeckOn(page)
  /* A frame is added late, above this one: measure once the page has stopped moving. */
  await page.waitForSelector('#f-late')
  await page.waitForTimeout(300)
  const box = await page.evaluate(() => { const f = document.getElementById('f-cross'); f.scrollIntoView({ block: 'center' }); const b = f.getBoundingClientRect(); return { x: b.left + 40, y: b.top + 40 } })
  await page.mouse.move(box.x - 60, box.y - 60)
  await hover(page, page.mainFrame(), box.x, box.y)
  expect(await picked(page)).toBe('#f-cross')
  /* Moving about inside it keeps it picked; a click opens a note on it, and it's sent. */
  await hover(page, page.mainFrame(), box.x + 30, box.y + 10)
  expect(await picked(page)).toBe('#f-cross')
  await page.mouse.click(box.x + 30, box.y + 10)
  await page.keyboard.type(text, { delay: 10 })
  await page.keyboard.press('Enter')
  await expect.poll(async () => page.evaluate(async text => {
    const list = await (await fetch(`/comments?page=${encodeURIComponent(location.href)}`, { headers: { 'x-inspeck': '1' } })).json()
    return list.comments.filter(c => c.note === text).map(c => c.element.selector)
  }, text), { timeout: 10_000 }).toEqual(['#f-cross'])
  /* And off it, the page is picked as usual. */
  await page.waitForTimeout(1500)
  await hover(page, page.mainFrame(), box.x - 60, box.y - 60)
  await hover(page, page.mainFrame(), box.x - 40, box.y - 61)
  expect(await picked(page)).not.toBe('#f-cross')
})
