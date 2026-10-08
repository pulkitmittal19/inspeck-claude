/* Freeze: hold the page still so a menu, a tooltip or a hover state stays put
 * while you inspect it and write a note.
 *
 * Menus close for three kinds of reasons, and each is handled:
 *  - events: an outside click, focus leaving, the pointer leaving, Escape, a
 *    resize or a blur. While frozen the router keeps all of these from the app.
 *  - CSS :hover / :focus-within: no event to block, so we pin them. The
 *    elements in that state are marked, and every rule that styles them in
 *    that state is copied with the pseudo-class swapped for the mark. A clear
 *    sheet over the page then catches the real pointer, so nothing else on the
 *    page starts hovering.
 *  - motion: running animations are paused, except ones on a layer that is
 *    opening, which are finished, so you measure the menu as it ends up.
 */

const PSEUDO: Array<[string, string]> = [
  [':hover', 'data-ix-hover'],
  [':focus-within', 'data-ix-focus-within'],
  [':focus-visible', 'data-ix-focus-visible'],
  [':focus', 'data-ix-focus'],
  [':active', 'data-ix-active'],
]

const MOTION = `*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }`

export interface Freeze {
  readonly active: boolean
  readonly manual: boolean
  freeze(manual: boolean): void
  unfreeze(manual: boolean): void
}

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try { return sheet.cssRules } catch { return null }
}

/** Copy every rule that styles a pinned pseudo-state, keyed on our marks instead. */
function pinnedRules(): string {
  const out: string[] = []
  const walk = (list: CSSRuleList, wrap: (css: string) => string) => {
    for (const r of Array.from(list)) {
      if (r instanceof CSSStyleRule) {
        if (PSEUDO.some(([p]) => r.selectorText.includes(p))) {
          let sel = r.selectorText
          for (const [p, attr] of PSEUDO) sel = sel.split(p).join(`[${attr}]`)
          out.push(wrap(`${sel} { ${r.style.cssText} }`))
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

const opening = (el: Element | null) => !!el?.closest('[data-state="open"], [open], [data-open], [data-headlessui-state~="open"]')

export function createFreeze(host: HTMLElement, onChange: (active: boolean, manual: boolean) => void): Freeze {
  let active = false
  let manual = false
  let sheet: CSSStyleSheet | null = null
  let paused: Animation[] = []
  const marked: Array<[Element, string]> = []

  const start = () => {
    /* 1. Mark what is hovered / focused right now. */
    for (const [p, attr] of PSEUDO) {
      for (const el of Array.from(document.querySelectorAll(p))) {
        if (el === host || host.contains(el)) continue
        el.setAttribute(attr, '')
        marked.push([el, attr])
      }
    }
    /* 2. Pin those states and stop motion with one sheet of our own. */
    sheet = new CSSStyleSheet()
    try { sheet.replaceSync(`${pinnedRules()}\n${MOTION}`) } catch { sheet.replaceSync(MOTION) }
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    /* 3. Finish what is opening, pause everything else. */
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue
      const target = (a.effect as KeyframeEffect | null)?.target ?? null
      if (target && (target === host || host.contains(target))) continue
      try {
        if (opening(target)) a.finish()
        else { a.pause(); paused.push(a) }
      } catch { /* infinite animations can't finish; pause instead */ try { a.pause(); paused.push(a) } catch { /* ignore */ } }
    }
    for (const v of Array.from(document.querySelectorAll('video'))) if (!v.paused) { v.pause(); v.dataset.ixPaused = '1' }
  }

  const stop = () => {
    for (const [el, attr] of marked) el.removeAttribute(attr)
    marked.length = 0
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet)
    sheet = null
    for (const a of paused) { try { a.play() } catch { /* gone */ } }
    paused = []
    for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-ix-paused]'))) { delete v.dataset.ixPaused; void v.play().catch(() => {}) }
  }

  return {
    get active() { return active },
    get manual() { return manual },
    freeze(byHand) {
      if (byHand) manual = true
      if (!active) { active = true; start() }
      onChange(active, manual)
    },
    unfreeze(byHand) {
      if (byHand) manual = false
      /* A freeze you asked for outlives the note that also froze the page. */
      if (manual) { onChange(active, manual); return }
      if (active) { active = false; stop() }
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
