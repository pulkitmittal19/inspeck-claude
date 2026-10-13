/* A page opened straight from a file (file://, a double-click) can't use Inspeck: every website can make a
 * page with the same "no address" origin, so the plugin never answers one, or notes could be read by any
 * site. Rather than stay silent, a small note in the corner says how to open it so Inspeck works. */
import { h } from './dom'

export function fileNotice(): void {
  const show = () => {
    const host = h('div', {})
    const root = host.attachShadow({ mode: 'closed' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
      :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }
      .n { max-width: 300px; padding: 12px 14px; border-radius: 12px; background: #18181B; color: #F4F4F5;
        font: 500 12px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; box-shadow: 0 12px 32px rgba(0,0,0,.32), 0 0 0 1px rgba(255,61,138,.45); }
      b { font-weight: 600; color: #fff; } code { font: 500 11.5px ui-monospace, "SF Mono", Menlo, monospace; color: #FF8AB8; }
      button { all: unset; float: right; margin: -4px -6px 0 8px; padding: 2px 6px; cursor: pointer; color: rgba(244,244,245,.55); font-size: 14px; }
      button:hover { color: #fff; }`)
    root.adoptedStyleSheets = [sheet]
    const close = h('button', { type: 'button', 'aria-label': 'Close' }, '×')
    close.addEventListener('click', () => host.remove())
    root.append(h('div', { class: 'n', role: 'status' }, close,
      h('b', {}, 'Inspeck needs this page on a local address.'), ' Pages opened from a file can\u2019t talk to it. In this folder, run ',
      h('code', {}, 'npx serve'), ' and open the address it prints, or ask Claude to open it.'))
    document.documentElement.appendChild(host)
  }
  if (document.body) show()
  else document.addEventListener('DOMContentLoaded', show, { once: true })
}
