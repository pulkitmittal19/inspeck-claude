/* The dark CSS card. On hover it shows the element's key declarations; on
 * click it pins and grows a note line. It never covers the element it
 * describes: below it when there's room, above it otherwise.
 */
import { describe, type Description } from './css/describe'
import { highlight, resolved } from './css/highlight'
import { enter, leave, play } from './anim'
import { clear, h, svg } from './dom'
import { ICONS } from './icons'
import { actionOf } from './router'

const GAP = 8
const EDGE = 8
const MAX_NOTE_LINES = 4

export interface PinOptions {
  /** Editing an existing note: its text and number. */
  existing?: { n: number; note: string }
  /** Text you'd started before, to carry on with. */
  draft?: string
  /** A note on a dragged area rather than one element: what the head says. No CSS. */
  group?: { label: string; size: string }
  onSend(note: string): Promise<{ n: number } | void>
  onClose(): void
  onDelete?(): Promise<void>
}

export interface Card {
  el: HTMLDivElement
  readonly mode: 'hover' | 'pinned' | null
  readonly description: Description | null
  showHover(target: Element): void
  /** Pin to an element, or (with `opts.group`) to a dragged area, with `target` null. */
  pin(target: Element | null, opts: PinOptions): void
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
  /** The open note is one already sent, being edited. */
  readonly editing: boolean
}

export function renderCss(d: Description): HTMLDivElement {
  const box = h('div', { class: 'css' })
  for (const l of d.lines) {
    const row = h('div', { class: 'decl' }, h('span', { class: 'c-prop' }, l.prop), h('span', { class: 'c-punct' }, ': '))
    row.appendChild(highlight(l.value))
    if (l.resolved) row.appendChild(resolved(l.resolved))
    box.appendChild(row)
  }
  if (!d.lines.length) box.appendChild(h('div', { class: 'decl empty' }, 'No styles of its own'))
  return box
}

function renderHead(d: Pick<Description, 'label' | 'size' | 'component'>, extra: Array<Node | null> = [], num?: number, lead?: Node): HTMLDivElement {
  return h('div', { class: 'card-head' },
    lead ?? null,
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

/** A section whose height animates open and closed. */
function reveal(cls: string, open: boolean, ...children: Array<Node | null>): HTMLDivElement {
  const inner = h('div', { class: 'inner' }, ...children)
  return h('div', { class: `reveal ${cls}`, 'data-open': open }, inner)
}
const setOpen = (el: HTMLElement | null | undefined, open: boolean) => el?.toggleAttribute('data-open', open)

const GLIDE_MS = 170
const SENT_HOLD_MS = 750

export function createCard(ui: HTMLElement): Card {
  const el = h('div', { class: 'card', hidden: true })
  ui.appendChild(el)
  let mode: Card['mode'] = null
  let lastTarget: Element | null = null
  let desc: Description | null = null
  let opts: PinOptions | null = null
  let parts: {
    cssWrap: HTMLElement | null; noteWrap: HTMLElement; statusWrap: HTMLElement; status: HTMLElement
    keysWrap: HTMLElement | null; note: HTMLTextAreaElement; send: HTMLButtonElement
  } | null = null
  let busy = false
  let folded = false
  /** The CSS folds by itself once, on the first keystroke; after that only you fold or open it. */
  let autoFolded = false
  let glide = 0

  const glideNow = () => {
    el.setAttribute('data-glide', '')
    clearTimeout(glide)
    glide = window.setTimeout(() => el.removeAttribute('data-glide'), GLIDE_MS)
  }

  const setFolded = (f: boolean) => {
    if (!parts) return
    folded = f
    setOpen(parts.cssWrap, !f)
    el.toggleAttribute('data-folded', f)
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
    if (has && !autoFolded) { autoFolded = true; setFolded(true) }
    grow()
  }

  const status = (text: string, kind: 'ok' | 'error') => {
    if (!parts) return
    clear(parts.status)
    parts.status.append(...(kind === 'ok' ? [svg(ICONS.check, 13, 2.4)] : []), text)
    parts.status.dataset.kind = kind
    setOpen(parts.statusWrap, true)
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
      /* The note line gives way to the confirmation, then the card bows out. */
      setOpen(parts.noteWrap, false)
      setOpen(parts.keysWrap, false)
      status(opts.existing ? 'Saved' : `Sent to Claude${r ? ` as #${r.n}` : ''}`, 'ok')
      const done = opts
      setTimeout(() => {
        if (opts !== done) return
        el.setAttribute('data-sent', '')
        done.onClose()
      }, SENT_HOLD_MS)
    } catch (err) {
      status((err as Error).message, 'error')
      play(el, 'data-pulse', 300)
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
    get editing() { return !!opts?.existing },

    showHover(target) {
      if (mode === 'pinned') return
      const visible = !el.hidden && el.dataset.state !== 'out'
      if (target !== lastTarget || mode !== 'hover') {
        lastTarget = target
        desc = describe(target)
        clear(el)
        el.removeAttribute('data-pinned')
        el.removeAttribute('data-sent')
        el.removeAttribute('data-folded')
        el.append(renderHead(desc), renderCss(desc))
        /* Already showing for another element: glide over rather than blink. */
        if (visible) glideNow()
      }
      mode = 'hover'
      enter(el)
    },

    pin(target, o) {
      const wasShowing = !el.hidden && el.dataset.state !== 'out'
      opts = o
      lastTarget = target
      desc = target && !o.group ? describe(target) : null
      mode = 'pinned'
      busy = false
      /* A note you're editing opens with its CSS folded; a new one with it open. */
      folded = !!o.existing
      autoFolded = folded || !desc
      clear(el)
      el.removeAttribute('data-sent')
      el.toggleAttribute('data-folded', folded)
      el.setAttribute('data-pinned', '')
      const close = tool('close-card', 'close', 'Close')
      let head: HTMLDivElement
      let cssWrap: HTMLDivElement | null = null
      if (desc) {
        /* The whole head is the fold toggle, so it's always in the same place. */
        const chevron = h('span', { class: 'chev', 'aria-hidden': 'true' }, svg(ICONS.chevron, 10, 2.4))
        head = renderHead(desc, [h('span', { class: 'tools' }, tool('copy', 'copy', 'Copy CSS'), close)], o.existing?.n, chevron)
        head.setAttribute('data-action', 'fold')
        head.setAttribute('role', 'button')
        head.setAttribute('aria-label', 'Show or hide the CSS')
        cssWrap = reveal('css-wrap', !folded, renderCss(desc))
      } else {
        head = renderHead(o.group ?? { label: 'Area', size: '' }, [h('span', { class: 'tools' }, close)], o.existing?.n)
      }
      const note = h('textarea', { class: 'note-input', rows: 1, placeholder: 'Add a note for Claude…', 'aria-label': 'Note for Claude', spellcheck: 'true' })
      if (o.existing) note.value = o.existing.note
      else if (o.draft) note.value = o.draft
      const sendBtn = h('button', { type: 'button', class: 'send', 'data-action': 'send', 'aria-label': o.existing ? 'Save note' : 'Send to Claude', disabled: true }, svg(ICONS.enter, 13, 2.2))
      /* The pinned parts start closed and open on the next frame, so the card
         grows from what you were just hovering into the note. */
      const noteWrap = reveal('note-wrap', false, h('div', { class: 'note' }, svg(ICONS.note, 13), note, sendBtn))
      const statusEl = h('div', { class: 'status', role: 'status' })
      const statusWrap = reveal('status-wrap quick', false, statusEl)
      const keysWrap = keysSeen ? null : reveal('keys-wrap', false, h('div', { class: 'keys' },
        h('span', {}, h('span', { class: 'kbd' }, '↵'), ' send'), h('span', {}, h('span', { class: 'kbd' }, '⇧↵'), ' new line'), h('span', {}, h('span', { class: 'kbd' }, 'esc'), ' close')))
      const actionsWrap = o.onDelete ? reveal('actions-wrap', false, h('div', { class: 'note-actions' }, h('button', { type: 'button', class: 'link', 'data-action': 'delete' }, svg(ICONS.trash, 12), 'Delete'))) : null
      el.append(head, ...(cssWrap ? [cssWrap] : []), noteWrap, statusWrap, ...(keysWrap ? [keysWrap] : []), ...(actionsWrap ? [actionsWrap] : []))
      parts = { cssWrap, noteWrap, statusWrap, status: statusEl, keysWrap, note, send: sendBtn }
      if (!wasShowing) enter(el)
      sync()
      /* Focus now, not on the next frame: on a busy page the next frame can be
         a quarter-second away, and the first keystrokes would land on the page. */
      const focusNote = () => { note.focus({ preventScroll: true }); note.setSelectionRange(note.value.length, note.value.length) }
      focusNote()
      requestAnimationFrame(() => {
        setOpen(noteWrap, true)
        setOpen(keysWrap, true)
        setOpen(actionsWrap, true)
        if (parts?.note === note && (el.getRootNode() as ShadowRoot).activeElement !== note) focusNote()
      })
    },

    hide() {
      mode = null
      lastTarget = null
      desc = null
      opts = null
      parts = null
      leave(el, el.hasAttribute('data-sent') ? 220 : 140, () => el.removeAttribute('data-pinned'))
    },

    focus() {
      parts?.note.focus({ preventScroll: true })
    },

    pulse() {
      play(el, 'data-pulse', 300)
      parts?.note.focus({ preventScroll: true })
    },

    place(r) {
      if (!mode && el.dataset.state !== 'out') return
      const w = el.offsetWidth, hgt = el.offsetHeight
      const vw = window.innerWidth, vh = window.innerHeight
      let top = r.bottom + GAP
      let below = true
      if (top + hgt > vh - EDGE && r.top - GAP - hgt >= EDGE) { top = r.top - GAP - hgt; below = false }
      if (top + hgt > vh - EDGE) top = Math.max(EDGE, vh - EDGE - hgt)
      const left = Math.min(vw - EDGE - w, Math.max(EDGE, r.left))
      /* Arrive from the element's side: rising when below it, settling when above. */
      el.style.setProperty('--ix-rise', below ? '5px' : '-5px')
      el.style.setProperty('--ix-origin', below ? 'top left' : 'bottom left')
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
    },

    handle(e) {
      if (mode !== 'pinned' || !parts || !opts) return false
      if (!e.composedPath().includes(el)) return false
      if (e.type === 'input') { sync(); return true }
      /* A press anywhere else on the card (its head, the CSS, a button) leaves
         the cursor in the note, so you can click and carry on typing. */
      if (e.type === 'mousedown' && !(e.composedPath()[0] instanceof HTMLTextAreaElement)) { e.preventDefault(); return true }
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
          case 'fold': {
            setFolded(!folded)
            parts.note.focus({ preventScroll: true })
            break
          }
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
