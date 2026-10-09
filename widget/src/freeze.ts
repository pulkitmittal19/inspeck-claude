/* Freeze: hold the page still so a menu, a tooltip or a hover state stays put
 * while you inspect it and write a note.
 *
 * Menus close for three kinds of reasons, and each is handled (cheaply: freezing
 * a large app must not cost a frame, or the first keystrokes of a note are lost):
 *  - events: an outside click, focus leaving, the pointer leaving, Escape, a
 *    resize or a blur. While frozen the router keeps all of these from the app.
 *  - CSS :hover / :focus-within: no event to block, so we pin them. The
 *    elements in that state are marked, and every rule that styles them in
 *    that state is copied with the pseudo-class swapped for the mark. A clear
 *    sheet over the page then catches the real pointer, so nothing else on the
 *    page starts hovering.
 *  - motion: running animations are paused, except ones on a layer that is
 *    opening, which are finished, so you measure the menu as it ends up.
 *    That covers CSS animations and transitions, the Web Animations API,
 *    animated SVG and video, including any that start while frozen. Motion
 *    driven from JavaScript (Lottie, GSAP, canvas) waits for its next frame,
 *    which the page doesn't get until you release.
 *
 * Frozen with F, the page's network answers are held too (hold.ts), so a
 * loading state you caught stays a loading state.
 */

import { splitList } from './css/rules'
import { holdNetwork } from './hold'

const EMPTY = document.createDocumentFragment()

const PSEUDO: Array<[string, string]> = [
  [':hover', 'data-ix-hover'],
  [':focus-within', 'data-ix-focus-within'],
  [':focus-visible', 'data-ix-focus-visible'],
  [':focus', 'data-ix-focus'],
  [':active', 'data-ix-active'],
]


export interface Freeze {
  readonly active: boolean
  readonly manual: boolean
  freeze(manual: boolean): void
  unfreeze(manual: boolean): void
}

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try { return sheet.cssRules } catch { return null }
}

/** Copy the rules that style a pinned pseudo-state, keyed on our marks instead —
    only those that apply right now, so the copy stays small and the browser
    doesn't restyle the whole page (a big app has thousands of :hover rules).

    A rule can style the hovered element itself (`.row:hover`) or something
    near it (`.row:hover .actions`, the buttons that show on hover). So each
    selector is checked in two steps: its hovered part must match an element
    that is hovered now (cheap, and rules out nearly all of them); only then
    is the whole selector looked for in the page. */
function pinnedRules(marked: Element[]): string {
  const out: string[] = []
  const matchesMarked = (sel: string) => marked.some(el => { try { return el.matches(sel) } catch { return false } })
  const one = (sel: string) => {
    let cut = -1
    for (const [, attr] of PSEUDO) {
      const i = sel.indexOf(`[${attr}]`)
      if (i >= 0 && (cut < 0 || i < cut)) cut = i + attr.length + 2
    }
    if (cut < 0) return false
    const head = sel.slice(0, cut)
    let headOk = true
    /* An empty fragment only parses the selector: a cut inside :is() or :not() throws, and the whole is checked instead. */
    try { EMPTY.querySelector(head); headOk = matchesMarked(head) } catch { /* not a selector on its own */ }
    if (!headOk) return false
    if (head.length === sel.length || matchesMarked(sel)) return true
    try { return !!document.querySelector(sel) } catch { return false }
  }
  const applies = (sel: string) => splitList(sel).some(one)
  const walk = (list: CSSRuleList, wrap: (css: string) => string) => {
    for (const r of Array.from(list)) {
      if (r instanceof CSSStyleRule) {
        if (PSEUDO.some(([p]) => r.selectorText.includes(p))) {
          let sel = r.selectorText
          for (const [p, attr] of PSEUDO) sel = sel.split(p).join(`[${attr}]`)
          if (applies(sel)) out.push(wrap(`${sel} { ${r.style.cssText} }`))
        }
      } else if (r instanceof CSSMediaRule) {
        const text = r.media.mediaText
        walk(r.cssRules, css => wrap(`@media ${text} { ${css} }`))
      } else if (r instanceof CSSSupportsRule) {
        const text = r.conditionText
        walk(r.cssRules, css => wrap(`@supports ${text} { ${css} }`))
      } else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) {
        /* @layer and friends: the copy goes unlayered, which only makes it stronger. */
        walk((r as CSSGroupingRule).cssRules, wrap)
      }
    }
  }
  for (const s of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) {
    const list = rulesOf(s)
    if (list) walk(list, css => css)
  }
  return out.join('\n')
}

/** How often, while frozen, to look for motion that started since. */
const SWEEP_MS = 200

/** SVG's own animation elements; their outermost <svg> pauses them all. */
const SMIL = 'animate, animateTransform, animateMotion, set'

const opening = (el: Element | null) => !!el?.closest('[data-state="open"], [open], [data-open], [data-headlessui-state~="open"]')

export function createFreeze(host: HTMLElement, onChange: (active: boolean, manual: boolean) => void): Freeze {
  let active = false
  let manual = false
  let sheet: CSSStyleSheet | null = null
  let paused: Animation[] = []
  let svgs: SVGSVGElement[] = []
  let sweeper = 0
  const marked: Array<[Element, string]> = []

  /** Inside Inspeck: the host, or anything in its shadow root. */
  const ours = (n: Node | null): boolean => {
    if (!n) return false
    if (n === host || host.contains(n)) return true
    const root = n.getRootNode()
    return root instanceof ShadowRoot && ours(root.host)
  }

  /* JavaScript-driven motion: while frozen the page's frame requests are kept,
     not run; on release each gets its frame. (Inspeck's own use native.ts.) */
  let frames: { request: typeof requestAnimationFrame; cancel: typeof cancelAnimationFrame } | null = null
  const waitingFrames = new Map<number, FrameRequestCallback>()
  let nextId = 1e9
  const holdFrames = () => {
    frames = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame }
    const { cancel } = frames
    window.requestAnimationFrame = cb => { const id = nextId++; waitingFrames.set(id, cb); return id }
    window.cancelAnimationFrame = id => { if (!waitingFrames.delete(id)) cancel.call(window, id) }
  }
  const releaseFrames = () => {
    if (!frames) return
    const { request } = frames
    window.requestAnimationFrame = frames.request
    window.cancelAnimationFrame = frames.cancel
    frames = null
    for (const cb of waitingFrames.values()) request.call(window, cb)
    waitingFrames.clear()
  }

  /* Stop what's moving: CSS animations and transitions are Animation objects too.
     Finish what is opening, pause everything else. */
  const sweep = () => {
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue
      const target = (a.effect as KeyframeEffect | null)?.target ?? null
      if (ours(target)) continue
      try {
        if (opening(target)) a.finish()
        else { a.pause(); paused.push(a) }
      } catch { /* infinite animations can't finish; pause instead */ try { a.pause(); paused.push(a) } catch { /* ignore */ } }
    }
    for (const el of Array.from(document.querySelectorAll(SMIL))) {
      let svg = el.closest('svg')
      for (let up = svg?.parentElement?.closest('svg'); up; up = up.parentElement?.closest('svg')) svg = up
      if (svg && !svg.animationsPaused()) { svg.pauseAnimations(); svgs.push(svg) }
    }
    for (const v of Array.from(document.querySelectorAll('video'))) if (!v.paused) { v.pause(); v.dataset.ixPaused = '1' }
  }
  /* Motion that starts while frozen: a transition or animation tells us; the Web Animations API and SVG don't, so look again now and then. */
  let swept = false
  const sweepSoon = () => { if (!swept) { swept = true; queueMicrotask(() => { swept = false; if (active) sweep() }) } }

  const start = () => {
    /* 1. Mark what is hovered / focused right now. */
    for (const [p, attr] of PSEUDO) {
      for (const el of Array.from(document.querySelectorAll(p))) {
        if (el === host || host.contains(el)) continue
        el.setAttribute(attr, '')
        marked.push([el, attr])
      }
    }
    /* 2. Pin those states with one small sheet of our own. */
    const css = marked.length ? pinnedRules(marked.map(([el]) => el)) : ''
    if (css) {
      sheet = new CSSStyleSheet()
      try {
        sheet.replaceSync(css)
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      } catch { sheet = null }
    }
    /* 3. Stop motion, now and as it starts. */
    sweep()
    holdFrames()
    document.addEventListener('animationstart', sweepSoon, true)
    document.addEventListener('transitionrun', sweepSoon, true)
    sweeper = window.setInterval(sweep, SWEEP_MS)
  }

  const stop = () => {
    window.clearInterval(sweeper)
    document.removeEventListener('animationstart', sweepSoon, true)
    document.removeEventListener('transitionrun', sweepSoon, true)
    for (const [el, attr] of marked) el.removeAttribute(attr)
    marked.length = 0
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet)
    sheet = null
    for (const a of paused) { try { a.play() } catch { /* gone */ } }
    paused = []
    for (const svg of svgs) { try { svg.unpauseAnimations() } catch { /* gone */ } }
    svgs = []
    releaseFrames()
    for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-ix-paused]'))) { delete v.dataset.ixPaused; void v.play().catch(() => {}) }
  }

  return {
    get active() { return active },
    get manual() { return manual },
    freeze(byHand) {
      if (byHand) manual = true
      if (!active) { active = true; start() }
      holdNetwork(active && manual)
      onChange(active, manual)
    },
    unfreeze(byHand) {
      if (byHand) manual = false
      /* A freeze you asked for outlives the note that also froze the page. */
      if (manual) { onChange(active, manual); return }
      if (active) { active = false; stop() }
      holdNetwork(false)
      onChange(active, manual)
    },
  }
}

/** Page events kept from the app while frozen: everything that closes menus or moves things. */
export const FROZEN_BLOCK = new Set([
  'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove',
  'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove',
  'focusin', 'focusout', 'focus', 'blur', 'visibilitychange', 'resize',
  'keydown', 'keyup', 'keypress', 'wheel', 'scroll',
])
