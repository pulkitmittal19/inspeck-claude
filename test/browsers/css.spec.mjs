/* The CSS a note carries is what's in effect, written as the code writes it. Checked without trusting Inspeck's own
 * reading of the cascade: each line, applied to the element as written (var() and all), must leave the element's
 * computed style exactly as it was. Picking a declaration that loses the cascade changes it. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

const PAGES = [...['shadcn', 'mui', 'antd', 'chakra', 'mantine', 'primer'].map(ds => [ds, `tables/systems.html?ds=${ds}`, '#root *']), ['cascade', 'tables/cascade.html', 'body *']]

for (const [name, url, scope] of PAGES) {
  test(`${name}: every CSS line is the one in effect`, async ({ page }) => {
    await page.goto(url)
    await page.waitForFunction(() => !!window.__INSPECK__?.app && (window.systemReady !== false), null, { timeout: 30_000 })
    await page.waitForTimeout(500)
    await inspeckOn(page)
    const r = await page.evaluate(scope => {
      const app = window.__INSPECK__.app
      const calm = new CSSStyleSheet(); calm.replaceSync('*, *::before, *::after { transition: none !important; animation: none !important; }')
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, calm]
      const PROPS = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-color', 'border-top-style',
        'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
        'background-color', 'background-image', 'color', 'font-size', 'font-weight', 'line-height', 'font-family', 'letter-spacing',
        'row-gap', 'column-gap', 'display', 'opacity', 'box-shadow', 'object-fit']
      /* Inspeck shows px to two decimals (13.33px for 13.333px): the same to that precision is the same. */
      const round = v => v.replace(/-?\d+\.\d+/g, n => String(Math.round(parseFloat(n) * 100) / 100))
      const snap = el => { const cs = getComputedStyle(el); return PROPS.map(p => round(cs.getPropertyValue(p))) }
      const wrong = [], skipped = []
      let lines = 0, unread = 0, tokens = 0, elements = 0
      const all = [...document.querySelectorAll(scope)]
      for (const e of [...all]) if (e.shadowRoot) all.push(...e.shadowRoot.querySelectorAll('*'))
      for (const el of all) {
        if (el.closest('inspeck-root') || el.getBoundingClientRect().width === 0) continue
        app.card.showHover(el)
        const d = app.card.description
        if (!d) continue
        elements++
        const base = snap(el)
        const style = el.getAttribute('style')
        for (const l of d.lines) {
          lines++
          if (l.unread) { unread++; continue }
          if (/var\(/.test(l.value)) tokens++
          /* Lines that describe rather than set (a range, a summary) can't be applied back. */
          if (!CSS.supports(l.prop, l.value)) { skipped.push(`${l.prop}: ${l.value}`); continue }
          el.style.setProperty(l.prop, l.value, 'important')
          const now = snap(el)
          const diff = PROPS.filter((p, i) => now[i] !== base[i]).map(p => `${p} ${base[PROPS.indexOf(p)]} → ${now[PROPS.indexOf(p)]}`)
          if (diff.length) wrong.push(`${d.label}  ${l.prop}: ${l.value}  [${diff.join('; ')}]`)
          style === null ? el.removeAttribute('style') : el.setAttribute('style', style)
        }
      }
      app.card.hide()
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== calm)
      /* And where the page says what a note should read: exactly that. */
      const want = []
      for (const el of all.filter(e => e.dataset.want)) {
        app.card.showHover(el)
        const [prop, ...rest] = el.dataset.want.split(': ')
        const got = app.card.description?.lines.find(l => l.prop === prop)
        if (!got || got.value !== rest.join(': ')) want.push(`${el.id || el.className}: want “${el.dataset.want}”, got “${got ? `${got.prop}: ${got.value}` : 'no ' + prop}”`)
      }
      app.card.hide()
      return { want, elements, lines, tokens, unread, skipped: [...new Set(skipped)].slice(0, 15), wrong: wrong.slice(0, 40), wrongCount: wrong.length }
    }, scope)
    console.log(name, JSON.stringify({ elements: r.elements, lines: r.lines, tokens: r.tokens, unread: r.unread, wrong: r.wrongCount, skipped: r.skipped }))
    expect(r.elements).toBeGreaterThan(5)
    expect(r.wrong).toEqual([])
    expect(r.want).toEqual([])
  })
}
