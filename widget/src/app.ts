/* The widget's state and the one place events are decided. Each feature
   (picking, the CSS card, notes, markers, spacing, freeze) plugs in here. */
import { api, type Note } from './api'
import { createCard, type Card } from './card'
import { warmUp } from './css/cascade'
import { h, isEditable } from './dom'
import { tabStore } from './env'
import { createFreeze, FROZEN_BLOCK, type Freeze } from './freeze'
import { createHost, type Host } from './host'
import { anchorOf, createNotes, type Notes } from './notes'
import { createOutline, type Outline } from './outline'
import { childToward, elementAt, parentOf, pickable, snap } from './pick'
import { createRouter } from './router'
import { selectorFor } from './selector'
import { createSpacing, type Spacing } from './spacing'
import { createToolbar, type Toolbar } from './toolbar'
import { openPathOf } from './transient'

/* Presses that would act on the app. While Inspeck is open they pick instead. */
const PRESS = new Set(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick',
  'contextmenu', 'touchstart', 'touchend', 'dragstart'])

export class App {
  readonly host: Host
  readonly toolbar: Toolbar
  readonly outline: Outline
  readonly card: Card
  readonly notes: Notes
  readonly spacing: Spacing
  readonly freeze: Freeze
  private frost: HTMLDivElement
  /** Shift is held: show the hovered element's spacing. */
  private shift = false
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

  constructor() {
    this.host = createHost()
    /* First in the layer, so the card, markers and pill all sit above it. */
    this.frost = h('div', { class: 'frost', hidden: true })
    this.host.ui.appendChild(this.frost)
    this.toolbar = createToolbar(this.host.ui)
    this.freeze = createFreeze(this.host.el, (active, manual) => {
      this.frost.hidden = !active
      this.toolbar.setPressed('freeze', manual)
    })
    /* Markers first, so the card is drawn above them. */
    this.notes = createNotes(this.host.ui, (note, el) => this.openNote(note, el))
    this.card = createCard(this.host.ui)
    this.spacing = createSpacing(this.host.ui)
    this.outline = createOutline(this.host.ui, (el, r) => {
      this.card.place(r)
      if (this.shift) this.spacing.draw(el)
    })
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
      this.freeze.unfreeze(true)
      this.setTarget(null)
    }
  }

  private act(action: string): void {
    switch (action) {
      case 'open': this.setOpen(true); break
      case 'close': this.setOpen(false); break
      case 'list': this.notes.toggleList(); break
      case 'freeze': this.toggleFreeze(); break
    }
  }

  private toggleFreeze(): void {
    if (this.freeze.manual) this.freeze.unfreeze(true)
    else this.freeze.freeze(true)
  }

  /** A marker or a list row was clicked: open that note on its element. */
  private openNote(note: Note, el: Element): void {
    if (!this.open) this.setOpen(true)
    this.unpin()
    this.target = el
    this.pin(el, note)
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
      if (this.shift) this.card.el.hidden = true
      this.outline.show(el)
    } else {
      this.outline.hide()
      this.card.hide()
      this.spacing.hide()
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
    /* Hold the page still while the note is written: an open menu stays open. */
    this.freeze.freeze(false)
    this.pinned = el
    this.target = el
    this.outline.show(el)
    this.card.pin(el, {
      existing: existing ? { n: existing.n, note: existing.note } : undefined,
      onSend: async text => {
        if (existing) {
          await api.edit(existing.id, text)
          void this.notes.refresh()
          return
        }
        const note = await api.add(this.noteFor(el, text))
        this.notes.added(note, el)
        return { n: note.n }
      },
      onClose: () => this.unpin(),
      onDelete: existing ? async () => { await api.remove(existing.id); await this.notes.refresh() } : undefined,
    })
  }

  unpin(): void {
    if (!this.pinned) return
    this.pinned = null
    this.freeze.unfreeze(false)
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
        ...(openPathOf(el) ?? {}),
      },
      /* Where the marker sits: the top-right corner, or the end of a line of text. */
      at: (({ x, y }) => ({ x: Math.round(x + scrollX), y: Math.round(y + scrollY) }))(anchorOf(el)),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      css: (d?.lines ?? []).map(l => ({ property: l.prop, value: l.value, ...(l.resolved ? { resolved: l.resolved } : {}) })),
    }
  }

  /* ---------- events ---------- */

  /** Events inside Inspeck's own UI. */
  private onUi(e: Event): void {
    /* While frozen the frost catches the pointer; treat it as the page. */
    if (e.composedPath()[0] === this.frost) {
      if (e.type === 'pointermove') {
        const p = e as PointerEvent
        this.pointer = { x: p.clientX, y: p.clientY }
        this.schedulePick()
      } else if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) {
        this.pressAt(e as PointerEvent)
      }
      return
    }
    if (this.card.handle(e)) return
    if (this.notes.handle(e)) return
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
      case 'keydown': return this.onKey(e as KeyboardEvent, false) ?? (this.freeze.active ? 'stop' : undefined)
      case 'keyup': return this.onKeyUp(e as KeyboardEvent) ?? (this.freeze.active ? 'stop' : undefined)
    }
    if (e.type === 'blur' && e.target === window) { this.setShift(false); if (this.through) this.setThrough(false) }
    if (!this.open) return

    if (e.type === 'pointermove') {
      const p = e as PointerEvent
      this.pointer = { x: p.clientX, y: p.clientY }
      this.schedulePick()
      return this.freeze.active ? 'stop' : undefined
    }
    if (e.type === 'mouseout' && !(e as MouseEvent).relatedTarget && !this.pinned) {
      /* The pointer left the window (into the Claude chat, say). */
      this.setTarget(null)
      return this.freeze.active ? 'stop' : undefined
    }
    if (PRESS.has(e.type)) {
      if (this.through && !this.freeze.active) return
      if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) this.pressAt(e as PointerEvent)
      return 'swallow'
    }
    if (this.freeze.active && FROZEN_BLOCK.has(e.type)) return 'stop'
  }

  /** A press at a point on the page (or on the frost while frozen). */
  private pressAt(p: PointerEvent): void {
    /* Pick fresh at the press point: the pointer may not have moved since the last frame. */
    this.pointer = { x: p.clientX, y: p.clientY }
    const raw = elementAt(p.clientX, p.clientY, this.host.el)
    if (!this.pinned) {
      if (!this.stepped || raw !== this.raw) { this.raw = raw; this.stepped = false; this.setTarget(raw ? snap(raw) : null) }
    } else {
      this.target = raw ? snap(raw) : null
    }
    this.press()
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
        else if (this.notes.closeList()) { /* closed the list */ }
        else if (this.freeze.manual) this.freeze.unfreeze(true)
        else this.setOpen(false)
        return 'swallow'
      case 'f':
      case 'F':
        if (e.metaKey || e.ctrlKey || e.altKey) return
        this.toggleFreeze()
        return 'swallow'
      case 'ArrowUp':
      case 'ArrowDown':
        if (!this.target || this.pinned) return
        this.step(e.key === 'ArrowUp' ? 'up' : 'down')
        return 'swallow'
      case ' ':
        if (!this.through) this.setThrough(true)
        return 'swallow'
      case 'Shift':
        this.setShift(true)
        return
    }
  }

  private setShift(on: boolean): void {
    if (on === this.shift) return
    this.shift = on
    /* The numbers are the point while Shift is down; the hover card steps aside. */
    if (this.card.mode === 'hover') this.card.el.hidden = on
    if (on && this.target) this.spacing.draw(this.target)
    else this.spacing.hide()
  }

  private onKeyUp(e: KeyboardEvent): 'swallow' | void {
    if (e.key === 'Shift') this.setShift(false)
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
    this.notes.destroy()
    this.unroute()
    this.host.destroy()
  }
}
