/* The widget's state and the one place events are decided. Each feature
   (picking, the CSS card, notes, markers, spacing, freeze) plugs in here. */
import { api, type Note } from './api'
import { createCard, type Card } from './card'
import { warmUp } from './css/cascade'
import { isEditable } from './dom'
import { tabStore } from './env'
import { createHost, type Host } from './host'
import { createOutline, type Outline } from './outline'
import { childToward, elementAt, parentOf, pickable, snap } from './pick'
import { createRouter } from './router'
import { selectorFor } from './selector'
import { createToolbar, type Toolbar } from './toolbar'

/* Presses that would act on the app. While Inspeck is open they pick instead. */
const PRESS = new Set(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick',
  'contextmenu', 'touchstart', 'touchend', 'dragstart'])

export class App {
  readonly host: Host
  readonly toolbar: Toolbar
  readonly outline: Outline
  readonly card: Card
  open = false
  /** Held Space: presses go to the app, so you can open a menu to comment inside it. */
  through = false
  /** The element the person is pointing at (after snapping and ↑/↓). */
  target: Element | null = null
  /** The element whose card is pinned, while a note is being written. */
  pinned: Element | null = null
  private pointer = { x: -1, y: -1 }
  private raw: Element | null = null
  private stepped = false
  private pickFrame = 0
  private unroute: () => void
  /** Called when a note has been sent (markers listen here). */
  onNote: (note: Note, el: Element) => void = () => {}

  constructor() {
    this.host = createHost()
    this.toolbar = createToolbar(this.host.ui)
    this.card = createCard(this.host.ui)
    this.outline = createOutline(this.host.ui, (_el, r) => this.card.place(r))
    this.unroute = createRouter(this.host, {
      ui: e => this.onUi(e),
      page: e => this.onPage(e),
    })
    if (tabStore.get('open') === '1') this.setOpen(true)
  }

  setOpen(open: boolean): void {
    if (open === this.open) return
    this.open = open
    this.toolbar.setOpen(open)
    tabStore.set('open', open ? '1' : null)
    if (open) {
      warmUp()
      if (this.pointer.x >= 0) this.schedulePick()
    } else {
      this.unpin()
      this.setTarget(null)
    }
  }

  private act(action: string): void {
    switch (action) {
      case 'open': this.setOpen(true); break
      case 'close': this.setOpen(false); break
    }
  }

  /* ---------- picking ---------- */

  private schedulePick(): void {
    if (this.pickFrame || this.pinned) return
    this.pickFrame = requestAnimationFrame(() => {
      this.pickFrame = 0
      if (!this.open || this.pinned) return
      const raw = elementAt(this.pointer.x, this.pointer.y, this.host.el)
      /* ↑/↓ choices hold until the pointer moves onto a different element. */
      if (this.stepped && raw === this.raw) return
      this.raw = raw
      this.stepped = false
      this.setTarget(raw ? snap(raw) : null)
    })
  }

  setTarget(el: Element | null): void {
    if (this.pinned) return
    if (!pickable(el, this.host.el)) el = null
    this.target = el
    if (el) {
      this.card.showHover(el)
      this.outline.show(el)
    } else {
      this.outline.hide()
      this.card.hide()
    }
  }

  private step(dir: 'up' | 'down'): void {
    if (!this.target) return
    const next = dir === 'up' ? parentOf(this.target) : childToward(this.target, this.pointer.x, this.pointer.y)
    if (next && pickable(next, this.host.el)) {
      this.stepped = true
      this.setTarget(next)
    }
  }

  /* ---------- notes ---------- */

  /** A press on the page while open: pin the card to the element and start a note. */
  private press(): void {
    const el = this.target
    if (!el) return
    if (this.pinned) {
      if (el === this.pinned) return
      /* Half a note written? Don't throw it away: nudge the card instead. */
      if (this.card.draft.trim()) { this.card.pulse(); return }
      this.unpin()
      this.setTarget(el)
    }
    this.pin(el)
  }

  pin(el: Element, existing?: Note): void {
    this.pinned = el
    this.target = el
    this.outline.show(el)
    this.card.pin(el, {
      existing: existing ? { n: existing.n, note: existing.note } : undefined,
      onSend: async text => {
        if (existing) {
          await api.edit(existing.id, text)
          return
        }
        const note = await api.add(this.noteFor(el, text))
        this.onNote(note, el)
        return { n: note.n }
      },
      onClose: () => this.unpin(),
      onDelete: existing ? () => api.remove(existing.id) : undefined,
    })
  }

  unpin(): void {
    if (!this.pinned) return
    this.pinned = null
    this.card.hide()
    this.outline.hide()
    this.target = null
    this.stepped = false
    if (this.open) this.schedulePick()
  }

  private noteFor(el: Element, text: string) {
    const r = el.getBoundingClientRect()
    const d = this.card.description
    const visible = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
    return {
      note: text,
      page: location.href,
      element: {
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        ...(visible ? { text: visible.slice(0, 120) } : {}),
        ...(d?.component ? { trail: [d.component] } : {}),
        ...(d ? { name: d.label } : {}),
      },
      /* The marker sits on the element's top-right corner. */
      at: { x: Math.round(r.right + scrollX), y: Math.round(r.top + scrollY) },
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      css: (d?.lines ?? []).map(l => ({ property: l.prop, value: l.value, ...(l.resolved ? { resolved: l.resolved } : {}) })),
    }
  }

  /* ---------- events ---------- */

  /** Events inside Inspeck's own UI. */
  private onUi(e: Event): void {
    if (this.card.handle(e)) return
    const action = this.toolbar.handle(e)
    if (action) this.act(action)
    if (e.type === 'keydown') this.onKey(e as KeyboardEvent, true)
    if (e.type === 'keyup') this.onKeyUp(e as KeyboardEvent)
    /* The pointer over our own UI isn't pointing at the page. */
    if (e.type === 'pointerover' && this.open && !this.pinned) this.setTarget(null)
  }

  /** Events on the page. Returning a verdict stops the app from seeing it. */
  private onPage(e: Event): 'swallow' | 'stop' | void {
    switch (e.type) {
      case 'keydown': return this.onKey(e as KeyboardEvent, false)
      case 'keyup': return this.onKeyUp(e as KeyboardEvent)
    }
    if (!this.open) return

    if (e.type === 'pointermove') {
      const p = e as PointerEvent
      this.pointer = { x: p.clientX, y: p.clientY }
      this.schedulePick()
      return
    }
    if (e.type === 'mouseout' && !(e as MouseEvent).relatedTarget && !this.pinned) {
      /* The pointer left the window (into the Claude chat, say). */
      this.setTarget(null)
      return
    }
    if (PRESS.has(e.type)) {
      if (this.through) return
      if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) {
        /* Pick fresh at the press point: the pointer may not have moved since the last frame. */
        const p = e as PointerEvent
        this.pointer = { x: p.clientX, y: p.clientY }
        if (!this.pinned) {
          const raw = elementAt(p.clientX, p.clientY, this.host.el)
          if (!this.stepped || raw !== this.raw) { this.raw = raw; this.stepped = false; this.setTarget(raw ? snap(raw) : null) }
        } else {
          const raw = elementAt(p.clientX, p.clientY, this.host.el)
          this.target = raw ? snap(raw) : null
        }
        this.press()
      }
      return 'swallow'
    }
  }

  private onKey(e: KeyboardEvent, inside: boolean): 'swallow' | void {
    /* ⌥I opens and closes Inspeck from anywhere, even mid-typing in the app:
       it's a chord no one types by accident. */
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyI') {
      this.setOpen(!this.open)
      e.preventDefault()
      return 'swallow'
    }
    if (!this.open || inside) return
    /* Typing in the app's own fields stays the app's business. */
    if (isEditable(document.activeElement)) return
    switch (e.key) {
      case 'Escape':
        if (this.pinned) this.unpin()
        else this.setOpen(false)
        return 'swallow'
      case 'ArrowUp':
      case 'ArrowDown':
        if (!this.target || this.pinned) return
        this.step(e.key === 'ArrowUp' ? 'up' : 'down')
        return 'swallow'
      case ' ':
        if (!this.through) this.setThrough(true)
        return 'swallow'
    }
  }

  private onKeyUp(e: KeyboardEvent): 'swallow' | void {
    if (e.key === ' ' && this.through) {
      this.setThrough(false)
      return 'swallow'
    }
  }

  private setThrough(on: boolean): void {
    this.through = on
    this.host.ui.querySelector('.outline')?.toggleAttribute('data-through', on)
  }

  destroy(): void {
    this.unroute()
    this.host.destroy()
  }
}
