/* Inspeck started and drawing: waits for it, and in a browser pane that's hidden (no animation frames, which
   Inspeck draws on) gives the page frames from a message channel (as shim.js does) and starts Inspeck again. */
window.inspeckReady = async function () {
  const tick = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0) })
  const wait = async ms => { const t = performance.now(); while (performance.now() - t < ms) await tick() }
  for (let i = 0; i < 80 && !window.__INSPECK__?.app; i++) await wait(100)
  if (!window.__INSPECK__?.app) return { loaded: false }
  const script = [...document.scripts].find(s => /inspeck\.js(\?|$)/.test(s.src))
  const frames = await Promise.race([new Promise(r => requestAnimationFrame(() => r(true))), wait(600).then(() => false)])
  if (frames || !script) return { loaded: true }
  let n = 0; const dead = new Set()
  window.requestAnimationFrame = cb => { const id = ++n; const ch = new MessageChannel(); ch.port1.onmessage = () => { if (!dead.delete(id)) cb(performance.now()) }; ch.port2.postMessage(0); return id }
  window.cancelAnimationFrame = id => { dead.add(id) }
  window.__INSPECK__.destroy()
  const again = document.createElement('script'); again.src = script.src.split('?')[0] + '?again=' + Date.now(); document.body.appendChild(again)
  for (let i = 0; i < 80 && !window.__INSPECK__?.app; i++) await wait(100)
  return { loaded: !!window.__INSPECK__?.app, restartedForHiddenPane: true }
}

/* End to end in a real app, while testing by hand: Inspeck loaded, a note placed on an element reaches the
   plugin with where it's written in the code, and picking checked on the page. Load with a <script> from the
   test server; then `await inspeckE2E('h1')`. */
window.inspeckE2E = async function (selector, { note = 'e2e check', probe = true, typing = 3000 } = {}) {
  const tick = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0) })
  const wait = async ms => { const t = performance.now(); while (performance.now() - t < ms) await tick() }
  const out = {}
  Object.assign(out, await window.inspeckReady())
  if (!out.loaded) return out
  const script = [...document.scripts].reverse().find(s => /inspeck\.js(\?|$)/.test(s.src))
  out.server = script ? script.src.replace(/\/inspeck\.js.*$/, '') : '(added by bind)'
  const app = window.__INSPECK__.app
  app.setOpen(true)
  await wait(300)
  const el = document.querySelector(selector)
  if (!el) { out.error = `nothing matches ${selector}`; return out }
  el.scrollIntoView({ block: 'center' })
  await wait(200)
  const r = el.getBoundingClientRect()
  const x = r.left + Math.min(10, r.width / 2), y = r.top + r.height / 2
  const hit = document.elementFromPoint(x, y)
  hit.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, composed: true }))
  await wait(150)
  out.picked = app.target ? `${app.textPick ? 'text in ' : ''}${app.target.tagName.toLowerCase()}` : null
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const E = type.startsWith('pointer') ? PointerEvent : MouseEvent
    hit.dispatchEvent(new E(type, { clientX: x, clientY: y, bubbles: true, composed: true, button: 0, buttons: type.endsWith('down') ? 1 : 0 }))
  }
  await wait(500)
  const root = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline'))?.shadowRoot
  const box = root?.querySelector('textarea')
  if (!box) { out.error = 'the note box did not open'; return out }
  box.value = note
  box.dispatchEvent(new Event('input', { bubbles: true }))
  /* As long as a person takes to write it. */
  await wait(typing)
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
  await wait(3500)
  const base = script ? out.server : 'http://127.0.0.1:4848'
  const page = location.href
  const list = await (await fetch(`${base}/comments?page=${encodeURIComponent(page)}`, { headers: { 'x-inspeck': '1' } })).json().catch(e => ({ error: String(e) }))
  const saved = list.comments?.filter(c => c.note === note).at(-1)
  out.saved = !!saved
  if (saved) {
    out.source = (saved.source ?? []).map(s => `${s.file.split('/').slice(-2).join('/')}:${s.line}`)
    out.component = saved.element?.trail?.[0] ?? null
    await fetch(`${base}/comments/${saved.id}`, { method: 'DELETE', headers: { 'x-inspeck': '1' } })
  }
  if (probe) {
    if (!window.inspeckProbe) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'http://127.0.0.1:4849/__dev/tables/probe.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s) })
    const p = await window.inspeckProbe({ limit: 40 })
    out.picking = `${p.good}/${p.tested}${p.bad?.length ? ' — ' + p.bad.slice(0, 4).join('; ') : ''}`
  }
  return out
}
