/* A selector that finds this element again — after a reload, a hot update, a
 * re-render — and that Claude can search the code for.
 *
 * Preference: a stable id, a test id, then a short path of tag:nth-of-type
 * steps from the nearest ancestor that has one. Generated ids (radix-:r5:,
 * headlessui-menu-3, «r1») change on every render and are never used.
 */

const GENERATED_ID = /^[:«]|^(radix|headlessui|react-aria|mui|chakra|downshift)-|:r[0-9a-z]+:|\d{4,}/
const TEST_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa']

const esc = (s: string) => CSS.escape(s)

function unique(sel: string, el: Element): boolean {
  try {
    const found = document.querySelectorAll(sel)
    return found.length === 1 && found[0] === el
  } catch { return false }
}

function anchorOf(el: Element): string | null {
  if (el.id && !GENERATED_ID.test(el.id)) return `#${esc(el.id)}`
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
  const own = anchorOf(el)
  if (own && unique(own, el)) return own

  const path: string[] = []
  for (let cur: Element | null = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
    const a = cur === el ? null : anchorOf(cur)
    if (a && unique(a, cur)) {
      const sel = `${a} > ${path.join(' > ')}`
      if (unique(sel, el)) return sel
    }
    path.unshift(step(cur))
    const sel = path.join(' > ')
    if (path.length >= 3 && unique(sel, el)) return sel
  }
  return path.join(' > ')
}

/** A short fingerprint to check that a re-found element is still the same one. */
export function fingerprintOf(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return `${el.tagName.toLowerCase()}|${text}`
}
