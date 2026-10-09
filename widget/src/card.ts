/* The dark CSS card. On hover it shows the element's key declarations; on
 * click it pins and grows a note line. It never covers the element it
 * describes: below it when there's room, above it otherwise.
 */
import { describe, type Description } from './css/describe'
import { highlight, middle, resolved } from './css/highlight'
import { present, rootFontPx } from './css/units'
import { prefs } from './prefs'
import { splitList } from './css/rules'
import { enter, leave, play } from './anim'
import { clear, h, svg } from './dom'
import { ICONS } from './icons'
import { actionOf } from './router'
import { cancelFrame, nextFrame } from './native'
import { listen, voiceReady, type Listening, type VoiceEvent } from './voice'

const GAP = 8
/** A value longer than this that is a comma list shows its first item and a count. */
const LIST_MAX = 34
const LABEL_MAX = 34
const EDGE = 8
const MAX_NOTE_LINES = 4
const PLACEHOLDER = 'Add a note for Claude…'
/** If the last words haven't settled this long after you stop, keep what came through. */
const FINISH_MS = 5000
/** How much each of the five bars moves with your voice: the middle most. */
const BAR_GAIN = [0.55, 0.8, 1, 0.8, 0.55]

export interface PinOptions {
  /** Editing an existing note: its text and number. */
  existing?: { n: number; note: string }
  /** Text you'd started before, to carry on with. */
  draft?: string
  /** Open with the CSS spread out (when it was already showing on hover); otherwise folded, behind the head's chevron. */
  cssOpen?: boolean
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
  /** Draw the CSS again, after Settings changed how values are written. */
  refresh(): void
}

export function renderCss(d: Description): HTMLDivElement {
  const box = h('div', { class: 'css' })
  /* Sizes and colours as chosen in Settings. The title, the copy and the note keep the code as written. */
  const fmt = { ...prefs.get(), rootPx: rootFontPx() }
  for (const l of d.lines) {
    const value = present(l.value, l.prop, fmt)
    /* A long list (a font stack, layered shadows, a transition per property):
       the first item, and how many more. The whole value is in the title and the copy. */
    const items = value.length > LIST_MAX ? splitList(value) : [value]
    const shown = items.length > 1 ? items[0] : value
    const row = h('div', { class: 'decl', title: `${l.prop}: ${l.value};${l.resolved ? `  ${l.resolved}` : ''}` },
      h('span', { class: 'c-prop' }, l.prop), h('span', { class: 'c-punct' }, ': '),
      /* The value may be cut short; the resolved value after it never is. */
      h('span', { class: 'val' }, highlight(shown)),
      items.length > 1 ? h('span', { class: 'more' }, `+${items.length - 1}`) : null,
      l.resolved ? resolved(present(l.resolved, l.prop, fmt)) : null)
    box.appendChild(row)
  }
  if (!d.lines.length) box.appendChild(h('div', { class: 'decl empty' }, 'No styles of its own'))
  return box
}

function renderHead(d: Pick<Description, 'label' | 'size' | 'component'>, extra: Array<Node | null> = [], num?: number, lead?: Node): HTMLDivElement {
  return h('div', { class: 'card-head' },
    lead ?? null,
    num ? h('span', { class: 'num' }, `#${num}`) : null,
    /* A long label (a stack of utility classes) keeps its start and its end. */
    h('span', { class: 'label', title: d.label }, middle(d.label, LABEL_MAX)),
    d.component ? h('span', { class: 'comp', title: d.component }, d.component) : null,
    h('span', { class: 'size' }, d.size),
    ...extra)
}

const tool = (action: string, icon: keyof typeof ICONS, label: string) =>
  h('button', { type: 'button', class: 'tool', 'data-action': action, 'aria-label': label, title: label }, svg(ICONS[icon], 13))

export const cssText = (d: Description) => d.lines.map(l => `${l.prop}: ${l.value};`).join('\n')


/** A section whose height animates open and closed. */
function reveal(cls: string, open: boolean, ...children: Array<Node | null>): HTMLDivElement {
  const inner = h('div', { class: 'inner' }, ...children)
  return h('div', { class: `reveal ${cls}`, 'data-open': open }, inner)
}
const setOpen = (el: HTMLElement | null | undefined, open: boolean) => el?.toggleAttribute('data-open', open)

/** Fold the CSS away on the first keystroke of a note. Off while we try the card with the CSS always showing. */
const AUTO_FOLD = false
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
    note: HTMLTextAreaElement; send: HTMLButtonElement
  } | null = null
  let busy = false
  let folded = false
  /* Speaking a note: what was typed before, the session, how loud (and how loud the bars show), and whether Enter asked to send. */
  let voice: {
    session: Listening; base: string; state: 'loading' | 'listening' | 'finishing'
    level: number; shown: number; raf: number; sendAfter: boolean; timer: number
  } | null = null
  /** The CSS folds by itself once, on the first keystroke; after that only you fold or open it. */
  let autoFolded = false
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
    if (AUTO_FOLD && has && !autoFolded) { autoFolded = true; setFolded(true) }
    grow()
  }

  const status = (text: string, kind: 'ok' | 'error') => {
    if (!parts) return
    clear(parts.status)
    parts.status.append(...(kind === 'ok' ? [svg(ICONS.check, 13, 2.4)] : []), text)
    parts.status.dataset.kind = kind
    setOpen(parts.statusWrap, true)
  }

  /* ---------- voice ---------- */

  const voiceState = (state: 'loading' | 'listening' | 'finishing' | null) => {
    const row = parts?.note.parentElement
    if (!row) return
    if (state) row.setAttribute('data-voice', state)
    else row.removeAttribute('data-voice')
    const mic = row.querySelector<HTMLElement>('.mic')
    mic?.setAttribute('aria-pressed', String(state === 'listening'))
    mic?.setAttribute('aria-label', state === 'listening' ? 'Stop and keep the text' : state ? 'Cancel' : 'Speak your note')
  }
  const hint = (text: string) => { if (parts) parts.note.placeholder = text }

  /* The bars and the glow follow your voice, eased so they breathe rather than flicker. */
  const animate = () => {
    if (!voice || !parts) return
    const v = voice
    v.shown += (v.level - v.shown) * (v.level > v.shown ? 0.45 : 0.18)
    const row = parts.note.parentElement!
    row.style.setProperty('--lvl', v.shown.toFixed(3))
    const t = performance.now()
    row.querySelectorAll<HTMLElement>('.wave i').forEach((bar, i) => {
      const wobble = 0.72 + 0.28 * Math.sin(t / 130 + i * 1.7)
      bar.style.transform = `scaleY(${Math.min(1, 0.18 + v.shown * BAR_GAIN[i] * wobble).toFixed(3)})`
    })
    v.raf = nextFrame(animate)
  }

  const endVoice = () => {
    if (!voice) return
    cancelFrame(voice.raf)
    clearTimeout(voice.timer)
    voice = null
    voiceState(null)
    hint(PLACEHOLDER)
    parts?.note.parentElement?.style.removeProperty('--lvl')
  }

  /** The words so far, after what you'd typed. */
  const showWords = (text: string) => {
    if (!parts || !voice) return
    const t = parts.note
    t.value = voice.base + text
    t.setSelectionRange(t.value.length, t.value.length)
    grow()
    t.scrollTop = t.scrollHeight
    sync()
  }

  const onVoice = (e: VoiceEvent) => {
    if (!voice || !parts) return
    switch (e.type) {
      case 'loading':
        hint(e.what === 'model' ? `Getting the speech model${e.progress ? ` · ${Math.round(e.progress * 100)}%` : ''}…` : 'Getting the mic ready…')
        break
      case 'listening':
        voice.state = 'listening'
        voiceState('listening')
        hint('Listening…')
        break
      case 'level':
        voice.level = e.value
        break
      case 'text':
        showWords(e.final + e.partial)
        break
      case 'done': {
        const sendAfter = voice.sendAfter
        showWords(e.text)
        parts.note.value = parts.note.value.trim()
        endVoice()
        sync()
        play(parts.note, 'data-settle', 520)
        parts.note.focus({ preventScroll: true })
        if (sendAfter && parts.note.value) void send()
        break
      }
      case 'error':
        endVoice()
        sync()
        status(e.message, 'error')
        play(el, 'data-pulse', 300)
        break
    }
  }

  const startVoice = () => {
    if (!parts || voice || busy) return
    const typed = parts.note.value.replace(/\s+$/, '')
    setOpen(parts.statusWrap, false)
    voice = { session: listen(onVoice), base: typed ? `${typed} ` : '', state: 'loading', level: 0, shown: 0, raf: 0, sendAfter: false, timer: 0 }
    voiceState('loading')
    hint('Getting the mic ready…')
    parts.note.focus({ preventScroll: true })
    animate()
  }

  /** Stop listening and keep the words; with Enter, send them too. Before it hears anything, it's just a cancel. */
  const stopVoice = (sendAfter: boolean) => {
    if (!voice) return
    if (voice.state === 'loading') { cancelVoice(); return }
    voice.sendAfter ||= sendAfter
    if (voice.state === 'finishing') return
    voice.state = 'finishing'
    voiceState('finishing')
    voice.session.stop()
    const v = voice
    v.timer = window.setTimeout(() => { if (voice === v) { v.session.cancel(); onVoice({ type: 'done', text: parts?.note.value.slice(v.base.length) ?? '' }) } }, FINISH_MS)
  }

  /** Drop the session; what's in the box stays. */
  const cancelVoice = () => {
    if (!voice) return
    voice.session.cancel()
    endVoice()
    sync()
  }

  const send = async () => {
    if (!parts || !opts || busy) return
    const text = parts.note.value.trim()
    if (!text) return
    busy = true
    sync()
    try {
      const r = await opts.onSend(text)
      /* The note line gives way to the confirmation, then the card bows out. */
      setOpen(parts.noteWrap, false)
      /* Waiting for Send, it's added to the page; with Auto-send notes to Claude on, it's gone to Claude. */
      const waits = prefs.get().send === 'ask'
      status(opts.existing ? 'Saved' : `${waits ? 'Added' : 'Sent to Claude'}${r ? ` as #${r.n}` : ''}`, 'ok')
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
      if (target !== lastTarget || mode !== 'hover') {
        lastTarget = target
        desc = describe(target)
        clear(el)
        el.removeAttribute('data-pinned')
        el.removeAttribute('data-sent')
        el.removeAttribute('data-folded')
        /* Already showing for another element, it moves with the outline's glide (see place). */
        el.append(renderHead(desc), renderCss(desc))
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
      /* Folded (the head's chevron opens it) unless the CSS was already showing on hover. */
      folded = !o.cssOpen || (AUTO_FOLD && !!o.existing)
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
      cancelVoice()
      const note = h('textarea', { class: 'note-input', rows: 1, placeholder: PLACEHOLDER, 'aria-label': 'Note for Claude', spellcheck: 'true' })
      if (o.existing) note.value = o.existing.note
      else if (o.draft) note.value = o.draft
      const sendBtn = h('button', { type: 'button', class: 'send', 'data-action': 'send', 'aria-label': o.existing ? 'Save note' : prefs.get().send === 'ask' ? 'Add note' : 'Send to Claude', disabled: true }, svg(ICONS.enter, 13, 2.2))
      /* The pinned parts start closed and open on the next frame, so the card
         grows from what you were just hovering into the note. */
      /* Voice, where this Mac can do it: a mic beside send, and five bars that take the note icon's place while it listens. */
      const mic = voiceReady()
        ? h('button', { type: 'button', class: 'mic', 'data-action': 'mic', 'aria-label': 'Speak your note', 'aria-pressed': 'false', title: 'Speak your note' },
          h('span', { class: 'mic-glow', 'aria-hidden': 'true' }), svg(ICONS.mic, 14, 1.9), svg(ICONS.stop, 12))
        : null
      const wave = mic ? h('span', { class: 'wave', 'aria-hidden': 'true' }, ...BAR_GAIN.map(() => h('i', {}))) : null
      const noteWrap = reveal('note-wrap', false, h('div', { class: 'note' }, svg(ICONS.note, 13), wave, note, mic, sendBtn))
      const statusEl = h('div', { class: 'status', role: 'status' })
      const statusWrap = reveal('status-wrap quick', false, statusEl)
      const actionsWrap = o.onDelete ? reveal('actions-wrap', false, h('div', { class: 'note-actions' }, h('button', { type: 'button', class: 'link', 'data-action': 'delete' }, svg(ICONS.trash, 12), 'Delete'))) : null
      el.append(head, ...(cssWrap ? [cssWrap] : []), noteWrap, statusWrap, ...(actionsWrap ? [actionsWrap] : []))
      parts = { cssWrap, noteWrap, statusWrap, status: statusEl, note, send: sendBtn }
      if (!wasShowing) enter(el)
      sync()
      /* Focus now, not on the next frame: on a busy page the next frame can be
         a quarter-second away, and the first keystrokes would land on the page. */
      const focusNote = () => { note.focus({ preventScroll: true }); note.setSelectionRange(note.value.length, note.value.length) }
      focusNote()
      nextFrame(() => {
        setOpen(noteWrap, true)
        setOpen(actionsWrap, true)
        if (parts?.note === note && (el.getRootNode() as ShadowRoot).activeElement !== note) focusNote()
      })
    },

    hide() {
      cancelVoice()
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

    refresh() {
      if (desc) for (const box of Array.from(el.querySelectorAll('.css'))) box.replaceWith(renderCss(desc))
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
      /* Typing (or pasting, or the Mac's own dictation) takes over from the mic; Inspeck's own words don't fire input. */
      if (e.type === 'input') { if (voice) cancelVoice(); sync(); return true }
      /* While it listens: Enter stops and sends, Escape cancels, and typing takes over from the mic. */
      if (e.type === 'keydown' && voice) {
        const k = e as KeyboardEvent
        if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); stopVoice(true); return true }
        if (k.key === 'Escape') { k.preventDefault(); cancelVoice(); return true }
        if (!['Shift', 'Meta', 'Control', 'Alt'].includes(k.key)) cancelVoice()
      }
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
          case 'send': if (voice) stopVoice(true); else void send(); break
          case 'mic': if (voice) stopVoice(false); else startVoice(); break
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
