/* An app on https://localhost (a dev server with a certificate of its own), with Inspeck added two ways:
 *  - a tag that loads it from http://127.0.0.1 (Next.js, Nuxt, plain HTML: what `init` adds there);
 *  - through the dev server's own address, /__inspeck/ (what the Vite plugin does).
 * An https page reaching http may be blocked as "mixed content", differently in each browser: this says which. */
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PORT } from './playwright.config.mjs'

const HTTPS_PORT = 4871
let server

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-https-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' })
  const page = tag => `<!doctype html><html><head><meta charset="utf-8"></head><body><h1 id="title" style="margin:80px">Secure app</h1>${tag}</body></html>`
  server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    if (req.url === '/tag.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(page(`<script src="http://127.0.0.1:${PORT}/inspeck.js" async></script>`))
    if (req.url === '/proxy.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(page('<script src="/__inspeck/inspeck.js" async></script>'))
    if (req.url.startsWith('/__inspeck/')) {
      /* As the Vite plugin forwards it: same path, the page's own address as Origin. */
      const headers = { ...req.headers, host: `127.0.0.1:${PORT}`, origin: req.headers.origin ?? `https://${req.headers.host}` }
      const up = request({ host: '127.0.0.1', port: PORT, path: req.url.slice('/__inspeck'.length), method: req.method, headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
      req.pipe(up)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise(r => server.listen(HTTPS_PORT, '127.0.0.1', r))
})
test.afterAll(() => server?.close())

for (const [how, path] of [['a tag loading it from http://127.0.0.1', 'tag.html'], ['through the dev server’s own address (/__inspeck/)', 'proxy.html']]) {
  test(`https page, Inspeck added with ${how}`, async ({ page }, info) => {
    /* Safari blocks http://127.0.0.1 on an https page (Chrome and Firefox treat it as secure): a known limit, in the README. */
    test.fail(info.project.name === 'webkit' && path === 'tag.html', 'Safari blocks the http tag on https pages')
    await page.goto(`https://localhost:${HTTPS_PORT}/${path}`)
    const started = await page.waitForFunction(() => !!window.__INSPECK__?.app, null, { timeout: 8000 }).then(() => true, () => false)
    expect(started, 'Inspeck starts').toBe(true)
    await page.evaluate(() => window.__INSPECK__.app.setOpen(true))
    const p = await page.evaluate(() => { const b = document.getElementById('title').getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 } })
    await page.mouse.move(p.x, p.y, { steps: 2 })
    await page.mouse.click(p.x, p.y)
    await page.keyboard.type('secure note', { delay: 10 })
    await page.keyboard.press('Enter')
    await expect.poll(async () => page.evaluate(() => {
      const host = document.querySelector('inspeck-root')
      return host?.shadowRoot.querySelector('.card')?.innerText ?? ''
    }), { timeout: 8000, message: 'the note is added' }).toMatch(/Added|Sent to Claude/)
  })
}
