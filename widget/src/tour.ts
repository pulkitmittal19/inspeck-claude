/* The first-run tour: four short cards above the pill, the first time Inspeck
 * opens on this machine. A title, one line, the shortcut as a chip; Next,
 * Skip, Back, Got it. Seen is remembered twice: in this page's storage (no
 * round trip next time) and by the plugin (so a second app on another port
 * doesn't show it again).
 */
import { enter, leave } from './anim'
import { api } from './api'
import { clear, h } from './dom'
import { actionOf } from './router'

const SEEN_KEY = 'inspeck:tour-seen'

const k = (text: string) => h('span', { class: 'tour-k' }, text)

const STEPS: Array<{ title: string; line: Array<string | HTMLElement> }> = [
  { title: 'Inspect', line: ['Hover to outline anything. Hold ', k('Shift'), ' to measure.'] },
  { title: 'Note', line: ['Click to leave a note. Drag to cover a section.'] },
  { title: 'CSS', line: ['Press ', k('C'), ' to show CSS as you hover.'] },
  { title: 'Send to Claude', line: ['Notes wait until you press ', k('↑'), ' in the pill. ', k('⌥ I'), ' opens or closes Inspeck.'] },
]

export interface Tour {
  /** Show it, unless it's been seen. */
  start(): void
  /** Put it away for now (Inspeck closed): it shows again next time. */
  hide(): void
  /** Clicks on the tour's buttons. Returns true if handled. */
  handle(e: Event): boolean
}

export function createTour(ui: HTMLElement): Tour {
  const el = h('div', { class: 'tour', role: 'dialog', 'aria-label': 'Inspeck: getting started', hidden: true })
  ui.appendChild(el)
  let step = 0
  let checking = false

  const seenHere = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false } }
  const rememberHere = () => { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private window */ } }

  function render() {
    const s = STEPS[step]
    const last = step === STEPS.length - 1
    clear(el)
    el.append(
      h('div', { class: 'tour-top' },
        h('div', { class: 'tour-dots', 'aria-label': `Step ${step + 1} of ${STEPS.length}` },
          ...STEPS.map((_, i) => h('span', { class: i === step ? 'tour-dot on' : 'tour-dot' }))),
        h('button', { type: 'button', class: 'tour-link', 'data-action': last ? 'tour-back' : 'tour-skip' }, last ? 'Back' : 'Skip')),
      h('div', { class: 'tour-body' },
        h('p', { class: 'tour-title' }, s.title),
        h('p', { class: 'tour-line' }, ...s.line.map(p => typeof p === 'string' ? p : p.cloneNode(true)))),
      h('div', { class: 'tour-foot' },
        h('button', { type: 'button', class: 'tour-next', 'data-action': last ? 'tour-done' : 'tour-next' }, last ? 'Got it' : 'Next')),
    )
  }

  function finish() {
    rememberHere()
    void api.markTourSeen().catch(() => {})
    leave(el, 160)
  }

  return {
    start() {
      if (!el.hidden || checking || seenHere()) return
      checking = true
      const show = () => { step = 0; render(); enter(el) }
      api.tourSeen().then(seen => {
        checking = false
        if (seen) rememberHere()
        else show()
      }, () => {
        /* An older plugin that doesn't keep the machine-wide record: go by this page's alone. */
        checking = false
        show()
      })
    },
    hide() {
      if (!el.hidden) leave(el, 120)
    },
    handle(e) {
      if (el.hidden || !e.composedPath().includes(el)) return false
      if (e.type !== 'click') return true
      switch (actionOf(e)?.action) {
        case 'tour-next': step = Math.min(step + 1, STEPS.length - 1); render(); break
        case 'tour-back': step = Math.max(step - 1, 0); render(); break
        case 'tour-skip':
        case 'tour-done': finish(); break
      }
      return true
    },
  }
}
