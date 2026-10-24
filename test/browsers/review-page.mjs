/* The review page: every capture from review.spec.mjs in one file to look through and mark. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const NAMES = { shadcn: 'shadcn/ui', mui: 'MUI', antd: 'Ant Design', chakra: 'Chakra UI', mantine: 'Mantine', primer: 'Primer' }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function writeReviewPage(dir, rows, file) {
  const groups = Object.keys(NAMES).map(ds => {
    const list = rows.filter(r => r.ds === ds)
    if (!list.length) return ''
    return `<section><h2>${NAMES[ds]} <span class="count">${list.filter(r => r.text).length} words · ${list.filter(r => !r.text).length} element</span></h2><div class="grid">${list.map(r => {
      const img = readFileSync(join(dir, r.file)).toString('base64')
      const id = `${ds} · “${r.words}” in ${r.tag}${r.cls ? '.' + r.cls : ''} → ${r.text ? 'words' : 'element'}`
      return `<figure class="tile ${r.text ? 'words' : 'element'}" data-id="${esc(id)}"><img loading="lazy" alt="" src="data:image/jpeg;base64,${img}"><figcaption><b class="verdict">${r.text ? 'Words' : 'Element'}</b><span class="what">“${esc(r.words)}”</span><span class="tag">${esc(r.tag)}${r.cls ? '.' + esc(r.cls.slice(0, 28)) : ''} · ${Math.round(r.box.w)}×${Math.round(r.box.h)}</span></figcaption><button class="flag" type="button">Looks wrong</button></figure>`
    }).join('')}</div></section>`
  }).join('')
  writeFileSync(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Picking review</title>
<style>
:root { --bg:#fafafa; --fg:#18181b; --muted:#71717a; --card:#fff; --line:#e4e4e7; --words:#7c3aed; --el:#0f766e; --flag:#dc2626; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0b0b0d; --fg:#f4f4f5; --muted:#a1a1aa; --card:#18181b; --line:#27272a; --words:#a78bfa; --el:#2dd4bf; --flag:#f87171; } }
:root[data-theme="dark"] { --bg:#0b0b0d; --fg:#f4f4f5; --muted:#a1a1aa; --card:#18181b; --line:#27272a; --words:#a78bfa; --el:#2dd4bf; --flag:#f87171; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, sans-serif; }
header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
header h1 { font-size: 16px; margin: 0 12px 0 0; }
header p { margin: 0; color: var(--muted); flex-basis: 100%; max-width: 780px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button, .copy { font: inherit; border: 0; background: var(--card); color: var(--fg); padding: 6px 12px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
.copy { border: 1px solid var(--line); border-radius: 8px; margin-left: auto; }
main { padding: 8px 16px 48px; }
h2 { font-size: 15px; margin: 24px 0 10px; }
.count { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.tile { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.tile img { display: block; width: 100%; height: 150px; object-fit: contain; background: #fff; border-bottom: 1px solid var(--line); }
figcaption { padding: 8px 10px 4px; display: grid; gap: 2px; }
.verdict { font-size: 12px; }
.words .verdict { color: var(--words); } .element .verdict { color: var(--el); }
.what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { color: var(--muted); font: 12px ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flag { margin: 4px 10px 10px; align-self: flex-start; font: inherit; font-size: 12px; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 6px; padding: 3px 8px; cursor: pointer; }
.tile.flagged { border-color: var(--flag); box-shadow: 0 0 0 1px var(--flag); }
.tile.flagged .flag { color: var(--flag); border-color: var(--flag); }
body[data-show="words"] .tile.element, body[data-show="element"] .tile.words { display: none; }
body[data-show="flagged"] .tile:not(.flagged) { display: none; }
</style></head><body data-show="all">
<header><h1>Picking review</h1>
<div class="seg" role="group" aria-label="Show">${['all', 'words', 'element', 'flagged'].map(k => `<button type="button" data-show="${k}" aria-pressed="${k === 'all'}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
<button class="copy" type="button">Copy flagged (0)</button>
<p>Every piece of words on the same screen in six design systems, hovered with the real mouse in Chrome, as Inspeck outlines it. <b style="color:var(--words)">Words</b> means the hover picked just the text; <b style="color:var(--el)">Element</b> means the whole thing around it. Mark any that feel wrong, then copy the list into the chat.</p></header>
<main>${groups}</main>
<script>
const flagged = new Set()
let saved = []
try { saved = JSON.parse(localStorage.getItem('flags') || '[]') } catch {}
const copy = document.querySelector('.copy')
const sync = () => { copy.textContent = 'Copy flagged (' + flagged.size + ')'; try { localStorage.setItem('flags', JSON.stringify([...flagged])) } catch {} }
for (const t of document.querySelectorAll('.tile')) {
  if (saved.includes(t.dataset.id)) { flagged.add(t.dataset.id); t.classList.add('flagged') }
  t.querySelector('.flag').onclick = () => { t.classList.toggle('flagged') ? flagged.add(t.dataset.id) : flagged.delete(t.dataset.id); sync() }
}
sync()
for (const b of document.querySelectorAll('.seg button')) b.onclick = () => { document.body.dataset.show = b.dataset.show; for (const o of document.querySelectorAll('.seg button')) o.setAttribute('aria-pressed', String(o === b)) }
copy.onclick = async () => { const text = 'These picks look wrong:\\n' + [...flagged].map(f => '- ' + f).join('\\n'); try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(sync, 1200) } catch { prompt('Copy this:', text) } }
</script></body></html>`)
}
