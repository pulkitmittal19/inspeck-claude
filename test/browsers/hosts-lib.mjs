/* For hosts.spec.mjs: a world of its own per test, with Inspeck's server on its own port and notes folder, apps on
 * other localhosts (each served from its own project folder, as a dev server is, so Inspeck can tell their
 * projects apart), and stand-in Claude chats connected to the plugin the way Claude connects. */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PORT = 4880

const PAGE = (name, tag) => `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>
<style>body{font:14px system-ui;margin:40px}button{padding:8px 14px}.card{border:1px solid #ddd;border-radius:10px;padding:14px;width:320px;margin:14px 0}</style></head><body>
<h1 id="title">${name} home</h1><p id="intro">Welcome to ${name}.</p>
<div class="card"><h2 id="card-title">${name} plan</h2><p id="card-price">$24 a month</p><button id="buy">Buy ${name}</button></div>
${tag ? `<script src="http://127.0.0.1:${PORT}/inspeck.js"></script>` : ''}</body></html>`

export function world() {
  const base = mkdtempSync(join(tmpdir(), 'inspeck-hosts-'))
  const home = join(base, 'home')
  const kids = []
  const chats = []
  return {
    /** An app on its own localhost port, from its own project folder; `tag: false` doesn't load Inspeck itself. */
    app(name, port, { tag = true } = {}) {
      const dir = join(base, name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.html'), PAGE(name, tag))
      writeFileSync(join(dir, 'second.html'), PAGE(`${name} second`, tag))
      kids.push(spawn(process.execPath, ['-e', `require('http').createServer((q,r)=>{const f=q.url==='/'?'index.html':q.url.slice(1).split('?')[0];try{const b=require('fs').readFileSync(f);r.writeHead(200,{'content-type':'text/html'});r.end(b)}catch{r.writeHead(404).end()}}).listen(${port},'127.0.0.1')`], { cwd: dir, stdio: 'ignore' }))
      return { dir, port, url: `http://localhost:${port}` }
    },
    /** A Claude chat opened in a folder: a live stand-in for the `claude` process, and the plugin's server as Claude starts it. */
    async chat(name, cwd) {
      const stand = spawn('sleep', ['900'], { stdio: 'ignore' })
      kids.push(stand)
      const dir = mkdtempSync(join(base, `chat-${name}-`))
      copyFileSync(join(ROOT, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
      mkdirSync(join(dir, 'widget'))
      copyFileSync(join(ROOT, 'server/dist/widget/inspeck.js'), join(dir, 'widget/inspeck.js'))
      const env = { ...process.env, INSPECK_HOME: home, INSPECK_PORT: String(PORT), INSPECK_SESSION_PID: String(stand.pid), INSPECK_LATEST_URL: 'off', INSPECK_AUTO_UPDATE: 'off', CLAUDE_PLUGIN_ROOT: '' }
      const client = new Client({ name: `claude-${name}`, version: '0' })
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dir, 'inspeck.mjs')], cwd, env, stderr: 'ignore' }))
      const c = {
        dir, env, cwd,
        tool: async (n, a = {}) => (await client.callTool({ name: n, arguments: a })).content.filter(x => x.type === 'text').map(x => x.text).join('\n'),
        /** The line Claude runs in a browser tab to link it to this chat. */
        bindTab: async page => page.evaluate((await c.tool('bind')).split('\n').find(l => l.startsWith('(async'))),
        close: async () => { await client.close().catch(() => {}); stand.kill() },
      }
      chats.push(c)
      return c
    },
    /** Inspeck's server answers. */
    async up() {
      for (let i = 0; i < 100; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/health`); return true } catch { await new Promise(r => setTimeout(r, 100)) }
      }
      return false
    },
    async cleanup() {
      for (const c of chats) await c.close()
      for (const k of kids) { try { k.kill() } catch { /* gone */ } }
      rmSync(base, { recursive: true, force: true })
    },
  }
}

/** A call to Inspeck from inside a page, as the widget makes it. */
export const api = (page, method, path, body) => page.evaluate(async ([method, path, body, port]) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'x-inspeck': '1', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [method, path, body, PORT])

/** The widget's own note shape, for placing notes through the API (many at once, say). */
export const noteBody = (page, text, sel = '#title') => page.evaluate(([text, sel]) => ({ note: text, page: location.href, element: { selector: sel, tag: document.querySelector(sel).tagName.toLowerCase(), text: document.querySelector(sel).textContent.trim() }, held: true, tabId: window.__INSPECK__.tab }), [text, sel])

export const ready = page => page.waitForFunction(() => !!window.__INSPECK__?.app, null, { timeout: 15_000 })

/** Place a note with the real mouse and keyboard. */
export async function note(page, sel, text) {
  await page.evaluate(() => window.__INSPECK__.app.open || window.__INSPECK__.app.setOpen(true))
  await page.waitForTimeout(450)
  const p = await page.evaluate(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + Math.min(10, r.width / 2), y: r.top + r.height / 2 } }, sel)
  await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.waitForTimeout(150)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(400)
  await page.keyboard.type(text, { delay: 5 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

/** The numbers on a page's markers. */
export const markers = page => page.evaluate(() => [...(document.querySelector('inspeck-root')?.shadowRoot.querySelectorAll('.marker:not([data-gone])') ?? [])].map(m => m.textContent).sort())

/** Click the marker numbered n, then Delete on its card: each once it has grown into place and stays put. */
export async function deleteNote(page, n) {
  const settled = async sel => {
    for (let i = 0, last = ''; i < 40; i++) {
      const at = await page.evaluate(([sel, n]) => {
        const root = document.querySelector('inspeck-root').shadowRoot
        const e = sel ? root.querySelector(sel) : [...root.querySelectorAll('.marker:not([data-gone])')].find(m => m.textContent === String(n))
        const r = e?.getBoundingClientRect()
        return r && r.width > 4 && r.height > 4 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
      }, [sel, n])
      if (at && JSON.stringify(at) === last) return at
      last = JSON.stringify(at)
      await page.waitForTimeout(100)
    }
    throw new Error(`${sel ?? `marker ${n}`} never settled`)
  }
  const m = await settled(null)
  await page.mouse.click(m.x, m.y)
  const d = await settled('.card [data-action="delete"]')
  await page.mouse.click(d.x, d.y)
  await page.waitForTimeout(800)
}
