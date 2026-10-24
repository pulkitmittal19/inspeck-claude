/* The same everyday screen in six design systems (widget/dev/tables/systems.html): every small thing on it,
 * hovered with the real mouse, is picked, or the words in it, never a container around it. */
import { test, expect } from '@playwright/test'
import { inspeckOn, probe } from './helpers.mjs'

const SYSTEMS = ['shadcn', 'mui', 'antd', 'chakra', 'mantine', 'primer']

for (const ds of SYSTEMS) {
  test(ds, async ({ page }) => {
    await page.goto(`tables/systems.html?ds=${ds}`)
    await page.waitForFunction(() => window.systemReady && document.getElementById('primary'), null, { timeout: 30_000 })
    await page.waitForTimeout(300)
    await inspeckOn(page)
    const r = await probe(page, page.mainFrame(), { limit: 150 })
    expect(r.tested, 'something was tested').toBeGreaterThan(15)
    expect(r.bad).toEqual([])
  })
}
