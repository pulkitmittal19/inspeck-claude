/* The dark CSS card. On hover it shows the element's key declarations; on
 * click it pins and grows a note line. It never covers the element it
 * describes: below it when there's room, above it otherwise.
 */
import { describe, type Description } from './css/describe'
import { highlight, resolved } from './css/highlight'
import { clear, h, svg } from './dom'
import { ICONS } from './icons'
import { actionOf } from './router'

const GAP = 8
const EDGE = 8
const MAX_NOTE_LINES = 4

export interface PinOptions {
  /** Editing an existing note: its text and number. */
  existing?: { n: number; note: string }
  onSend(note: string): Promise<{ n: number } | void>
  onClose(): void
  onDelete?(): Promise<void>
}

export interface Card {
  el: HTMLDivElement
  readonly mode: 'hover' | 'pinned' | null
  readonly description: Description | null
  showHover(target: Element): void
  pin(target: Element, opts: PinOptions): void
  hide(): void
  /** Keep the card beside the element as it moves. */
  place(rect: DOMRect): void
  /** Events inside the widget that belong to the card. Returns true if handled. */
  handle(e: Event): boolean
  /** A nudge when you click elsewhere with a half-written note. */
  pulse(): void
  /** Put the cursor back in the note. */
  focus(): void
  readonly draft: string
}

export function renderCss(d: Description): HTMLDivElement {
  const box = h('div', { class: 'css' })
  for (const l of d.lines) {
    const row = h('div', { class: 'decl' }, h('span', { class: 'c-prop' }, l.prop), h('span', { class: 'c-punct' }, ': '))
    row.appendChild(highlight(l.value))
    row.appendChild(h('span', { class: 'c-punct' }, ';'))
    if (l.resolved) row.appendChild(resolved(l.resolved))
    box.appendChild(row)
  }
  if (!d.lines.length) box.appendChild(h('div', { class: 'decl empty' }, 'No styles of its own'))
  return box
}

function renderHead(d: Description, extra: Array<Node | null> = [], num?: number): HTMLDivElement {
  return h('div', { class: 'card-head' },
    num ? h('span', { class: 'num' }, `#${num}`) : null,
    h('span', { class: 'label' }, d.label),
    d.component ? h('span', { class: 'comp' }, d.component) : null,
    h('span', { class: 'size' }, d.size),
    ...extra)
}

const tool = (action: string, icon: keyof typeof ICONS, label: string) =>
  h('button', { type: 'button', class: 'tool', 'data-action': action, 'aria-label': label, title: label }, svg(ICONS[icon], 13))

export const cssText = (d: Description) => d.lines.map(l => `${l.prop}: ${l.value};`).join('\n')

let keysSeen = (() => { try { return localStorage.getItem('inspeck:keys-seen') === '1' } catch { return false } })()

export function createCard(ui: HTMLElement): Card {
  const el = h('div', { class: 'card', hidden: true })
  ui.appendChild(el)
  let mode: Card['mode'] = null
  let lastTarget: Element | null = null
  let desc: Description | null = null
  let opts: PinOptions | null = null
  let parts: { css: HTMLElement; fold: HTMLElement; note: HTMLTextAreaElement; send: HTMLButtonElement; status: HTMLElement; keys: HTMLElement | null } | null = null
  let busy = false

  const setFolded = (folded: boolean) => {
    if (!parts) return
    parts.css.hidden = folded
    parts.fold.hidden = !folded
  }

  const grow = () => {
    if (!parts) return
    const t = parts.note
    t.style.height = '20px'
    t.style.height = `${Math.min(t.scrollHeight, 20 * MAX_NOTE_LINES)}px`
  }

  const sync = () => {
    if (!parts) return
    const has = parts.note.value.trim().length > 0
    parts.send.disabled = !has || busy
    parts.send.toggleAttribute('data-ready', has)
    /* The first keystroke folds the CSS away so the note has the room. */
    if (has && !parts.css.hidden && !opts?.existing) setFolded(true)
    grow()
  }

  const status = (text: string, kind: 'ok' | 'error') => {
    if (!parts) return
    clear(parts.status)
    parts.status.append(kind === 'ok' ? svg(ICONS.check, 13, 2.4) : '', text)
    parts.status.dataset.kind = kind
    parts.status.hidden = false
  }

  const send = async () => {
    if (!parts || !opts || busy) return
    const text = parts.note.value.trim()
    if (!text) return
    busy = true
    sync()
    try {
      const r = await opts.onSend(text)
      if (!keysSeen) { keysSeen = true; try { localStorage.setItem('inspeck:keys-seen', '1') } catch { /* fine */ } }
      status(opts.existing ? 'Saved' : `Sent to Claude${r ? ` as #${r.n}` : ''}`, 'ok')
      parts.note.disabled = true
      const done = opts
      setTimeout(() => { if (opts === done) done.onClose() }, 900)
    } catch (err) {
      status((err as Error).message, 'error')
    } finally {
      busy = false
      sync()
    }
  }

  return {
    el,
    get mode() { return mode },
    get description() { return desc },
    get draft() { return parts?.note.value ?? '' },

    showHover(target) {
      if (mode === 'pinned') return
      if (target !== lastTarget || mode !== 'hover') {
        lastTarget = target
        desc = describe(target)
        clear(el)
        el.removeAttribute('data-pinned')
        el.append(renderHead(desc), renderCss(desc))
      }
      el.hidden = false
      mode = 'hover'
    },

    pin(target, o) {
      opts = o
      lastTarget = target
      desc = describe(target)
      mode = 'pinned'
      busy = false
      clear(el)
      el.setAttribute('data-pinned', '')
      const head = renderHead(desc, [h('span', { class: 'tools' }, tool('copy', 'copy', 'Copy CSS'), tool('close-card', 'close', 'Close'))], o.existing?.n)
      const css = renderCss(desc)
      const first = desc.lines[0]
      const fold = h('button', { type: 'button', class: 'fold', 'data-action': 'unfold', hidden: true },
        svg(ICONS.chevron, 11, 2.2), h('span', {}, `${desc.lines.length} properties`),
        first ? h('span', { class: 'fold-peek' }, `${first.prop}: ${first.value}; …`) : null)
      const note = h('textarea', { class: 'note-input', rows: 1, placeholder: 'Add a note for Claude…', 'aria-label': 'Note for Claude', spellcheck: 'true' })
      if (o.existing) note.value = o.existing.note
      const sendBtn = h('button', { type: 'button', class: 'send', 'data-action': 'send', 'aria-label': o.existing ? 'Save note' : 'Send to Claude', disabled: true }, svg(ICONS.enter, 13, 2.2))
      const noteRow = h('div', { class: 'note' }, svg(ICONS.note, 13), note, sendBtn)
      const statusEl = h('div', { class: 'status', hidden: true, role: 'status' })
      const keys = keysSeen ? null : h('div', { class: 'keys' },
        h('span', {}, h('span', { class: 'kbd' }, '↵'), ' send'), h('span', {}, h('span', { class: 'kbd' }, '⇧↵'), ' new line'), h('span', {}, h('span', { class: 'kbd' }, 'esc'), ' close'))
      const del = o.onDelete ? h('div', { class: 'note-actions' }, h('button', { type: 'button', class: 'link', 'data-action': 'delete' }, svg(ICONS.trash, 12), 'Delete')) : null
      el.append(head, css, fold, noteRow, statusEl, ...(keys ? [keys] : []), ...(del ? [del] : []))
      parts = { css, fold, note, send: sendBtn, status: statusEl, keys }
      if (o.existing) setFolded(true)
      el.hidden = false
      sync()
      /* Focus now, not on the next frame: on a busy page the next frame can be
         a quarter-second away, and the first keystrokes would land on the page. */
      const focusNote = () => { note.focus({ preventScroll: true }); note.setSelectionRange(note.value.length, note.value.length) }
      focusNote()
      requestAnimationFrame(() => { if (parts?.note === note && el.getRootNode() instanceof ShadowRoot && (el.getRootNode() as ShadowRoot).activeElement !== note) focusNote() })
    },

    hide() {
      el.hidden = true
      el.removeAttribute('data-pinned')
      mode = null
      lastTarget = null
      desc = null
      opts = null
      parts = null
    },

    focus() {
      parts?.note.focus({ preventScroll: true })
    },

    pulse() {
      el.removeAttribute('data-pulse')
      void el.offsetWidth
      el.setAttribute('data-pulse', '')
      parts?.note.focus({ preventScroll: true })
    },

    place(r) {
      if (!mode) return
      const w = el.offsetWidth, hgt = el.offsetHeight
      const vw = window.innerWidth, vh = window.innerHeight
      let top = r.bottom + GAP
      if (top + hgt > vh - EDGE && r.top - GAP - hgt >= EDGE) top = r.top - GAP - hgt
      if (top + hgt > vh - EDGE) top = Math.max(EDGE, vh - EDGE - hgt)
      const left = Math.min(vw - EDGE - w, Math.max(EDGE, r.left))
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
    },

    handle(e) {
      if (mode !== 'pinned' || !parts || !opts) return false
      if (!e.composedPath().includes(el)) return false
      if (e.type === 'input') { sync(); return true }
      if (e.type === 'keydown') {
        const k = e as KeyboardEvent
        if (k.isComposing) return true
        if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); void send(); return true }
        if (k.key === 'Escape') { k.preventDefault(); opts.onClose(); return true }
        return true
      }
      if (e.type === 'click') {
        const a = actionOf(e)
        switch (a?.action) {
          case 'send': void send(); break
          case 'close-card': opts.onClose(); break
          case 'unfold': setFolded(false); parts.note.focus({ preventScroll: true }); break
          case 'copy':
            if (desc) void navigator.clipboard?.writeText(cssText(desc)).then(() => status('CSS copied', 'ok'), () => status('Couldn’t copy', 'error'))
            break
          case 'delete':
            if (opts.onDelete) void opts.onDelete().then(() => opts?.onClose(), err => status((err as Error).message, 'error'))
            break
        }
        return true
      }
      return false
    },
  }
}
