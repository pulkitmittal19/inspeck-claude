/* Your notes on this page: a numbered marker on each element, a hover preview,
 * and the list behind the pill's list icon.
 *
 * Markers stay glued to their element through scrolling, resizing and layout
 * shifts. After a reload or a re-render the element is found again by its
 * selector, and checked against a fingerprint (its tag and the start of its
 * text) so a marker never jumps onto the wrong thing. If it can't be found,
 * the marker waits, dimmed, where the element was.
 *
 * A note disappears once Claude has dealt with it (resolved or declined).
 */
import { api, type Note } from './api'
import { clear, h } from './dom'
import { tabStore } from './env'
import { actionOf } from './router'

const POLL_MS = 4000

/** Where a marker sits: the element's top-right corner, or for a line of text
    in a wide block (a heading across the page), the end of the text itself. */
export function anchorOf(el: Element): { x: number; y: number; visible: boolean } {
  const r = el.getBoundingClientRect()
  const visible = r.width > 0 || r.height > 0
  if (el.childElementCount <= 2 && (el.textContent ?? '').trim()) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const ink = range.getBoundingClientRect()
    if (ink.width > 0 && ink.width < r.width - 24) return { x: ink.right + 4, y: Math.max(r.top, ink.top - 2), visible }
  }
  return { x: r.right, y: r.top, visible }
}
const open = (n: Note) => n.status === 'new' || n.status === 'seen'
const pageNow = () => location.href.split('#')[0]

export interface Notes {
  /** A note was just sent: show its marker straight away. */
  added(note: Note, el: Element): void
  refresh(): Promise<void>
  /** Events inside the widget that belong to markers or the list. */
  handle(e: Event): boolean
  toggleList(): void
  closeList(): boolean
  find(note: Note): Element | null
  destroy(): void
}

export function createNotes(ui: HTMLElement, onOpen: (note: Note, el: Element) => void): Notes {
  const layer = h('div', { class: 'markers' })
  const preview = h('div', { class: 'preview', hidden: true, role: 'tooltip' })
  const list = h('div', { class: 'list', hidden: true, role: 'dialog', 'aria-label': 'Your notes on this page' })
  ui.append(layer, preview, list)

  let notes: Note[] = []
  const els = new Map<string, WeakRef<Element>>()
  const markers = new Map<string, HTMLButtonElement>()
  let hidden = tabStore.get('markers-hidden') === '1'
  let raf = 0
  let timer = 0
  let confirmClear = 0

  /* ---------- finding the element again ---------- */

  function find(n: Note): Element | null {
    const cached = els.get(n.id)?.deref()
    if (cached?.isConnected) return cached
    let el: Element | null = null
    try { el = document.querySelector(n.element.selector) } catch { el = null }
    if (el && n.element.tag && el.tagName.toLowerCase() !== n.element.tag) el = null
    if (el && n.element.text) {
      const now = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!now.startsWith(n.element.text.slice(0, 20))) el = null
    }
    if (el) els.set(n.id, new WeakRef(el))
    return el
  }

  function findAnchor(n: Note): Element | null {
    try { return n.element.anchor ? document.querySelector(n.element.anchor) : null } catch { return null }
  }

  /* ---------- markers ---------- */

  function render() {
    const shown = hidden ? [] : notes
    for (const [id, m] of markers) {
      if (!shown.some(n => n.id === id)) { m.remove(); markers.delete(id) }
    }
    for (const n of shown) {
      if (markers.has(n.id)) continue
      const m = h('button', { type: 'button', class: 'marker', 'data-action': 'marker', 'data-id': n.id, 'aria-label': `Note ${n.n}: ${n.note}` }, String(n.n))
      markers.set(n.id, m)
      layer.appendChild(m)
    }
    if (markers.size && !raf) raf = requestAnimationFrame(frame)
    renderList()
  }

  function frame() {
    raf = 0
    if (!markers.size) return
    for (const n of notes) {
      const m = markers.get(n.id)
      if (!m) continue
      let el = find(n)
      let anchor: Element | null = null
      let x = 0, y = 0
      let a = el ? anchorOf(el) : null
      /* Still in the page but hidden (a closed menu kept in the DOM): treat as closed. */
      if (el && a && !a.visible && n.element.anchor) { el = null; a = null }
      if (el && a) {
        x = a.x; y = a.y
        m.toggleAttribute('data-lost', !a.visible)
      } else if (n.element.anchor && (anchor = findAnchor(n))) {
        /* Inside a menu that's closed now: wait on the button that opens it. */
        const r = anchor.getBoundingClientRect()
        x = r.right; y = r.top
        m.removeAttribute('data-lost')
      } else if (n.rect) {
        x = n.rect.x + n.rect.w - scrollX; y = n.rect.y - scrollY
        m.setAttribute('data-lost', '')
      } else continue
      m.toggleAttribute('data-nested', !el && !!anchor)
      m.style.left = `${Math.round(x - 10)}px`
      m.style.top = `${Math.round(y - 10)}px`
    }
    raf = requestAnimationFrame(frame)
  }

  /* ---------- hover preview ---------- */

  function showPreview(m: HTMLElement) {
    const n = notes.find(x => x.id === m.dataset.id)
    if (!n) return
    clear(preview)
    preview.append(
      h('div', { class: 'preview-head' }, `#${n.n}`, h('span', {}, ` · ${n.element.name ?? n.element.selector}`)),
      h('div', { class: 'preview-text' }, n.note),
      ...(n.element.within ? [h('div', { class: 'preview-lost' }, `in ${n.element.within}`)] : []),
      ...(find(n) || (n.element.within && findAnchor(n)) ? [] : [h('div', { class: 'preview-lost' }, 'Can’t find this element on the page right now')]),
    )
    preview.hidden = false
    const r = m.getBoundingClientRect()
    const w = preview.offsetWidth, hh = preview.offsetHeight
    const left = Math.min(innerWidth - 8 - w, Math.max(8, r.left + r.width / 2 - w / 2))
    const top = r.top - hh - 8 >= 8 ? r.top - hh - 8 : r.bottom + 8
    preview.style.left = `${Math.round(left)}px`
    preview.style.top = `${Math.round(top)}px`
  }

  /* ---------- the list ---------- */

  function renderList() {
    if (list.hidden) return
    clear(list)
    if (!notes.length) {
      list.append(h('div', { class: 'list-empty' }, 'No notes on this page yet. Click any element to add one.'))
      return
    }
    for (const n of notes) {
      list.appendChild(h('button', { type: 'button', class: 'row', 'data-action': 'jump', 'data-id': n.id },
        h('span', { class: 'row-num' }, String(n.n)),
        h('span', { class: 'row-body' },
          h('span', { class: 'row-note' }, n.note),
          h('span', { class: 'row-where' }, n.element.within ? `in ${n.element.within}` : (n.element.name ?? n.element.selector)))))
    }
    list.appendChild(h('div', { class: 'list-foot' },
      h('button', { type: 'button', class: 'link', 'data-action': 'toggle-markers' }, hidden ? 'Show markers' : 'Hide markers'),
      h('button', { type: 'button', class: 'link', 'data-action': 'clear-all' },
        confirmClear ? `Delete all ${notes.length}?` : 'Clear all')))
  }

  /* ---------- syncing with the server ---------- */

  async function refresh() {
    try {
      const all = await api.list(pageNow())
      notes = all.filter(open).sort((a, b) => a.n - b.n)
      render()
    } catch { /* server away for a moment; keep what we have */ }
  }

  const poll = () => {
    clearTimeout(timer)
    timer = window.setTimeout(async () => {
      if (document.visibilityState === 'visible') await refresh()
      poll()
    }, POLL_MS)
  }

  /* Single-page apps change route without reloading: follow along. */
  const onRoute = () => { els.clear(); void refresh() }
  const origPush = history.pushState, origReplace = history.replaceState
  history.pushState = function (...a: Parameters<History['pushState']>) { origPush.apply(this, a); queueMicrotask(onRoute) }
  history.replaceState = function (...a: Parameters<History['replaceState']>) { origReplace.apply(this, a); queueMicrotask(onRoute) }
  window.addEventListener('popstate', onRoute)

  void refresh()
  poll()

  return {
    added(note, el) {
      els.set(note.id, new WeakRef(el))
      notes = [...notes.filter(n => n.id !== note.id), note].sort((a, b) => a.n - b.n)
      render()
    },
    refresh,
    find,
    toggleList() {
      list.hidden = !list.hidden
      confirmClear = 0
      if (!list.hidden) { renderList(); void refresh() }
    },
    closeList() {
      if (list.hidden) return false
      list.hidden = true
      return true
    },
    handle(e) {
      const a = actionOf(e)
      if (e.type === 'pointerover' && a?.action === 'marker') { showPreview(a.el); return true }
      if ((e.type === 'pointerout' || e.type === 'pointerleave') && !preview.hidden) {
        const to = (e as PointerEvent).relatedTarget
        if (!(to instanceof Element) || to.getAttribute?.('data-action') !== 'marker') preview.hidden = true
      }
      if (e.type !== 'click' || !a) return false
      const n = notes.find(x => x.id === a.el.dataset.id)
      switch (a.action) {
        case 'marker': {
          preview.hidden = true
          const el = n && find(n)
          if (n && el) onOpen(n, el)
          return true
        }
        case 'jump': {
          if (!n) return true
          const el = find(n)
          list.hidden = true
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
            setTimeout(() => onOpen(n, el), 350)
          }
          return true
        }
        case 'toggle-markers':
          hidden = !hidden
          tabStore.set('markers-hidden', hidden ? '1' : null)
          render()
          return true
        case 'clear-all':
          if (!confirmClear) {
            confirmClear = window.setTimeout(() => { confirmClear = 0; renderList() }, 3000)
            renderList()
            return true
          }
          clearTimeout(confirmClear)
          confirmClear = 0
          void Promise.all(notes.map(x => api.remove(x.id).catch(() => {}))).then(refresh)
          return true
      }
      return false
    },
    destroy() {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      history.pushState = origPush
      history.replaceState = origReplace
      window.removeEventListener('popstate', onRoute)
    },
  }
}

