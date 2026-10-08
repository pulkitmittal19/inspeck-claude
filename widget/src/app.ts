/* The widget's state and the one place events are decided. Each feature
   (picking, the CSS card, notes, markers, spacing, freeze) plugs in here. */
import { isEditable } from './dom'
import { tabStore } from './env'
import { createHost, type Host } from './host'
import { createOutline, type Outline } from './outline'
import { childToward, elementAt, parentOf, pickable, snap } from './pick'
import { createRouter } from './router'
import { createToolbar, type Toolbar } from './toolbar'

/* Presses that would act on the app. While Inspeck is open they pick instead. */
const PRESS = new Set(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick',
  'contextmenu', 'touchstart', 'touchend', 'dragstart'])

export class App {
  readonly host: Host
  readonly toolbar: Toolbar
  readonly outline: Outline
  open = false
  /** Held Space: presses go to the app, so you can open a menu to comment inside it. */
  through = false
  /** The element the person is pointing at (after snapping and ↑/↓). */
  target: Element | null = null
  private pointer = { x: -1, y: -1 }
  private raw: Element | null = null
  private stepped = false
  private pickFrame = 0
  private unroute: () => void

  constructor() {
    this.host = createHost()
    this.toolbar = createToolbar(this.host.ui)
    this.outline = createOutline(this.host.ui)
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
    if (!open) this.setTarget(null)
    else if (this.pointer.x >= 0) this.schedulePick()
  }

  private act(action: string): void {
    switch (action) {
      case 'open': this.setOpen(true); break
      case 'close': this.setOpen(false); break
    }
  }

  /* ---------- picking ---------- */

  private schedulePick(): void {
    if (this.pickFrame) return
    this.pickFrame = requestAnimationFrame(() => {
      this.pickFrame = 0
      if (!this.open) return
      const raw = elementAt(this.pointer.x, this.pointer.y, this.host.el)
      /* ↑/↓ choices hold until the pointer moves onto a different element. */
      if (this.stepped && raw === this.raw) return
      this.raw = raw
      this.stepped = false
      this.setTarget(raw ? snap(raw) : null)
    })
  }

  setTarget(el: Element | null): void {
    if (!pickable(el, this.host.el)) el = null
    this.target = el
    if (el) this.outline.show(el)
    else this.outline.hide()
  }

  private step(dir: 'up' | 'down'): void {
    if (!this.target) return
    const next = dir === 'up' ? parentOf(this.target) : childToward(this.target, this.pointer.x, this.pointer.y)
    if (next && pickable(next, this.host.el)) {
      this.stepped = true
      this.setTarget(next)
    }
  }

  /** A press on the page while open: this is where a note starts (step 5). */
  private press(_e: PointerEvent): void {
    /* placeholder until the note card lands */
  }

  /* ---------- events ---------- */

  /** Events inside Inspeck's own UI. */
  private onUi(e: Event): void {
    const action = this.toolbar.handle(e)
    if (action) this.act(action)
    if (e.type === 'keydown') this.onKey(e as KeyboardEvent, true)
    if (e.type === 'keyup') this.onKeyUp(e as KeyboardEvent)
    /* The pointer over our own UI isn't pointing at the page. */
    if (e.type === 'pointerover' && this.open) this.setTarget(null)
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
    if (e.type === 'mouseout' && !(e as MouseEvent).relatedTarget) {
      /* The pointer left the window (into the Claude chat, say). */
      this.setTarget(null)
      return
    }
    if (PRESS.has(e.type)) {
      if (this.through) return
      if (e.type === 'pointerdown' && (e as PointerEvent).button === 0) this.press(e as PointerEvent)
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
    if (!this.open) return
    /* Typing in the app's own fields stays the app's business. */
    if (!inside && isEditable(document.activeElement)) return
    if (inside) return
    switch (e.key) {
      case 'Escape':
        this.setOpen(false)
        return 'swallow'
      case 'ArrowUp':
      case 'ArrowDown':
        if (!this.target) return
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
