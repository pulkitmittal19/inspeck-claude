/* The widget's state and the one place events are decided. Each feature
   (picking, the CSS card, notes, markers, spacing, freeze) plugs in here. */
import { isEditable } from './dom'
import { tabStore } from './env'
import { createHost, type Host } from './host'
import { createRouter } from './router'
import { createToolbar, type Toolbar } from './toolbar'

export class App {
  readonly host: Host
  readonly toolbar: Toolbar
  open = false
  private unroute: () => void

  constructor() {
    this.host = createHost()
    this.toolbar = createToolbar(this.host.ui)
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
  }

  private act(action: string): void {
    switch (action) {
      case 'open': this.setOpen(true); break
      case 'close': this.setOpen(false); break
    }
  }

  /** Events inside Inspeck's own UI. */
  private onUi(e: Event): void {
    const action = this.toolbar.handle(e)
    if (action) this.act(action)
    if (e.type === 'keydown') this.onKey(e as KeyboardEvent, true)
  }

  /** Events on the page. Returning a verdict stops the app from seeing it. */
  private onPage(e: Event): 'swallow' | 'stop' | void {
    if (e.type === 'keydown') return this.onKey(e as KeyboardEvent, false)
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
    if (!inside && isEditable(document.activeElement)) return
    if (e.key === 'Escape') {
      this.setOpen(false)
      return 'swallow'
    }
  }

  destroy(): void {
    this.unroute()
    this.host.destroy()
  }
}
