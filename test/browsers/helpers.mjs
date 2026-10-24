/* What the browser tests share: waiting for Inspeck, and hovering things with the real mouse, in any frame. */
import { expect } from '@playwright/test'

/** Inspeck started in this frame (or page), and open. */
export async function inspeckOn(frame) {
  await frame.waitForFunction(() => !!window.__INSPECK__?.app, null, { timeout: 15_000 })
  await frame.evaluate(() => window.__INSPECK__.app.setOpen(true))
  /* The pill grows open: let it settle before anything is clicked on it. */
  await frame.waitForTimeout(450)
}

/** Where a point in a frame is on the top page, for the real mouse. */
export async function toTop(frame, x, y) {
  for (let f = frame; f.parentFrame(); f = f.parentFrame()) {
    /* The frame's box on its page, its border, and how much a CSS transform scales it (scale(0.6)). */
    const m = await (await f.frameElement()).evaluate(e => { const b = e.getBoundingClientRect(); const k = b.width / e.offsetWidth || 1; return { x: b.left, y: b.top, inX: e.clientLeft, inY: e.clientTop, k } })
    x = m.x + (m.inX + x) * m.k
    y = m.y + (m.inY + y) * m.k
  }
  return { x, y }
}

/** What Inspeck has picked in a frame: the element's id or tag, and whether it's the words in it. */
export const picked = frame => frame.evaluate(() => {
  const { target, textPick } = window.__INSPECK__.app
  const name = target ? (target.id ? `#${target.id}` : target.tagName.toLowerCase()) : 'none'
  return textPick ? `text in ${name}` : name
})

/** Move the real mouse to a point in a frame and let Inspeck pick. */
export async function hover(page, frame, x, y, settle = 120) {
  const p = await toTop(frame, x, y)
  await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.waitForTimeout(settle)
}

/**
 * Hover every small thing on a frame (icons, badges, words, buttons, inputs) with the real mouse, and check
 * Inspeck picks it, or something inside it, or the words in it: never a container around it. And the address a
 * note on it would carry finds that one element again, and nothing else.
 */
export async function probe(page, frame, { limit = 120 } = {}) {
  const points = await frame.evaluate(limit => {
    const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline'))
    const all = []
    const walk = root => { for (const e of root.querySelectorAll('*')) { if (e === host) continue; all.push(e); if (e.shadowRoot) walk(e.shadowRoot) } }
    walk(document)
    const MEDIA = /^(img|svg|input|button|i|select|textarea)$/i
    const phrasing = /^(b|strong|em|i|code|small|sup|sub|abbr|mark|u|s|br|wbr)$/i
    const ownText = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    const leafy = e => MEDIA.test(e.tagName) || (ownText(e) && [...e.children].every(c => phrasing.test(c.tagName))) || /badge|tag|chip|avatar|icon/i.test(typeof e.className === 'string' ? e.className : '')
    const seen = new Set(), out = []
    for (const e of all) {
      if (out.length >= limit) break
      if (e instanceof SVGElement && !(e instanceof SVGSVGElement)) continue
      if (/^(script|style|head|title|meta|link|option|html|body)$/i.test(e.tagName)) continue
      const r = e.getBoundingClientRect()
      if (r.width < 5 || r.height < 5) continue
      const cs = getComputedStyle(e)
      if (cs.visibility !== 'visible' || cs.display === 'none' || +cs.opacity === 0 || !leafy(e)) continue
      const key = e.tagName + '|' + e.className + '|' + (e.textContent || '').trim().slice(0, 20)
      if (seen.has(key)) continue
      seen.add(key)
      e.setAttribute('data-probe', String(out.length))
      out.push(out.length)
    }
    return out
  }, limit)
  const bad = []
  let good = 0, covered = 0
  for (const i of points) {
    const at = await frame.evaluate(i => {
      const c = document.querySelector(`[data-probe="${i}"]`) ?? [...document.querySelectorAll('*')].flatMap(e => e.shadowRoot ? [...e.shadowRoot.querySelectorAll(`[data-probe="${i}"]`)] : []).at(0)
      c.scrollIntoView({ block: 'center', inline: 'center' })
      const tn = [...c.childNodes].find(n => n.nodeType === 3 && n.textContent.trim())
      let x, y
      if (tn && !/^(img|svg|input|button|i|select|textarea)$/i.test(c.tagName)) {
        const rg = document.createRange(); rg.selectNodeContents(tn)
        const rr = [...rg.getClientRects()][0]
        if (!rr) return null
        x = rr.left + Math.min(rr.width / 2, 12); y = rr.top + rr.height / 2
      } else {
        const r = c.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2
      }
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null
      let hit = document.elementFromPoint(x, y)
      while (hit?.shadowRoot) { const inner = hit.shadowRoot.elementFromPoint(x, y); if (!inner || inner === hit) break; hit = inner }
      const parent = n => n.parentElement ?? (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null)
      const inside = (a, b) => { for (let n = a; n; n = parent(n)) if (n === b) return true; return false }
      const ignores = getComputedStyle(c).pointerEvents === 'none'
      if (!hit || !(inside(hit, c) || (ignores && inside(c, hit)))) return null
      return { x, y }
    }, i)
    if (!at) { covered++; continue }
    await page.waitForTimeout(30)
    await hover(page, frame, at.x, at.y, 90)
    const verdict = await frame.evaluate(i => {
      const c = document.querySelector(`[data-probe="${i}"]`) ?? [...document.querySelectorAll('*')].flatMap(e => e.shadowRoot ? [...e.shadowRoot.querySelectorAll(`[data-probe="${i}"]`)] : []).at(0)
      const { target, textPick } = window.__INSPECK__.app
      const parent = n => n.parentElement ?? (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null)
      const inside = (a, b) => { for (let n = a; n; n = parent(n)) if (n === b) return true; return false }
      const name = e => e ? `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : ''}` : 'none'
      const ok = target && (inside(target, c) || (textPick && inside(textPick.parentNode, c)))
      if (!ok) return `${name(c)} “${(c.textContent || '').trim().slice(0, 24)}” → ${textPick ? 'text in ' : ''}${name(target)}`
      /* And the note's address leads back to exactly what was picked, and nothing else on the page. */
      const { selector } = window.__INSPECK__.app.noteFor(target, '', textPick).element
      let scope = document, found = null
      for (const part of selector.split(' >>> ')) {
        const all = scope ? scope.querySelectorAll(part) : []
        if (all.length !== 1) return `address “${selector}” finds ${all.length} elements, for ${name(target)}`
        found = all[0]; scope = found.shadowRoot
      }
      return found === target ? null : `address “${selector}” finds another element, for ${name(target)}`
    }, i)
    if (verdict) bad.push(verdict)
    else good++
  }
  return { tested: good + bad.length, good, covered, bad }
}

export { expect }
