/* A note's address still finds its element after the page loads again (Claude often reads it after a reload or a
 * hot update): every element on the same screen in six design systems, whose libraries make up ids of their own. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

for (const ds of ['shadcn', 'mui', 'antd', 'chakra', 'mantine', 'primer']) {
  test(`${ds}: addresses survive a reload`, async ({ page }) => {
    const ready = () => page.waitForFunction(() => window.systemReady && document.getElementById('primary'))
    await page.goto(`tables/systems.html?ds=${ds}`)
    await ready()
    await inspeckOn(page)
    const before = await page.evaluate(() => [...document.querySelectorAll('#root *')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({
      sel: window.__INSPECK__.app.noteFor(e, '', null).element.selector, tag: e.tagName, text: (e.textContent || '').trim().slice(0, 30),
    })))
    await page.reload()
    await ready()
    await page.waitForTimeout(300)
    const broken = await page.evaluate(list => list.filter(x => {
      const f = document.querySelectorAll(x.sel)
      return f.length !== 1 || f[0].tagName !== x.tag || (f[0].textContent || '').trim().slice(0, 30) !== x.text
    }).map(x => `${x.sel} (${x.tag.toLowerCase()} “${x.text}”)`), before)
    expect(before.length).toBeGreaterThan(80)
    expect(broken).toEqual([])
  })
}
