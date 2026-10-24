/* Not a check: pictures for a person to judge. For every piece of words on each design system's screen, the real
 * hover (Inspeck's outline and its label) is captured, with whether it picked the words or the element, into
 * review/ (not test-results/, which each run clears) with one page to look through and mark: review/picking-review.html.
 * Runs only with INSPECK_REVIEW=1, in Chrome: INSPECK_REVIEW=1 npm run test:browsers -- review --project=chrome */
import { test } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inspeckOn, hover } from './helpers.mjs'
import { writeReviewPage } from './review-page.mjs'

const OUT = join(process.cwd(), 'review')
test.describe.configure({ mode: 'serial' })
const SYSTEMS = ['shadcn', 'mui', 'antd', 'chakra', 'mantine', 'primer']
test.skip(!process.env.INSPECK_REVIEW, 'set INSPECK_REVIEW=1 to make the review pictures')

for (const ds of SYSTEMS) {
  test(ds, async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome')
    test.setTimeout(240_000)
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto(`tables/systems.html?ds=${ds}`)
    await page.waitForFunction(() => window.systemReady && document.getElementById('primary'), null, { timeout: 30_000 })
    await page.waitForTimeout(300)
    await inspeckOn(page)
    /* Each element with words of its own, once. */
    const count = await page.evaluate(() => {
      const host = document.querySelector('inspeck-root')
      let n = 0
      for (const e of document.querySelectorAll('#root *')) {
        if (host.contains(e)) continue
        const tn = [...e.childNodes].find(c => c.nodeType === 3 && c.textContent.trim())
        if (!tn) continue
        const cs = getComputedStyle(e)
        if (cs.visibility !== 'visible' || +cs.opacity === 0) continue
        const rg = document.createRange(); rg.selectNodeContents(tn)
        const rr = rg.getClientRects()[0]
        if (!rr || rr.width < 4) continue
        e.setAttribute('data-review', String(n++))
      }
      return n
    })
    const rows = []
    for (let i = 0; i < count; i++) {
      const at = await page.evaluate(i => {
        const e = document.querySelector(`[data-review="${i}"]`)
        e.scrollIntoView({ block: 'center' })
        const tn = [...e.childNodes].find(c => c.nodeType === 3 && c.textContent.trim())
        const rg = document.createRange(); rg.selectNodeContents(tn)
        const rr = rg.getClientRects()[0], b = e.getBoundingClientRect()
        return { x: rr.left + Math.min(rr.width / 2, 12), y: rr.top + rr.height / 2, box: { x: b.left, y: b.top, w: b.width, h: b.height }, words: tn.textContent.trim().slice(0, 40), tag: e.tagName.toLowerCase(), cls: (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/)[0] ?? '' }
      }, i)
      await page.mouse.move(5, 5)
      await page.waitForTimeout(60)
      await hover(page, page.mainFrame(), at.x, at.y, 250)
      const got = await page.evaluate(() => {
        const { target, textPick } = window.__INSPECK__.app
        const label = document.querySelector('inspeck-root').shadowRoot.querySelector('.card .label')?.textContent ?? ''
        return { text: !!textPick, label, picked: target ? target.tagName.toLowerCase() + (typeof target.className === 'string' && target.className.trim() ? '.' + target.className.trim().split(/\s+/)[0] : '') : 'none' }
      })
      /* The thing, the outline round it and the label above or below it. */
      const pad = 70
      const clip = { x: Math.max(0, at.box.x - pad), y: Math.max(0, at.box.y - pad), width: Math.min(at.box.w + pad * 2, 1100), height: Math.min(at.box.h + pad * 2, 400) }
      const file = `${ds}-${i}.jpg`
      await page.screenshot({ path: join(OUT, file), clip, type: 'jpeg', quality: 70 })
      rows.push({ ds, file, ...at, ...got })
    }
    writeFileSync(join(OUT, `${ds}.json`), JSON.stringify(rows))
  })
}

test.afterAll(() => {
  if (!process.env.INSPECK_REVIEW) return
  const rows = readdirSync(OUT).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(readFileSync(join(OUT, f), 'utf8')))
  writeReviewPage(OUT, rows, join(OUT, 'picking-review.html'))
})
