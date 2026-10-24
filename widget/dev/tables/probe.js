/* Hover every small thing in this page's tables and check what Inspeck picks. Loaded by hand while testing. */
window.inspeckProbe = async function ({ limit = 160 } = {}) {
  const app = window.__INSPECK__?.app
  if (!app) return { error: 'no Inspeck here' }
  app.setOpen(true)
  for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r))
  const tick = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0) })
  const sleep = async ms => { const t = performance.now(); while (performance.now() - t < ms) await tick() }
  /* Two real frames (Inspeck picks on the next one), or a moment, when the pane is hidden and frames don't come. */
  const frame = () => Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), sleep(60)])
  const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline'))
  const all = []
  const walk = root => { for (const e of root.querySelectorAll('*')) { if (e === host) continue; all.push(e); if (e.shadowRoot && e !== host) walk(e.shadowRoot) } }
  walk(document)
  const MEDIA = /^(img|svg|input|button|i|select|textarea)$/i
  const ownText = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
  const phrasing = /^(b|strong|em|i|code|small|sup|sub|abbr|mark|u|s|br|wbr)$/i
  const leafy = e => MEDIA.test(e.tagName) || (ownText(e) && [...e.children].every(c => phrasing.test(c.tagName))) || /badge|tag|chip|avatar|icon/i.test(typeof e.className === 'string' ? e.className : '')
  const seen = new Set()
  const cands = all.filter(e => {
    if (e instanceof SVGElement && !(e instanceof SVGSVGElement)) return false
    if (/^(script|style|head|title|meta|link|option|html|body)$/i.test(e.tagName)) return false
    const r = e.getBoundingClientRect(); if (r.width < 5 || r.height < 5) return false
    const cs = getComputedStyle(e); if (cs.visibility !== 'visible' || cs.display === 'none' || +cs.opacity === 0) return false
    if (!leafy(e)) return false
    const key = e.tagName + '|' + e.className + '|' + (e.textContent || '').trim().slice(0, 20)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit)
  const deepAt = (x, y) => { let e = document.elementFromPoint(x, y); while (e?.shadowRoot) { const i = e.shadowRoot.elementFromPoint(x, y); if (!i || i === e) break; e = i } return e }
  const parent = n => n.parentElement ?? (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null)
  const inside = (a, b) => { for (let n = a; n; n = parent(n)) if (n === b) return true; return false }
  const name = e => e ? `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}` : 'none'
  let good = 0, covered = 0
  const bad = []
  for (const c of cands) {
    c.scrollIntoView({ block: 'center', inline: 'center' }); await frame()
    let x, y
    const tn = [...c.childNodes].find(n => n.nodeType === 3 && n.textContent.trim())
    if (tn && !MEDIA.test(c.tagName)) { const rg = document.createRange(); rg.selectNodeContents(tn); const rr = [...rg.getClientRects()][0]; if (!rr) continue; x = rr.left + Math.min(rr.width / 2, 12); y = rr.top + rr.height / 2 }
    else { const r = c.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2 }
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { covered++; continue }
    const hit = deepAt(x, y)
    /* What shows there must be the thing or in it, or the thing ignores the pointer and its holder answers. */
    const ignores = getComputedStyle(c).pointerEvents === 'none'
    if (!hit || !(inside(hit, c) || (ignores && inside(c, hit)))) { covered++; continue }
    hit.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, composed: true }))
    await frame(); await frame()
    const t = app.target, w = app.textPick
    const ok = t && (inside(t, c) || (w && inside(w.parentNode, c)))
    if (ok) good++
    else bad.push(`${name(c)} “${(c.textContent || '').trim().slice(0, 24)}” → ${w ? 'text in ' : ''}${name(t)}`)
  }
  return { tested: good + bad.length, good, covered, bad: bad.slice(0, 30) }
}
