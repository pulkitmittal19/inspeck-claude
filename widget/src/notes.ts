/* Your notes on this page: a numbered marker on each element, and a preview
 * of the note when you hover it.
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
import { enter, leave } from './anim'
import { clear, h } from './dom'
import { unionOf, type Box } from './marquee'
import { actionOf } from './router'
import { cancelFrame, nextFrame } from './native'

const POLL_MS = 4000
/** How far a marker steps aside from another on the same spot: its width and a hair. */
const MARKER_STEP = 24

/**
 * Still taking up space, but not showing: `visibility: hidden` or `opacity: 0`
 * on it or just above it. Usually a control that appears when you hover its
 * row (a Manage button, a row's ⋯ menu).
 */
export function concealed(el: Element): boolean {
  let n: Element | null = el
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
    const cs = getComputedStyle(n)
    if (cs.opacity === '0' || (i === 0 && cs.visibility === 'hidden')) return true
  }
  return false
}

/** Where a marker sits: the element's top-right corner, or for a line of text
    in a wide block (a heading across the page), the end of the text itself. */
export function anchorOf(el: Element): { x: number; y: number; visible: boolean } {
  const r = el.getBoundingClientRect()
  const visible = (r.width > 0 || r.height > 0) && !concealed(el)
  if (el.childElementCount <= 2 && (el.textContent ?? '').trim()) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const ink = range.getBoundingClientRect()
    if (ink.width > 0 && ink.width < r.width - 24) return { x: ink.right + 4, y: Math.max(r.top, ink.top - 2), visible }
  }
  return { x: r.right, y: r.top, visible }
}
/* A marker stays until Claude has read its note; then it leaves the page.
   (The note itself stays with Claude until it's resolved.) */
const open = (n: Note) => n.status === 'new'
/* The page as the server keys it: a hash route (`#/settings`) is its own page,
   a plain anchor (`#pricing`) is the same page scrolled. */
export const pageNow = () => /^#!?\//.test(location.hash) ? location.href : location.href.split('#')[0]

export interface Notes {
  /** A note was just sent: show its marker straight away. */
  added(note: Note, el: Element | Element[]): void
  refresh(): Promise<void>
  /** How many notes have markers on this page. */
  readonly count: number
  /** How many of them are waiting to be sent. */
  readonly held: number
  /** Withdraw every note on this page. */
  clear(): Promise<void>
  /** An area note's elements still on the page, and where the area is now. */
  membersOf(note: Note): Element[]
  areaOf(note: Note): Box | null
  /** Events inside the widget that belong to the markers. */
  handle(e: Event): boolean
  find(note: Note): Element | null
  destroy(): void
}

export function createNotes(ui: HTMLElement, onOpen: (note: Note, el: Element | null) => void, onHeld: (n: number) => void = () => {}): Notes {
  const layer = h('div', { class: 'markers' })
  /* Hovering a marker outlines, faintly, the element its note is about. */
  const ghost = h('div', { class: 'ghost', hidden: true })
  layer.appendChild(ghost)
  let hovered: string | null = null
  const preview = h('div', { class: 'preview', hidden: true, role: 'tooltip' })
  ui.append(layer, preview)

  let notes: Note[] = []
  const els = new Map<string, WeakRef<Element>>()
  const markers = new Map<string, HTMLButtonElement>()
  let raf = 0
  let timer = 0
  /* Notes sent from this tab pop in; ones already there on load just appear. */
  const born = new Set<string>()

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

  /** A note on a dragged area: the elements still on the page. */
  const groups = new Map<string, Element[]>()
  function membersOf(n: Note): Element[] {
    const cached = groups.get(n.id)
    if (cached?.length && cached.every(e => e.isConnected)) return cached
    const found = (n.group ?? []).map(m => { try { return document.querySelector(m.selector) } catch { return null } })
      .filter((e): e is Element => !!e)
    groups.set(n.id, found)
    return found
  }
  /** Where an area note is now: around its elements, else the area as it was drawn. */
  function areaOf(n: Note): Box | null {
    const live = unionOf(membersOf(n))
    if (live) return live
    const r = n.rect
    return r ? { left: r.x - scrollX, top: r.y - scrollY, right: r.x + r.w - scrollX, bottom: r.y + r.h - scrollY } : null
  }

  function findAnchor(n: Note): Element | null {
    try { return n.element.anchor ? document.querySelector(n.element.anchor) : null } catch { return null }
  }

  /* ---------- markers ---------- */

  let lastHeld = -1
  const tellHeld = () => {
    const n = notes.filter(x => x.held).length
    if (n !== lastHeld) { lastHeld = n; onHeld(n) }
  }

  function render() {
    tellHeld()
    for (const [id, m] of markers) {
      if (notes.some(n => n.id === id)) continue
      /* Claude closed it (or you deleted it): shrink away, then go. */
      markers.delete(id)
      m.setAttribute('data-gone', '')
      setTimeout(() => m.remove(), 220)
    }
    for (const n of notes) {
      if (markers.has(n.id)) continue
      const m = h('button', { type: 'button', class: 'marker', 'data-action': 'marker', 'data-id': n.id, 'aria-label': `Note ${n.n}: ${n.note}` }, String(n.n))
      if (born.delete(n.id)) {
        m.setAttribute('data-born', '')
        setTimeout(() => m.removeAttribute('data-born'), 500)
      }
      markers.set(n.id, m)
      layer.appendChild(m)
    }
    if (markers.size && !raf) raf = nextFrame(frame)
  }

  function frame() {
    raf = 0
    if (!markers.size) return
    /* Several notes on one corner (an element and its text, a button noted
       twice) would stack into one badge: each next one steps to the right. */
    const placed: Array<[number, number]> = []
    const put = (m: HTMLElement, x: number, y: number) => {
      const k = placed.filter(([px, py]) => Math.abs(px - x) < 12 && Math.abs(py - y) < 12).length
      placed.push([x, y])
      m.style.left = `${Math.round(x - 2 + k * MARKER_STEP)}px`
      m.style.top = `${Math.round(y - 20)}px`
    }
    for (const n of notes) {
      const m = markers.get(n.id)
      if (!m) continue
      if (n.group) {
        const b = areaOf(n)
        if (!b) continue
        m.removeAttribute('data-lost')
        put(m, b.right, b.top)
        if (n.id === hovered) { ghost.style.cssText = `left:${b.left - 2}px;top:${b.top - 2}px;width:${b.right - b.left + 4}px;height:${b.bottom - b.top + 4}px`; enter(ghost) }
        continue
      }
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
      /* The badge sits up and to the right, its pointed corner on the spot. */
      put(m, x, y)
      if (n.id === hovered) {
        const box = el ?? anchor
        if (box && (el ? a?.visible : true)) {
          const r = box.getBoundingClientRect()
          ghost.style.cssText = `left:${r.left - 2}px;top:${r.top - 2}px;width:${r.width + 4}px;height:${r.height + 4}px`
          enter(ghost)
        }
      }
    }
    raf = nextFrame(frame)
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
      ...(() => {
        const el = find(n)
        if (el) return concealed(el) ? [h('div', { class: 'preview-lost' }, 'Hidden right now: it shows when you hover what’s around it')] : []
        return n.element.within && findAnchor(n) ? [] : [h('div', { class: 'preview-lost' }, 'Can’t find this element on the page right now')]
      })(),
    )
    enter(preview)
    const r = m.getBoundingClientRect()
    const w = preview.offsetWidth, hh = preview.offsetHeight
    const left = Math.min(innerWidth - 8 - w, Math.max(8, r.left + r.width / 2 - w / 2))
    const top = r.top - hh - 8 >= 8 ? r.top - hh - 8 : r.bottom + 8
    preview.style.left = `${Math.round(left)}px`
    preview.style.top = `${Math.round(top)}px`
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
  window.addEventListener('hashchange', onRoute)

  void refresh()
  poll()

  return {
    added(note, el) {
      if (Array.isArray(el)) groups.set(note.id, el)
      else els.set(note.id, new WeakRef(el))
      born.add(note.id)
      notes = [...notes.filter(n => n.id !== note.id), note].sort((a, b) => a.n - b.n)
      render()
    },
    refresh,
    find,
    membersOf,
    areaOf,
    get count() { return notes.length },
    get held() { return notes.filter(x => x.held).length },
    async clear() {
      const ids = notes.map(n => n.id)
      await Promise.allSettled(ids.map(id => api.remove(id)))
      await refresh()
    },
    handle(e) {
      const a = actionOf(e)
      if (e.type === 'pointerover' && a?.action === 'marker') { hovered = a.el.dataset.id ?? null; showPreview(a.el); return true }
      if ((e.type === 'pointerout' || e.type === 'pointerleave') && !preview.hidden) {
        const to = (e as PointerEvent).relatedTarget
        if (!(to instanceof Element) || to.getAttribute?.('data-action') !== 'marker') { hovered = null; leave(preview, 90); leave(ghost, 120) }
      }
      if (e.type !== 'click' || a?.action !== 'marker') return false
      hovered = null
      leave(preview, 90)
      leave(ghost, 90)
      const n = notes.find(x => x.id === a.el.dataset.id)
      if (n?.group) { onOpen(n, null); return true }
      const el = n && find(n)
      if (n && el) onOpen(n, el)
      return true
    },
    destroy() {
      clearTimeout(timer)
      cancelFrame(raf)
      history.pushState = origPush
      history.replaceState = origReplace
      window.removeEventListener('popstate', onRoute)
      window.removeEventListener('hashchange', onRoute)
    },
  }
}

