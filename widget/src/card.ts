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
import { listen, voiceReady, warmVoice, type Listening, type VoiceEvent } from './voice'

const GAP = 8
/** A value longer than this that is a comma list shows its first item and a count. */
const LIST_MAX = 34
const LABEL_MAX = 34
const EDGE = 8
const MAX_NOTE_LINES = 4
const PLACEHOLDER = 'Add a note for Claude…'
/** The most one note holds (the plugin keeps to it too): about a page, an easy read for Claude. */
const NOTE_MAX = 4000
const FULL = 'That’s the most one note can hold. Add another note to continue.'
/** If the last words haven't settled this long after you stop, keep what came through. */
const FINISH_MS = 5000
/** A start takes about 0.35–0.7 s (macOS opening the mic, loading the speech model); words before it are lost.
    Past this the mic's glyph fades in and out, to say "a moment"; quicker starts show nothing. */
const SLOW_MS = 250
/** Past this, the box says so in words too. */
const SLOW_WORDS_MS = 1200
/** How much each of the mic's three bars moves with your voice: the middle most. */
const BAR_GAIN = [0.65, 1, 0.8]
/** Words come from the recogniser in clumps. They're let out on one timeline, a word every WORD_STEP_MS,
    so they read as steady typing; if they pile up, the step shrinks so none trails more than REVEAL_MS. */
const WORD_STEP_MS = 55
const REVEAL_MS = 500

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean)

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
       the first item, and how many more. The whole value is in the row's tip and the copy. */
    const items = value.length > LIST_MAX ? splitList(value) : [value]
    const shown = items.length > 1 ? items[0] : value
    /* The tip gives the declaration as written, in full. It's worth showing when the row hides something:
       a list cut to its first item, a token's short name, a colour this format can only come near,
       or a value cut off at the card's edge (that one is checked when the pointer arrives). */
    const hides = items.length > 1 || /var\(|≈/.test(shown)
    const row = h('div', {
      class: 'decl', 'data-tip': `${l.prop}: ${l.value};`, 'data-tip-code': '', 'data-tip-res': l.resolved ?? null,
      'data-tip-note': shown.includes('≈') ? '≈ the nearest colour this format can show' : null,
      'data-tip-if': hides ? null : 'clipped',
    },
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
    /* The full name as a tooltip only when it had to be shortened; otherwise it would just repeat itself. */
    h('span', { class: 'label', 'data-tip': middle(d.label, LABEL_MAX) !== d.label ? d.label : null }, middle(d.label, LABEL_MAX)),
    d.component ? h('span', { class: 'comp', 'data-tip': d.component, 'data-tip-if': 'clipped' }, d.component) : null,
    h('span', { class: 'size' }, d.size),
    ...extra)
}

const tool = (action: string, icon: keyof typeof ICONS, label: string) =>
  h('button', { type: 'button', class: 'tool', 'data-action': action, 'aria-label': label, 'data-tip': label }, svg(ICONS[icon], 13))

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
  /* Speaking a note: what was typed before, the session, how loud (and how loud the bars show), whether Enter asked to send,
     and the words the overlay shows (the final ones, then the ones still settling). */
  let voice: {
    session: Listening; base: string; state: 'loading' | 'listening' | 'finishing'
    level: number; shown: number; raf: number; sendAfter: boolean; timer: number; slow: number; slowWords: number
    /** When the next new word may appear (performance.now()). */
    revealAt: number
    /** How far into the sentence words have made their entrance: a place only makes one. */
    reached: number
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
    edges()
  }
  /* Past four lines the note scrolls, with no scrollbar: a soft fade at the top says there's more above,
     one at the bottom that there's more below. */
  const edges = () => {
    if (!parts) return
    const t = parts.note
    const above = t.scrollTop > 1, below = t.scrollTop + t.clientHeight < t.scrollHeight - 1
    const fade = above && below ? 'both' : above ? 'top' : below ? 'bottom' : ''
    t.dataset.fade = fade
    /* The voice layer, over it while words arrive, scrolls with it and fades the same. */
    const layer = t.parentElement?.querySelector<HTMLElement>('.voice-text')
    if (layer) { layer.scrollTop = t.scrollTop; layer.dataset.fade = fade }
  }

  /** Whether the note is at its limit, saying so under the box. */
  let full = false
  const sync = () => {
    if (!parts) return
    const now = parts.note.value.length >= NOTE_MAX
    if (now !== full) {
      full = now
      if (now) status(FULL, 'error')
      else if (parts.status.textContent === FULL) setOpen(parts.statusWrap, false)
    }
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

  /* ---------- voice ----------
     Everything happens inside the mic button: its glyph gives way to three
     level bars while it listens, and nothing else on the card moves. The words
     are drawn on a layer over the text box while they arrive, so the newest
     can fade in and the ones still settling can sit a shade lighter; when it
     stops, the text box (which held the same text all along, for its height)
     shows them again, ready to edit. */

  const rowOf = () => parts?.note.closest<HTMLElement>('.note') ?? null
  const micOf = () => rowOf()?.querySelector<HTMLElement>('.mic') ?? null
  const layerOf = () => rowOf()?.querySelector<HTMLElement>('.voice-text') ?? null

  /** The row says voice is on (the text box hands its text to the layer, send keeps quiet); the mic says how. */
  const voiceState = (state: 'loading' | 'listening' | 'finishing' | null) => {
    const row = rowOf(), mic = micOf()
    if (!row || !mic) return
    row.toggleAttribute('data-voice', !!state)
    if (state === 'listening') mic.dataset.state = 'on'
    else if (state !== 'loading') delete mic.dataset.state
    mic.setAttribute('aria-pressed', String(state === 'listening'))
    mic.setAttribute('aria-label', state === 'listening' ? 'Stop and keep the text' : state ? 'Cancel' : 'Speak your note')
    /* Its tip says what a press does now. */
    mic.dataset.tip = state === 'listening' ? 'Stop · Enter saves' : state === 'loading' ? 'Cancel' : state ? '' : 'Speak your note'
    if (micTipFor === mic) showMicTip(mic)
  }

  /* The card's buttons (copy, close, the mic) have tips like the pill's: above the button after a short
     rest (below it when the card is at the top of the window). The tip lives on the card, outside the note
     row's open-and-close animation, so nothing clips it. */
  let micTip: HTMLElement | null = null
  let micTipFor: HTMLElement | null = null
  let micTipWait = 0
  const showMicTip = (btn: HTMLElement | null) => {
    clearTimeout(micTipWait)
    micTipFor = btn
    const text = btn?.dataset.tip
    /* Some tips only repeat what's on screen unless it was cut off: those wait until it is. */
    const needed = btn?.dataset.tipIf !== 'clipped' || clipped(btn)
    if (!micTip || !btn || !text || !needed) { micTip?.removeAttribute('data-show'); return }
    /* A declaration reads as code, with its resolved value after it a shade dimmer. */
    const { tipRes: res, tipNote: note } = btn.dataset
    micTip.replaceChildren(text, ...(res ? [h('span', { class: 'tip-res' }, res)] : []), ...(note ? [h('span', { class: 'tip-note' }, note)] : []))
    micTip.toggleAttribute('data-code', btn.dataset.tipCode !== undefined)
    const r = btn.getBoundingClientRect(), c = el.getBoundingClientRect()
    const below = r.top < 36
    micTip.toggleAttribute('data-below', below)
    /* Centred on a button; on something wider than the tip (a CSS row), lined up with its start, where you read from.
       Either way inside the card. */
    const w = micTip.offsetWidth
    const left = r.width > w ? r.left - c.left : r.left + r.width / 2 - c.left - w / 2
    micTip.style.left = `${Math.round(Math.max(4, Math.min(c.width - w - 4, left)))}px`
    micTip.style.top = `${Math.round((below ? r.bottom : r.top) - c.top)}px`
    micTip.setAttribute('data-show', '')
  }
  /** Whether any of it is cut off at its edge (an ellipsis). */
  const clipped = (x: HTMLElement) => [x, ...Array.from(x.querySelectorAll<HTMLElement>('.val, .res'))].some(e => e.scrollWidth > e.clientWidth + 1)
  const tipOnHover = (btn: HTMLElement) => {
    /* Moving between the card's own parts never reaches the router (to the page, nothing changed: both are
       inside Inspeck), so each button listens for itself; leaving to the page is caught in handle(). */
    btn.addEventListener('pointerenter', () => { if (micTipFor !== btn) { clearTimeout(micTipWait); micTipFor = btn; micTipWait = window.setTimeout(() => showMicTip(btn), 350) } })
    btn.addEventListener('pointerleave', () => showMicTip(null))
  }
  const hint = (text: string) => { if (parts) parts.note.placeholder = text }
  const slowly = () => { const mic = micOf(); if (mic && voice?.state === 'loading') mic.dataset.state = 'slow' }

  /* The bars follow your voice: quick to rise, slower to fall, with a little sway so three bars don't move as one. */
  const animate = () => {
    if (!voice || !parts) return
    const v = voice
    v.shown += (v.level - v.shown) * (v.level > v.shown ? 0.35 : 0.14)
    const t = performance.now()
    micOf()?.querySelectorAll<HTMLElement>('.bars i').forEach((bar, i) => {
      bar.style.setProperty('--h', Math.min(1, 0.25 + v.shown * BAR_GAIN[i] * (0.82 + 0.18 * Math.sin(t / 110 + i * 2))).toFixed(3))
    })
    v.raf = nextFrame(animate)
  }

  const endVoice = () => {
    if (!voice) return
    /* Ready for another go while the note is still open. */
    warmVoice()
    cancelFrame(voice.raf)
    clearTimeout(voice.timer)
    clearTimeout(voice.slow)
    clearTimeout(voice.slowWords)
    voice = null
    voiceState(null)
    hint(PLACEHOLDER)
    micOf()?.querySelectorAll<HTMLElement>('.bars i').forEach(bar => bar.style.removeProperty('--h'))
    const layer = layerOf()
    if (layer) clear(layer)
  }

  /** The words so far, after what you'd typed. Words already showing stay put; new or changed ones fade in. */
  const showWords = (finalText: string, partial: string) => {
    if (!parts || !voice) return
    const done = wordsOf(finalText).length
    const words = wordsOf(`${finalText} ${partial}`)
    /* The text box holds the same text, so it grows (and wraps) exactly as the layer does. */
    const t = parts.note
    const all = voice.base + words.join(' ')
    t.value = all.slice(0, NOTE_MAX)
    grow()
    sync()
    /* Full: keep what fits and stop listening. */
    if (all.length > NOTE_MAX) { stopVoice(false); return }
    const layer = layerOf()
    if (!layer) return
    if (!layer.firstChild) layer.append(voice.base)
    layer.querySelector('.caret')?.remove()
    const shown = Array.from(layer.querySelectorAll<HTMLElement>('.w'))
    const now = performance.now()
    /* The next slot on the reveal timeline; with a backlog, the step tightens so it never runs past REVEAL_MS. */
    const backlog = Math.max(0, voice.revealAt - now)
    const step = backlog > REVEAL_MS - WORD_STEP_MS ? Math.max(12, (REVEAL_MS - backlog) / 4) : WORD_STEP_MS
    const slot = () => { const at = Math.max(now, voice!.revealAt); voice!.revealAt = at + step; return Math.round(at - now) }
    const animateIn = (w: HTMLElement, delay: number) => {
      w.classList.remove('new')
      w.style.setProperty('--d', `${delay}ms`)
      void w.offsetWidth
      w.classList.add('new')
    }
    let last = 0
    words.forEach((word, i) => {
      const w = shown[i]
      if (!w) {
        /* A new word: the space goes between words, never inside one, so a wrapped line starts flush. */
        if (i) layer.append(' ')
        const span = h('span', { class: 'w' }, word)
        layer.append(span)
        /* A word back in a place it had already reached (it took a word back, then said it again) just appears. */
        if (i >= voice!.reached) animateIn(span, last = slot())
      } else if (w.textContent !== word) {
        /* A word it heard better ("head" → "header", "feelss" → "feels") changes in place, quietly:
           only new words make an entrance, or the line would keep stirring. */
        w.textContent = word
      }
    })
    voice.reached = Math.max(voice.reached, words.length)
    /* Words it took back: away, with the space before each. */
    for (const w of shown.slice(words.length)) { const sp = w.previousSibling; if (sp?.nodeType === Node.TEXT_NODE && sp !== layer.firstChild) sp.remove(); w.remove() }
    layer.querySelectorAll<HTMLElement>('.w').forEach((w, i) => w.classList.toggle('settling', i >= done))
    /* The caret arrives with the last word let out, rather than jumping ahead of it. */
    const caret = h('span', { class: 'caret' })
    caret.style.setProperty('--d', `${last}ms`)
    layer.append(caret)
    layer.scrollTop = t.scrollTop = t.scrollHeight
  }

  const onVoice = (e: VoiceEvent) => {
    if (!voice || !parts) return
    switch (e.type) {
      case 'loading':
        /* A real download of the speech model (first use) is worth saying, with how far along it is.
           macOS reports 0% on every start even when the model is there; that's not one. */
        if (e.what === 'model' && e.progress) { slowly(); hint(`Getting the speech model · ${Math.round(e.progress * 100)}%`) }
        break
      case 'listening': {
        clearTimeout(voice.slow)
        clearTimeout(voice.slowWords)
        voice.state = 'listening'
        voiceState('listening')
        hint('Listening…')
        const mic = micOf()
        if (mic) play(mic, 'data-ping', 520)
        break
      }
      case 'level':
        voice.level = e.value
        break
      case 'text':
        showWords(e.final, e.partial)
        break
      case 'done': {
        const sendAfter = voice.sendAfter
        parts.note.value = (voice.base + wordsOf(e.text).join(' ')).trim().slice(0, NOTE_MAX)
        endVoice()
        sync()
        const t = parts.note
        t.focus({ preventScroll: true })
        t.setSelectionRange(t.value.length, t.value.length)
        if (sendAfter && t.value) void send()
        break
      }
      case 'error': {
        endVoice()
        sync()
        const mic = micOf()
        if (mic) play(mic, 'data-shake', 280)
        status(e.message, 'error')
        break
      }
    }
  }

  const startVoice = () => {
    if (!parts || voice || busy) return
    const typed = parts.note.value.replace(/\s+$/, '')
    setOpen(parts.statusWrap, false)
    voice = { session: listen(onVoice), base: typed ? `${typed} ` : '', state: 'loading', level: 0, shown: 0, raf: 0, sendAfter: false, timer: 0, slow: 0, slowWords: 0, revealAt: 0, reached: 0 }
    voice.slow = window.setTimeout(slowly, SLOW_MS)
    voice.slowWords = window.setTimeout(() => { if (voice?.state === 'loading' && parts?.note.placeholder === PLACEHOLDER) hint('Getting the mic ready…') }, SLOW_WORDS_MS)
    voiceState('loading')
    /* The layer shows what you'd typed from the first moment, so it never blinks out while the mic gets ready. */
    const layer = layerOf()
    if (layer) { clear(layer); layer.append(voice.base, h('span', { class: 'caret' })) }
    parts.note.focus({ preventScroll: true })
    animate()
  }

  /** Stop listening and keep the words; with Enter, send them too. Before it hears anything, it's just a cancel. */
  const stopVoice = (sendAfter: boolean) => {
    if (!voice) return
    if (voice.state === 'loading') { cancelVoice(); return }
    voice.sendAfter ||= sendAfter
    if (voice.state === 'finishing') return
    /* The bars fold back into the glyph at once; the last words settle a moment later. */
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
      /* Waiting for Claude to be asked, it's added to the page; with Auto-send notes to Claude on, it's gone to Claude. */
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
      /* maxlength stops typing and trims a paste at the limit; sync() says why. */
      const note = h('textarea', { class: 'note-input', rows: 1, placeholder: PLACEHOLDER, 'aria-label': 'Note for Claude', spellcheck: 'true', maxlength: NOTE_MAX })
      if (o.existing) note.value = o.existing.note
      else if (o.draft) note.value = o.draft
      const sendBtn = h('button', { type: 'button', class: 'send', 'data-action': 'send', 'aria-label': o.existing ? 'Save note' : prefs.get().send === 'ask' ? 'Add note' : 'Send to Claude', disabled: true }, svg(ICONS.enter, 13, 2.2))
      /* The pinned parts start closed and open on the next frame, so the card
         grows from what you were just hovering into the note. */
      /* Voice, where this Mac can do it: a mic beside send, holding its glyph and three level bars in one spot. */
      const mic = voiceReady()
        ? h('button', { type: 'button', class: 'mic', 'data-action': 'mic', 'aria-label': 'Speak your note', 'aria-pressed': 'false', 'data-tip': 'Speak your note' },
          h('span', { class: 'glyph' }, svg(ICONS.mic, 14, 1.9)), h('span', { class: 'bars', 'aria-hidden': 'true' }, ...BAR_GAIN.map(() => h('i', {}))))
        : null
      const field = h('div', { class: 'note-field' }, note, mic ? h('div', { class: 'voice-text', 'aria-hidden': 'true' }) : null)
      if (mic) warmVoice()
      const noteWrap = reveal('note-wrap', false, h('div', { class: 'note' }, field, mic, sendBtn))
      const statusEl = h('div', { class: 'status', role: 'status' })
      const statusWrap = reveal('status-wrap quick', false, statusEl)
      const actionsWrap = o.onDelete ? reveal('actions-wrap', false, h('div', { class: 'note-actions' }, h('button', { type: 'button', class: 'link', 'data-action': 'delete' }, svg(ICONS.trash, 12), 'Delete'))) : null
      micTip = h('div', { class: 'card-tip', role: 'tooltip' })
      micTipFor = null
      el.append(head, ...(cssWrap ? [cssWrap] : []), noteWrap, statusWrap, ...(actionsWrap ? [actionsWrap] : []), micTip)
      el.querySelectorAll<HTMLElement>('[data-tip]').forEach(tipOnHover)
      parts = { cssWrap, noteWrap, statusWrap, status: statusEl, note, send: sendBtn }
      full = false
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
      if (!desc) return
      for (const box of Array.from(el.querySelectorAll('.css'))) {
        const next = renderCss(desc)
        box.replaceWith(next)
        if (mode === 'pinned') next.querySelectorAll<HTMLElement>('[data-tip]').forEach(tipOnHover)
      }
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
      if (e.type === 'pointerover' || e.type === 'pointerout') {
        const mic = (e.composedPath() as Element[]).find(n => n instanceof HTMLElement && n.dataset.tip !== undefined && n !== el) as HTMLElement | undefined
        if (e.type === 'pointerover' && mic && micTipFor !== mic) { clearTimeout(micTipWait); micTipFor = mic; micTipWait = window.setTimeout(() => showMicTip(mic), 350) }
        /* Leaving the mic (to anywhere outside it) puts the tip away. */
        const to = (e as PointerEvent).relatedTarget
        if (e.type === 'pointerout' && mic && !(to instanceof Node && mic.contains(to))) showMicTip(null)
        return false
      }
      if (e.type === 'scroll' && e.composedPath()[0] === parts.note) { edges(); return true }
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
