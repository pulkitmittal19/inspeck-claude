/* The keys Inspeck answers to. Only one needs learning, I, which turns
 * Inspeck on and off; the rest are quicker ways to do what the pill and the
 * card already do, listed in Settings › Shortcuts. */
import { h } from './dom'

/** I, with no modifier. On a layout without Latin letters (Cyrillic, say), the key where I would be. */
export function isToggleKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return false
  return e.key === 'i' || e.key === 'I' || (e.key.length === 1 && !/^[a-z]$/i.test(e.key) && e.code === 'KeyI')
}

/** A key's name for matching a keycap to the key being pressed: "i", "shift", "enter", "space". */
export const keyName = (e: KeyboardEvent) => (e.key === ' ' ? 'space' : e.key.toLowerCase())

/** A key as a keycap; `k` is the keyName it lights up for. */
export const cap = (label: string, k: string) => h('kbd', { class: /^[A-Z]$/.test(label) ? 'cap letter' : 'cap', 'data-k': k }, label)

interface Row {
  label: string
  /** Keys pressed together, as [label, keyName]. */
  keys?: Array<[string, string]>
  /** Held down rather than pressed. */
  hold?: boolean
  /** Done with the pointer, not a key. */
  pointer?: string
}

/** One list, the key to remember first, then the quicker ways to look closer. */
export const SHORTCUTS: Row[] = [
  { label: 'Turn Inspeck on or off', keys: [['I', 'i']] },
  { label: 'Leave a note', pointer: 'Click' },
  { label: 'CSS on hover', keys: [['C', 'c']] },
  { label: 'Measure spacing', keys: [['⇧', 'shift']], hold: true },
  { label: 'Parent or child', keys: [['↑', 'arrowup'], ['↓', 'arrowdown']] },
  { label: 'Freeze the page', keys: [['F', 'f']] },
  { label: 'Open a menu', keys: [['Space', 'space']], hold: true },
]

/** One row of the list: what it does, and how. */
export function shortcutRow(r: Row): HTMLElement {
  const how = r.pointer
    ? [h('span', { class: 'sc-pointer' }, r.pointer)]
    : [...(r.hold ? [h('span', { class: 'sc-hold' }, 'hold')] : []), ...(r.keys ?? []).map(([label, k]) => cap(label, k))]
  return h('div', { class: 'sc-row' }, h('span', { class: 'sc-label' }, r.label), h('span', { class: 'sc-keys' }, ...how))
}
