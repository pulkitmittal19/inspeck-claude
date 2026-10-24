/* For overlays.html, while testing by hand: with each overlay open, can Inspeck be seen and used on it?
   `await overlayCheck('radix-dialog')` → what worked and what didn't. */
window.overlayCheck = async function (k, { typing = 1200 } = {}) {
  const tick = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0) })
  const wait = async ms => { const t = performance.now(); while (performance.now() - t < ms) await tick() }
  const app = window.__INSPECK__.app
  const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot?.querySelector('.outline'))
  const root = host.shadowRoot
  const out = { overlay: k }
  const step = name => { (window.__ovlog ??= []).push(`${k}: ${name}`); try { localStorage.setItem('__dbg', (localStorage.getItem('__dbg') ?? '') + `\n${Math.round(performance.now())} step ${name}`) } catch {} }
  const press = (el, x, y) => {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const E = type.startsWith('pointer') ? PointerEvent : MouseEvent
      el.dispatchEvent(new E(type, { clientX: x, clientY: y, bubbles: true, composed: true, button: 0, buttons: type.endsWith('down') ? 1 : 0 }))
    }
  }
  if (app.pinned) app.unpin()
  app.setOpen(false)
  await wait(200)
  step('open')
  window.overlay.open(k)
  await wait(700)
  /* In a hidden browser pane, CSS transitions don't advance (a fade-in stays at opacity 0): finish them, as the
     quarter-second they take on screen would. */
  for (const a of document.getAnimations()) { try { a.finish() } catch { /* an endless one */ } }
  await wait(100)
  out.opened = window.overlay.isOpen(k)
  if (!out.opened) return out
  step('inspeck on')
  app.setOpen(true)
  await wait(400)
  /* 1. Inspeck's pill: on top where it is, and answering clicks. */
  const bar = root.querySelector('.bar')
  const b = bar.getBoundingClientRect()
  const topAtPill = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
  out.pillOnTop = topAtPill === host
  /* A button there can take focus (an inert one can't) and isn't click-through. */
  const btn = root.querySelector('.bar [data-action="settings"]')
  btn?.focus()
  out.pillClickable = !!btn && root.activeElement === btn && getComputedStyle(btn).pointerEvents !== 'none'
  btn?.blur()
  /* 2. Hovering inside the overlay picks its element. */
  const scope = document.querySelector(`[data-ov="${k}"]`) ?? document.querySelector({ sonner: '.toast-sonner', hot: '.toast-hot', 'antd-message': '.toast-antd' }[k] ?? '#none') ?? document.body
  let el = scope.matches('.ov-title') ? scope : scope.querySelector('.ov-title') ?? scope
  /* A toast's holder can be a click-through row as wide as the window: point at what it shows. */
  if (getComputedStyle(el).pointerEvents === 'none') el = [...el.querySelectorAll('*')].find(e => getComputedStyle(e).pointerEvents !== 'none' && e.getBoundingClientRect().width > 0) ?? el
  const r = el.getBoundingClientRect()
  const x = r.left + Math.min(12, r.width / 2), y = r.top + r.height / 2
  const hit = document.elementFromPoint(x, y)
  hit?.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, composed: true }))
  await wait(200)
  out.hoverPicks = !!app.target && (el === app.target || el.contains(app.target) || app.target.contains(el)) ? (app.target.className || app.target.tagName) : `wrong: ${app.target?.tagName ?? 'nothing'}`
  /* 3. A note on it: the box opens, keeps the cursor while typing, and the overlay stays open. */
  step('press')
  press(hit ?? el, x, y)
  await wait(500)
  const box = root.querySelector('textarea')
  out.noteBoxOpens = !!box
  out.stillOpenAfterClick = window.overlay.isOpen(k)
  if (!box) return out
  const br = box.getBoundingClientRect()
  step('click box')
  press(box, br.left + 10, br.top + 10)
  step('focus box')
  box.focus()
  await wait(300)
  out.cursorStaysInNote = document.activeElement === host && root.activeElement === box
  box.value = `note on ${k}`
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(typing)
  out.cursorAfterTyping = document.activeElement === host && root.activeElement === box
  out.stillOpenWhileTyping = window.overlay.isOpen(k)
  step('enter')
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
  await wait(1500)
  const list = await (await fetch(`/comments?page=${encodeURIComponent(location.href)}`, { headers: { 'x-inspeck': '1' } })).json()
  const saved = list.comments.filter(c => c.note === `note on ${k}`)
  out.saved = saved.length === 1 ? true : saved.length
  out.savedOnElement = saved[0]?.element?.name ?? null
  for (const c of saved) await fetch(`/comments/${c.id}`, { method: 'DELETE', headers: { 'x-inspeck': '1' } })
  out.stillOpenAfterSend = window.overlay.isOpen(k)
  if (app.pinned) app.unpin()
  window.overlay.close(k)
  await wait(400)
  step('done')
  return out
}
