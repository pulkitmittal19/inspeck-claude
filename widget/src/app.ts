/* The widget's state and the one place events are decided. Each feature
   (picking, the CSS card, notes, markers, spacing, freeze) plugs in here. */
import { api, type GroupMember, type Note } from './api'
import { createCard, type Card } from './card'
import { warmUp } from './css/cascade'
import { h, isEditable } from './dom'
import { tabStore } from './env'
import { createFreeze, FROZEN_BLOCK, type Freeze } from './freeze'
import { createHost, type Host } from './host'
import { anchorOf, createNotes, pageNow, type Notes } from './notes'
import { createOutline, type Outline } from './outline'
import { childToward, elementAt, parentOf, pickable, snap, clickThroughAt, paints } from './pick'
import { actionOf, createRouter } from './router'
import { selectorFor } from './selector'
import { createSpacing, type Spacing } from './spacing'
import { sourceOf, type SourceAt } from './source'
import { createTour, type Tour } from './tour'
import { createSettings, type Settings } from './settings'
import { prefs } from './prefs'
import { createMarquee, MAX_MEMBERS, unionOf, type Box, type Marquee } from './marquee'
import { labelOf } from './css/describe'
import { createToolbar, type Toolbar } from './toolbar'
import { openPathOf } from './transient'
import { nextFrame } from './native'

/* Presses that would act on the app. While Inspeck is open they pick instead. */
const PRESS = new Set(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick',
  'contextmenu', 'touchstart', 'touchend', 'dragstart'])

const CSS_KEY = 'inspeck:css-on-hover'
/** How long the pointer rests before Inspeck looks for a tooltip on top of what it picked. */
const REST_MS = 90

/** After Enter, how long a note waits for its place in the code before going without it. */
const SOURCE_WAIT_MS = 2500
const wait = <T>(ms: number, value: T) => new Promise<T>(r => setTimeout(() => r(value), ms))

/** How far the pointer moves with the button down before a click becomes a drag. */
const DRAG_PX = 5

/** The nearest element holding all of them. */
function commonAncestor(els: Element[]): Element | null {
  if (!els.length) return null
  let a: Element | null = els[0].parentElement
  while (a && !els.every(e => a!.contains(e))) a = a.parentElement
  return a && a !== document.documentElement ? a : null
}

export class App {
  readonly host: Host
  readonly toolbar: Toolbar
  readonly outline: Outline
  readonly card: Card
  readonly notes: Notes
  readonly spacing: Spacing
  readonly marquee: Marquee
  readonly tour: Tour
  readonly settings: Settings
  readonly freeze: Freeze
  private frost: HTMLDivElement
  /** Shift is held: show the hovered element's spacing. */
  private shift = false
  /** Where Shift went down: measured on its own, and the far end of every distance after. */
  private measureFrom: Element | null = null
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
  /** The element under the pointer when a note closed: it stays quiet until the pointer moves off it. */
  private rest: Element | null = null
  /** A click-through layer (a tooltip) the pointer is on, found once it rested there. */
  private overlay: Element | null = null
  private restTimer = 0
  private pickFrame = 0
  /** Hovering shows the CSS card (the pill's </> button, or C). */
  private cssOnHover = (() => { try { return localStorage.getItem(CSS_KEY) === '1' } catch { return false } })()
  /** Half-written notes, kept when the card closes, given back when you click the same element again. */
  private drafts = new WeakMap<Element, string>()
  /** The open card's note was just sent: nothing to keep as a draft when it closes. */
  private sent = false
  /** A press on the page that closed Settings: its up and click are swallowed too. */
  private settingsPress = false
  /** Where the button went down on the page: a click if it comes up close by, a drag across a section if not. */
  private down: PointerEvent | null = null
  private unroute: () => void

  constructor() {
    this.host = createHost()
    /* First in the layer, so the card, markers and pill all sit above it. */
    this.frost = h('div', { class: 'frost', hidden: true })
    this.host.ui.appendChild(this.frost)
    this.toolbar = createToolbar(this.host.ui)
    this.toolbar.setPressed('css', this.cssOnHover)
    this.tour = createTour(this.host.ui)
    this.settings = createSettings(this.host.ui, open => {
      this.toolbar.setPressed('settings', open)
      if (open) this.tour.hide()
    })
    this.freeze = createFreeze(this.host.el, (active, manual) => {
      this.frost.hidden = !active
      this.toolbar.setFrozen(manual)
      this.toolbar.setStatus(manual ? 'Frozen · F to release' : null)
    })
    /* Markers first, so the card is drawn above them. */
    this.notes = createNotes(this.host.ui, (note, el) => this.openNote(note, el), n => this.toolbar.setWaiting(n))
    this.card = createCard(this.host.ui)
    /* Sizes or colours changed in Settings (here or in another app): the card says them the new way.
       Send notes right away turned on: whatever was waiting goes now, from every page of this site. */
    let sending = prefs.get().send
    prefs.onChange(() => {
      this.card.refresh()
      const now = prefs.get().send
      if (now === 'live' && sending === 'ask') void api.sendHeld({ site: location.origin }).then(() => this.notes.refresh(), () => {})
      sending = now
    })
    this.outline = createOutline(this.host.ui, (el, r) => {
      /* A tooltip that faded out from under the pointer: let go of it. */
      if (el === this.overlay && !this.pinned && !paints(el)) { this.overlay = null; this.raw = null; this.schedulePick(); return }
      this.card.place(r)
      if (this.shift) this.measure(el)
    })
    /* After the outline, so the numbers sit on top of its line. */
    this.spacing = createSpacing(this.host.ui)
    this.marquee = createMarquee(this.host.ui, this.host.el, b => this.card.place(new DOMRect(b.left, b.top, b.right - b.left, b.bottom - b.top)))
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
      prefs.sync()
      this.tour.start()
      warmUp()
      if (this.pointer.x >= 0) this.schedulePick()
    } else {
      this.unpin()
      this.tour.hide()
      this.settings.hide()
      this.freeze.unfreeze(true)
      this.setTarget(null)
    }
  }

  private act(action: string): void {
    switch (action) {
      case 'open': this.setOpen(true); break
      case 'close': this.setOpen(false); break
      case 'css': this.setCssOnHover(!this.cssOnHover); break
      case 'clear': this.clearNotes(); break
      case 'settings': this.settings.toggle(); break
      case 'send': this.sendWaiting(); break
    }
  }

  /** Notes wait on the page for Send unless Send notes right away is on. */
  private get holding(): boolean { return prefs.get().send === 'ask' }

  /** Send: the notes waiting on this page go to Claude, as one batch. */
  private sendWaiting(): void {
    const n = this.notes.held
    if (!n) return
    void api.sendHeld({ page: pageNow() }).then(
      sent => { this.toolbar.flash(`Sent ${sent} to Claude`); void this.notes.refresh() },
      err => this.toolbar.flash((err as Error).message),
    )
  }

  /** Clear every note on this page, after a second click to be sure. */
  private clearNotes(): void {
    const n = this.notes.count
    if (!n) { this.toolbar.say('clear', 'No notes on this page'); return }
    if (!this.toolbar.armed('clear')) { this.toolbar.arm('clear', `Click again to clear ${n} note${n === 1 ? '' : 's'}`); return }
    this.unpin()
    void this.notes.clear().then(() => this.toolbar.say('clear', 'Cleared'))
  }

  /**
   * Whether hovering shows the CSS card. Off by default: most of the time
   * Inspeck is for leaving notes, and a card following the pointer is noise.
   * Remembered across reloads.
   */
  private setCssOnHover(on: boolean): void {
    this.cssOnHover = on
    try { localStorage.setItem(CSS_KEY, on ? '1' : '0') } catch { /* private window: this page only */ }
    this.toolbar.setPressed('css', on)
    this.toolbar.say('css', on ? 'CSS on hover' : 'Notes only: the CSS comes with the note')
    if (!this.pinned) this.setTarget(this.target)
  }

  /** F: freeze or release at once, with the pointer where it is. */
  private toggleFreeze(): void {
    if (this.freeze.manual) this.freeze.unfreeze(true)
    else this.freeze.freeze(true)
  }

  /** A marker or a list row was clicked: open that note on its element. */
  private openNote(note: Note, el: Element | null): void {
    if (!this.open) this.setOpen(true)
    this.unpin()
    if (note.group) {
      const members = this.notes.membersOf(note)
      const area = this.notes.areaOf(note)
      if (area) this.pinGroup(members, area, note)
      return
    }
    if (!el) return
    this.target = el
    this.pin(el, note)
  }

  /* ---------- picking ---------- */

  private schedulePick(): void {
    if (this.pickFrame || this.pinned || this.marquee.dragging) return
    this.pickFrame = nextFrame(() => {
      this.pickFrame = 0
      if (!this.open || this.pinned) return
      const { x, y } = this.pointer
      /* On a tooltip found a moment ago: stay on it while the pointer is inside it and it shows. */
      const o = this.overlay
      const onOverlay = !!o && o.isConnected && paints(o) && (r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)(o.getBoundingClientRect())
      if (!onOverlay) this.overlay = null
      const raw = onOverlay ? o : elementAt(x, y, this.host.el)
      /* Once the pointer rests, look again for a click-through layer on top. */
      clearTimeout(this.restTimer)
      if (!onOverlay) this.restTimer = window.setTimeout(() => this.lookThrough(), REST_MS)
      /* ↑/↓ choices hold until the pointer moves onto a different element. */
      if (this.stepped && raw === this.raw) return
      if (raw && raw === this.rest) return
      this.rest = null
      this.raw = raw
      this.stepped = false
      this.setTarget(raw ? snap(raw) : null)
    })
  }

  /** The pointer rested: is a tooltip or another click-through layer showing on top of what it picked? */
  private lookThrough(): void {
    if (!this.open || this.pinned || this.marquee.dragging || this.stepped) return
    const found = clickThroughAt(this.pointer.x, this.pointer.y, this.host.el)
    if (!found || found === this.raw) return
    this.overlay = found
    this.raw = found
    this.rest = null
    this.setTarget(found)
  }

  setTarget(el: Element | null): void {
    if (this.pinned) return
    if (!pickable(el, this.host.el)) el = null
    this.target = el
    if (el) {
      /* Notes mode: just the outline. The CSS comes with the note, folded. */
      if (this.cssOnHover) {
        this.card.showHover(el)
        if (this.shift) this.card.el.hidden = true
      } else if (this.card.mode === 'hover') this.card.hide()
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
    if (this.pinned) {
      /* A click outside the note puts things back as they were: just hovering.
         (A half-written note is kept for its element; see `drafts`.) */
      if (el !== this.pinned) this.unpin()
      return
    }
    if (el) this.pin(el)
  }

  pin(el: Element, existing?: Note): void {
    /* Hold the page still while the note is written: an open menu stays open. */
    this.freeze.freeze(false)
    this.pinned = el
    this.target = el
    this.outline.show(el)
    this.sent = false
    /* Start looking for where it's written now; it's usually found before Enter. */
    const where = sourceOf(el)
    this.card.pin(el, {
      existing: existing ? { n: existing.n, note: existing.note } : undefined,
      draft: existing ? undefined : this.drafts.get(el),
      cssOpen: this.cssOnHover,
      onSend: async text => {
        if (existing) {
          await api.edit(existing.id, text)
          void this.notes.refresh()
          return
        }
        const source = await Promise.race([where, wait(SOURCE_WAIT_MS, [] as SourceAt[])])
        const note = await api.add({ ...this.noteFor(el, text), ...(source.length ? { source } : {}), held: this.holding })
        this.sent = true
        this.drafts.delete(el)
        this.notes.added(note, el)
        return { n: note.n }
      },
      onClose: () => this.unpin(),
      onDelete: existing ? async () => { await api.remove(existing.id); await this.notes.refresh() } : undefined,
    })
  }

  /* ---------- a note on a section ---------- */

  private pointerDown(p: PointerEvent): void {
    this.down = p
  }

  /** Returns true while a drag is under way, so the move isn't treated as hovering. */
  private pointerMove(p: PointerEvent): boolean {
    if (this.down && !this.marquee.dragging && (p.buttons & 1) &&
      Math.hypot(p.clientX - this.down.clientX, p.clientY - this.down.clientY) > DRAG_PX) {
      this.unpin()
      this.setTarget(null)
      this.marquee.start(this.down.clientX, this.down.clientY)
    }
    if (!this.marquee.dragging) return false
    if (!(p.buttons & 1)) { this.pointerUp(); return true }   /* released outside the window */
    this.marquee.move(p.clientX, p.clientY)
    return true
  }

  private pointerUp(): void {
    const d = this.down
    this.down = null
    if (this.marquee.dragging) {
      const { box, members } = this.marquee.end()
      /* Round one element: that's just a note on it, CSS and all. */
      if (members.length === 1) {
        this.marquee.hide()
        this.rest = null
        this.setTarget(members[0])
        this.pin(members[0])
        return
      }
      this.pinGroup(members, box)
    } else if (d) this.pressAt(d)
  }

  /** Pin a note to a dragged area: the elements inside it, or the bare area. `box` is in viewport coordinates. */
  pinGroup(members: Element[], box: Box, existing?: Note): void {
    this.freeze.freeze(false)
    /* Start looking for where each is written now, as for a single element. */
    for (const m of members.slice(0, 12)) void sourceOf(m)
    const holder = commonAncestor(members) ?? document.body
    this.pinned = holder
    this.target = holder
    this.outline.hide()
    this.marquee.hold(members, members.length ? null : { left: box.left + scrollX, top: box.top + scrollY, right: box.right + scrollX, bottom: box.bottom + scrollY })
    const around = unionOf(members) ?? box
    const w = Math.round(around.right - around.left), hgt = Math.round(around.bottom - around.top)
    this.card.pin(null, {
      group: { label: members.length ? `${members.length}${members.length >= MAX_MEMBERS ? '+' : ''} elements` : 'Area', size: `${w} × ${hgt}` },
      existing: existing ? { n: existing.n, note: existing.note } : undefined,
      onSend: async text => {
        if (existing) {
          await api.edit(existing.id, text)
          void this.notes.refresh()
          return
        }
        const payload = this.noteForGroup(holder, members, box, text)
        /* Where each element is written, so Claude can line them up in the code too. */
        const places = await Promise.race([Promise.all(members.slice(0, 12).map(m => sourceOf(m))), wait(SOURCE_WAIT_MS, [] as SourceAt[][])])
        payload.group.forEach((g, i) => { const at = places[i]?.[0]; if (at) (g as GroupMember).source = at })
        const note = await api.add({ ...payload, held: this.holding })
        this.sent = true
        this.notes.added(note, members)
        return { n: note.n }
      },
      onClose: () => this.unpin(),
      onDelete: existing ? async () => { await api.remove(existing.id); await this.notes.refresh() } : undefined,
    })
  }

  private noteForGroup(holder: Element, members: Element[], box: Box, text: string) {
    const doc = (b: Box) => ({ x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), w: Math.round(b.right - b.left), h: Math.round(b.bottom - b.top) })
    const area = unionOf(members) ?? box
    return {
      note: text,
      page: location.href,
      element: { selector: holder === document.body ? 'body' : selectorFor(holder), tag: holder.tagName.toLowerCase(), name: members.length ? `${members.length} elements` : 'Area' },
      group: members.map(m => {
        const t = ((m as HTMLElement).innerText ?? m.textContent ?? '').replace(/\s+/g, ' ').trim()
        return { selector: selectorFor(m), name: labelOf(m), ...(t ? { text: t.slice(0, 120) } : {}) }
      }),
      at: { x: Math.round(area.right + scrollX), y: Math.round(area.top + scrollY) },
      rect: doc(area),
      css: [],
    }
  }

  unpin(): void {
    if (!this.pinned) return
    const draft = this.card.draft.trim()
    if (draft && !this.sent && this.card.description && !this.card.editing) this.drafts.set(this.pinned, this.card.draft)
    else if (!draft) this.drafts.delete(this.pinned)
    this.sent = false
    this.pinned = null
    this.freeze.unfreeze(false)
    this.card.hide()
    this.outline.hide()
    this.marquee.hide()
    this.target = null
    this.stepped = false
    /* The card just bowed out; don't bring the hover card straight back over the same spot. */
    this.rest = elementAt(this.pointer.x, this.pointer.y, this.host.el)
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
        this.syncShift(p)
        this.schedulePick()
        if (this.pointerMove(p)) return
      } else if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) {
        this.pointerDown(e as PointerEvent)
      } else if (e.type === 'pointerup') {
        this.pointerUp()
      }
      return
    }
    /* The pointer over our own UI (a marker, the pill) isn't pointing at the page. */
    if (e.type === 'pointerover' && this.open && !this.pinned) this.setTarget(null)
    /* A press anywhere but the panel and its button puts Settings away. */
    if (e.type === 'pointerdown' && this.settings.open && !this.settings.contains(e) && actionOf(e)?.action !== 'settings') this.settings.hide()
    if (this.settings.handle(e)) return
    if (this.tour.handle(e)) return
    if (this.card.handle(e)) return
    if (this.notes.handle(e)) return
    const action = this.toolbar.handle(e)
    if (action) this.act(action)
    if (e.type === 'keydown') this.onKey(e as KeyboardEvent, true)
    if (e.type === 'keyup') this.onKeyUp(e as KeyboardEvent)
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
      this.syncShift(p)
      if (this.pointerMove(p)) return 'swallow'
      this.schedulePick()
      return this.freeze.active ? 'stop' : undefined
    }
    if (e.type === 'mouseout' && !(e as MouseEvent).relatedTarget && !this.pinned) {
      /* The pointer left the window (into the Claude chat, say). */
      this.setTarget(null)
      return this.freeze.active ? 'stop' : undefined
    }
    /* With Settings open, a press on the page only puts it away; it doesn't place a note. */
    if (e.type === 'pointerdown') this.settingsPress = this.settings.open
    if (PRESS.has(e.type) && this.settingsPress) {
      if (e.type === 'pointerdown') this.settings.hide()
      if (e.type === 'click') this.settingsPress = false
      return 'swallow'
    }
    if (PRESS.has(e.type)) {
      if (this.through && !this.freeze.active) return
      if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) this.pointerDown(e as PointerEvent)
      if (e.type === 'pointerup') this.pointerUp()
      return 'swallow'
    }
    if (this.freeze.active && FROZEN_BLOCK.has(e.type)) return 'stop'
  }

  /** A press at a point on the page (or on the frost while frozen). */
  private pressAt(p: PointerEvent): void {
    /* Pick fresh at the press point: the pointer may not have moved since the last frame. */
    this.pointer = { x: p.clientX, y: p.clientY }
    const raw = clickThroughAt(p.clientX, p.clientY, this.host.el) ?? elementAt(p.clientX, p.clientY, this.host.el)
    this.rest = null
    if (!this.pinned) {
      if (!this.stepped || raw !== this.raw) { this.raw = raw; this.stepped = false; this.setTarget(raw ? snap(raw) : null) }
    } else {
      this.target = raw ? snap(raw) : null
    }
    this.press()
  }

  private onKey(e: KeyboardEvent, inside: boolean): 'swallow' | 'stop' | void {
    /* ⌥I opens and closes Inspeck from anywhere, even mid-typing in the app:
       it's a chord no one types by accident. */
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyI') {
      this.setOpen(!this.open)
      e.preventDefault()
      return 'swallow'
    }
    if (!this.open) return
    /* Typing in Inspeck's own fields is typing. Anywhere else in it (after
       clicking the pill, say), keys are shortcuts as on the page. */
    if (inside && isEditable(e.composedPath()[0] as Element)) return
    /* Shift on its own types nothing, so it measures even when one of the
       app's fields has the focus (an auto-focused search or message box). */
    if (e.key === 'Shift') { if (!this.pinned) this.setShift(true); return }
    /* Typing in the app's own fields stays the app's business. */
    if (isEditable(document.activeElement)) return
    /* A note is open but the cursor isn't in it: no key is a shortcut now.
       Escape still closes; anything else puts the cursor back in the note. */
    if (this.pinned && e.key !== 'Escape') {
      if (!e.metaKey && !e.ctrlKey) this.card.focus()
      return 'stop'
    }
    switch (e.key) {
      case 'Escape':
        if (this.settings.open) this.settings.hide()
        else if (this.pinned) this.unpin()
        else if (this.freeze.manual) this.freeze.unfreeze(true)
        else this.setOpen(false)
        return 'swallow'
      case 'c':
      case 'C':
        if (e.metaKey || e.ctrlKey || e.altKey) return
        this.setCssOnHover(!this.cssOnHover)
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
    }
  }

  /** The pointer says whether Shift is down, even when the page doesn't have
      the keyboard (the cursor was last in the Claude chat) or a key-up was missed. */
  private syncShift(p: PointerEvent): void {
    if (p.shiftKey !== this.shift && (!p.shiftKey || !this.pinned)) this.setShift(p.shiftKey)
  }

    private setShift(on: boolean): void {
    if (on === this.shift) return
    this.shift = on
    this.measureFrom = on ? this.target : null
    /* The numbers are the point while Shift is down; the hover card steps aside. */
    if (this.card.mode === 'hover') this.card.el.hidden = on
    if (on && this.target) this.measure(this.target)
    else this.spacing.hide()
  }

  /** Shift held: the element it went down on shows its own spacing; any other shows its distance from it. */
  private measure(el: Element): void {
    if (this.measureFrom && !this.measureFrom.isConnected) this.measureFrom = null
    this.measureFrom ??= el
    if (el === this.measureFrom) this.spacing.draw(el)
    else this.spacing.distance(this.measureFrom, el)
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
