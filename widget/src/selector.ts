/* A selector that finds this element again — after a reload, a hot update, a
 * re-render — and that Claude can search the code for.
 *
 * Preference: a stable id, a test id, then a short path of tag:nth-of-type
 * steps from the nearest ancestor that has one. Generated ids (radix-:r5:,
 * headlessui-menu-3, «r1», mantine-clmm1iw91) change on every render and are never used.
 */

const GENERATED_ID = /^[:«]|^(radix|headlessui|react-aria|mui|chakra|downshift|mantine)-|:r[0-9a-z]+:|\d{4,}/
/* Any library's random part (mantine-clmm1iw91, input-x7f3k2): a run of six or more letters and digits with at
   least two digits in it. Skipping a real id costs nothing (a path is used instead); keeping a random one breaks
   the address on the next load. */
const RANDOM_PART = /(?:^|[-_])(?=[a-z0-9]{6,}(?:$|[-_]))(?=(?:[a-z]*\d){2})(?=[0-9]*[a-z])[a-z0-9]+/i
export const isGeneratedId = (id: string) => GENERATED_ID.test(id) || RANDOM_PART.test(id)
const TEST_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa']

import { SHADOW_STEP } from './dom'

const esc = (s: string) => CSS.escape(s)

function unique(sel: string, el: Element, scope: Document | ShadowRoot = document): boolean {
  try {
    const found = scope.querySelectorAll(sel)
    return found.length === 1 && found[0] === el
  } catch { return false }
}

function anchorOf(el: Element): string | null {
  if (el.id && !isGeneratedId(el.id)) return `#${esc(el.id)}`
  for (const a of TEST_ATTRS) {
    const v = el.getAttribute(a)
    if (v) return `[${a}="${v.replace(/"/g, '\\"')}"]`
  }
  return null
}

function step(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement
  if (!parent) return tag
  const same = Array.from(parent.children).filter(c => c.tagName === el.tagName)
  return same.length === 1 ? tag : `${tag}:nth-of-type(${same.indexOf(el) + 1})`
}

export function selectorFor(el: Element): string {
  /* Inside a web component: the component's selector, then this one within its shadow root. */
  const root = el.getRootNode()
  if (root instanceof ShadowRoot) return `${selectorFor(root.host)}${SHADOW_STEP}${selectorWithin(el, root)}`
  return selectorWithin(el, document)
}

/** A selector unique within one document or shadow root. */
function selectorWithin(el: Element, scope: Document | ShadowRoot): string {
  const own = anchorOf(el)
  if (own && unique(own, el, scope)) return own

  const path: string[] = []
  for (let cur: Element | null = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
    const a = cur === el ? null : anchorOf(cur)
    if (a && unique(a, cur, scope)) {
      const sel = `${a} > ${path.join(' > ')}`
      if (unique(sel, el, scope)) return sel
    }
    path.unshift(step(cur))
    const sel = path.join(' > ')
    if (path.length >= 3 && unique(sel, el, scope)) return sel
  }
  /* Short of three steps at the top of a shadow root, the path can still be unique there. */
  return path.join(' > ')
}
