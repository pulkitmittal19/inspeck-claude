/* Keyboard clashes (widget/dev/tables/keys.html): I and Inspeck's other keys type normally in every kind of place an
 * app types into, and typing a note never sets off the app's own shortcuts. */
import { test, expect } from '@playwright/test'
import { inspeckOn } from './helpers.mjs'

/** Each place to type: how to put the cursor in it, and what's typed there. */
const FIELDS = {
  input: ['#input', 'e => e.value'],
  textarea: ['#textarea', 'e => e.value'],
  contenteditable: ['#ce', 'e => e.textContent'],
  'open shadow root': ['#open', 'e => e.shadowRoot.querySelector("input").value', 'e => e.shadowRoot.querySelector("input").focus()'],
  'closed shadow root': ['#closed', 'e => e._input.value', 'e => e._input.focus()'],
  'role="textbox" editor': ['#role', 'e => e.textContent'],
  CodeMirror: ['#cm', '() => window.cm.state.doc.toString()', '() => { window.cm.focus(); window.cm.dispatch({ selection: { anchor: window.cm.state.doc.length } }) }'],
  Monaco: ['#monaco', '() => window.monacoEditor.getValue()', '() => { const m = window.monacoEditor; m.focus(); m.setPosition({ lineNumber: 1, column: 6 }) }'],
}

async function load(page) {
  await page.goto('tables/keys.html')
  await page.waitForFunction(() => !!window.__INSPECK__?.app && window.cm && window.monacoEditor, null, { timeout: 30_000 })
}
const focus = (page, sel, how) => page.evaluate(([sel, how]) => { const e = document.querySelector(sel); how ? new Function('e', `return (${how})(e)`)(e) : e.focus() }, [sel, how])
const read = (page, sel, how) => page.evaluate(([sel, how]) => new Function('e', `return (${how})(e)`)(document.querySelector(sel)), [sel, how])

test('with Inspeck off, I types an I in every kind of field', async ({ page }) => {
  await load(page)
  const wrong = []
  for (const [name, [sel, get, how]] of Object.entries(FIELDS)) {
    await focus(page, sel, how)
    await page.keyboard.press('i')
    await page.waitForTimeout(100)
    const open = await page.evaluate(() => window.__INSPECK__.app.open)
    const typed = (await read(page, sel, get)).includes('i')
    if (open || !typed) wrong.push(`${name}: ${open ? 'Inspeck turned on' : ''}${!typed ? ' no i typed' : ''}`)
    if (open) await page.evaluate(() => window.__INSPECK__.app.setOpen(false))
  }
  /* A focused dropdown takes letters to jump to an option. */
  await page.focus('#select')
  await page.keyboard.press('i')
  if (await page.evaluate(() => window.__INSPECK__.app.open)) wrong.push('select: Inspeck turned on')
  expect(wrong).toEqual([])
})

test('with Inspeck on, typing in the app’s fields stays typing', async ({ page }) => {
  await load(page)
  const wrong = []
  for (const [name, [sel, get, how]] of Object.entries(FIELDS)) {
    await focus(page, sel, how)
    await inspeckOn(page)
    const before = await page.evaluate(() => { const a = window.__INSPECK__.app; return JSON.stringify([a.open, a.cssOnHover, a.freeze.manual, !!a.through]) })
    await page.keyboard.type('icf ', { delay: 20 })
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => { const a = window.__INSPECK__.app; return JSON.stringify([a.open, a.cssOnHover, a.freeze.manual, !!a.through]) })
    const typed = (await read(page, sel, get)).includes('icf')
    if (before !== after || !typed) wrong.push(`${name}: ${before !== after ? `Inspeck changed ${before} → ${after}` : ''}${!typed ? ' “icf” not typed' : ''}`)
    await page.evaluate(() => window.__INSPECK__.app.setOpen(false))
    await page.keyboard.up(' ')
  }
  expect(wrong).toEqual([])
})

test('typing a note never sets off the app’s shortcuts', async ({ page }) => {
  await load(page)
  await inspeckOn(page)
  const p = await page.evaluate(() => { const b = document.getElementById('target').getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 } })
  await page.mouse.move(p.x, p.y, { steps: 2 }); await page.waitForTimeout(150); await page.mouse.click(p.x, p.y)
  const text = 'just a /quick/ note: jk if c'
  await page.keyboard.type(text, { delay: 15 })
  const state = () => page.evaluate(() => {
    const host = document.querySelector('inspeck-root')
    return { fired: window.fired.slice(), inNote: document.activeElement === host && host.shadowRoot.activeElement?.tagName === 'TEXTAREA', note: host.shadowRoot.querySelector('textarea')?.value }
  })
  expect(await state()).toEqual({ fired: [], inNote: true, note: text })
  /* Escape closes the note, and the app doesn't hear it either. */
  await page.keyboard.press('Escape')
  expect((await state()).fired).toEqual([])
})
