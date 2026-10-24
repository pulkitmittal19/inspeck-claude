/* `npx inspeck init`: the edits it makes to an app, and full runs in throwaway
 * projects with a stand-in `claude` command that records what it was asked. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'inspeck')
const BIN = join(pkg, 'dist/bin.js')
const { wireVite, wireNext, wireHtml, wireAstro, wireNuxt, cspFileIn, wireStorybookHead, withAutoUpdate, wireDocusaurus } = await import(pathToFileURL(join(pkg, 'dist/cli.js')).href)
const vitePlugin = await import(pathToFileURL(join(pkg, 'dist/vite.js')).href)

test('Vite: inspeck() goes first in the plugins list, the import after the others; twice changes nothing', () => {
  const src = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`
  const { src: out, result } = wireVite(src, 'vite.config.ts')
  assert.equal(result, 'added')
  assert.match(out, /import react from '@vitejs\/plugin-react'\nimport inspeck from 'inspeck\/vite'\n/)
  assert.match(out, /plugins: \[inspeck\(\), react\(\)\]/)
  assert.equal(wireVite(out, 'vite.config.ts').result, 'present')
})

test('Vite: an empty list, a CommonJS config, a hand-written tag, and no list at all', () => {
  assert.match(wireVite(`export default { plugins: [] }`, 'vite.config.js').src, /plugins: \[inspeck\(\)\]/)
  const cjs = wireVite(`module.exports = { plugins: [] }`, 'vite.config.cjs').src
  assert.match(cjs, /^const inspeck = require\('inspeck\/vite'\)\.default\n/)
  assert.equal(wireVite(`const tag = 'http://127.0.0.1:4848/inspeck.js'\nexport default { plugins: [x] }`, 'vite.config.ts').result, 'present')
  assert.equal(wireVite(`export default defineConfig({ server: { port: 3000 } })`, 'vite.config.ts').result, 'manual')
})

test('Vite: only the config\'s own plugins list, never a worker\'s or Rollup\'s; when unsure it\'s left to do by hand', () => {
  const worker = `export default defineConfig({\n  worker: { plugins: [wasm()] },\n  // plugins: [old()]\n  plugins: [react()],\n})\n`
  assert.match(wireVite(worker, 'vite.config.ts').src, /worker: \{ plugins: \[wasm\(\)\] \},\n  \/\/ plugins: \[old\(\)\]\n  plugins: \[inspeck\(\), react\(\)\]/)
  const onlyRollup = `export default defineConfig({\n  build: { rollupOptions: { plugins: [visualizer()] } },\n})\n`
  assert.equal(wireVite(onlyRollup, 'vite.config.ts').result, 'manual', 'no plugins list of its own')
  const fn = `export default defineConfig(({ mode }) => ({\n  plugins: [vue()],\n}))\n`
  assert.match(wireVite(fn, 'vite.config.ts').src, /plugins: \[inspeck\(\), vue\(\)\]/, 'a config written as a function')
  assert.equal(wireVite(`const plugins = [react()]\nexport default defineConfig({ plugins })`, 'vite.config.ts').result, 'manual')
})

test('Next.js: a development-only tag before </body>, indented to match', () => {
  const layout = `export default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}\n      </body>\n    </html>\n  )\n}\n`
  const { src, result } = wireNext(layout)
  assert.equal(result, 'added')
  assert.match(src, /\n {8}\{process\.env\.NODE_ENV === 'development' && <script src="http:\/\/127\.0\.0\.1:4848\/inspeck\.js" async \/>\}\n {6}<\/body>/)
  assert.equal(wireNext(src).result, 'present')
})

test('Next.js: create-next-app\'s one-line <body>{children}</body> gets the tag just before </body>', () => {
  const layout = `      <body className="min-h-full flex flex-col">{children}</body>\n`
  const { src, result } = wireNext(layout)
  assert.equal(result, 'added')
  assert.equal(src, `      <body className="min-h-full flex flex-col">{children}{process.env.NODE_ENV === 'development' && <script src="http://127.0.0.1:4848/inspeck.js" async />}</body>\n`)
})

test('HTML: the tag before </body>', () => {
  const { src, result } = wireHtml(`<html>\n  <body>\n    <h1>Hi</h1>\n  </body>\n</html>\n`)
  assert.equal(result, 'added')
  assert.match(src, /\n {4}<script>\/\* Inspeck: loads on this computer only, never on the live site \*\/ if \(.*location\.hostname\)\) .*src: 'http:\/\/127\.0\.0\.1:4848\/inspeck\.js'.*<\/script>\n {2}<\/body>/)
})

test('auto-update: added to empty or existing settings, kept once on, and a local-folder marketplace left alone', () => {
  const fresh = withAutoUpdate(null)
  assert.equal(fresh.result, 'added')
  assert.deepEqual(JSON.parse(fresh.src).extraKnownMarketplaces.inspeck, { source: { source: 'github', repo: 'pulkitmittal19/inspeck-claude' }, autoUpdate: true })
  const mixed = withAutoUpdate(JSON.stringify({ model: 'opus', extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'a/b' } } } }))
  const out = JSON.parse(mixed.src)
  assert.equal(out.model, 'opus', 'the rest of the settings are kept')
  assert.ok(out.extraKnownMarketplaces.other && out.extraKnownMarketplaces.inspeck.autoUpdate)
  assert.equal(withAutoUpdate(fresh.src).result, 'present')
  assert.equal(withAutoUpdate(JSON.stringify({ extraKnownMarketplaces: { inspeck: { source: { source: 'directory', path: '/x' } } } })).result, 'other')
  assert.equal(withAutoUpdate('{ not json').result, 'manual')
})

/* ---------- full runs ---------- */

/** A throwaway project, and a `claude` on PATH that logs its arguments and answers like the real one. */
function project(files, { pluginInstalled = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-init-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  const bin = mkdtempSync(join(tmpdir(), 'inspeck-claude-'))
  const log = join(bin, 'calls.log')
  writeFileSync(join(bin, 'claude'), `#!/bin/sh
echo "$*" >> "${log}"
case "$*" in
  "--version") echo "2.1.0 (Claude Code)";;
  "plugin list") ${pluginInstalled ? 'echo "  ❯ inspeck@inspeck"' : 'echo "Installed plugins:"'};;
  "plugin marketplace list") echo "Configured marketplaces:";;
esac
exit 0
`)
  chmodSync(join(bin, 'claude'), 0o755)
  /* Claude Code's settings go to a throwaway folder, never the real ~/.claude. */
  const config = mkdtempSync(join(tmpdir(), 'inspeck-config-'))
  const run = (...args) => execFileSync(process.execPath, [BIN, 'init', ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_CONFIG_DIR: config }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const settings = () => { try { return JSON.parse(readFileSync(join(config, 'settings.json'), 'utf8')) } catch { return null } }
  const calls = () => { try { return readFileSync(log, 'utf8').trim().split('\n') } catch { return [] } }
  return { dir, run, calls, settings, read: name => readFileSync(join(dir, name), 'utf8') }
}

test('a Vite app: the plugin is installed from GitHub and the config gets inspeck(); a second run does nothing', () => {
  const p = project({
    'package.json': JSON.stringify({ devDependencies: { vite: '^8.0.0' } }),
    'vite.config.ts': `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [],\n})\n`,
  })
  const out = p.run('--skip-install')
  assert.deepEqual(p.calls(), ['--version', 'plugin list', 'plugin marketplace list', 'plugin marketplace add pulkitmittal19/inspeck-claude', 'plugin install inspeck@inspeck'])
  assert.match(out, /✓ installed; new Claude sessions start with it/)
  assert.match(p.read('vite.config.ts'), /import inspeck from 'inspeck\/vite'[\s\S]*plugins: \[inspeck\(\)\]/)
  assert.match(out, /✓ added inspeck\(\) to vite\.config\.ts/)
  assert.equal(p.settings()?.extraKnownMarketplaces?.inspeck?.autoUpdate, true, 'auto-update turned on')
  assert.match(out, /✓ auto-update on/)

  const again = project({ 'package.json': '{}', 'vite.config.ts': p.read('vite.config.ts') }, { pluginInstalled: true })
  const out2 = again.run('--skip-install')
  assert.deepEqual(again.calls(), ['--version', 'plugin list'], 'already installed: nothing installed')
  assert.match(out2, /✓ already installed/)
  assert.match(out2, /already loads Inspeck/)
})

test('a Next.js app: the root layout gets a development-only tag', () => {
  const p = project({
    'package.json': JSON.stringify({ dependencies: { next: '16.0.0', react: '19.2.0' } }),
    'app/layout.tsx': `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>\n        {children}\n      </body>\n    </html>\n  )\n}\n`,
  }, { pluginInstalled: true })
  const out = p.run()
  assert.match(p.read('app/layout.tsx'), /NODE_ENV === 'development' && <script src="http:\/\/127\.0\.0\.1:4848\/inspeck\.js" async \/>/)
  assert.match(out, /✓ added a development-only tag to app\/layout\.tsx/)
})

test('a plain HTML page is only changed when asked (--yes); otherwise the tag is printed', () => {
  const html = `<!doctype html>\n<html>\n  <body>\n    <h1>Site</h1>\n  </body>\n</html>\n`
  const p = project({ 'index.html': html }, { pluginInstalled: true })
  const out = p.run()
  assert.equal(p.read('index.html'), html, 'not a terminal and no --yes: untouched')
  assert.match(out, /left it alone/)
  p.run('--yes')
  assert.match(p.read('index.html'), /\n {4}<script>\/\* Inspeck: loads on this computer only, never on the live site \*\/ if \(.*location\.hostname\)\) .*src: 'http:\/\/127\.0\.0\.1:4848\/inspeck\.js'.*<\/script>\n {2}<\/body>/)
})

test('no Claude Code on the machine: it says how to get it, and still wires the app', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-init-'))
  writeFileSync(join(dir, 'vite.config.js'), `export default { plugins: [] }\n`)
  const config = mkdtempSync(join(tmpdir(), 'inspeck-config-'))
  const out = execFileSync(process.execPath, [BIN, 'init', '--skip-install'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin', CLAUDE_CONFIG_DIR: config } })
  assert.match(out, /Claude Code isn't installed/)
  assert.match(out, /claude plugin marketplace add pulkitmittal19\/inspeck-claude/)
  assert.match(readFileSync(join(dir, 'vite.config.js'), 'utf8'), /inspeck\(\)/)
  assert.ok(!existsSync(join(config, 'settings.json')), 'no Claude Code: its settings untouched')
})

test('--no-auto-update leaves Claude Code\'s settings alone', () => {
  const p = project({ 'vite.config.js': `export default { plugins: [] }\n` }, { pluginInstalled: true })
  p.run('--skip-install', '--no-auto-update')
  assert.equal(p.settings(), null)
})

test('Astro: inspeck() goes into its Vite plugins, wherever the config has room; twice changes nothing', () => {
  const plain = wireAstro(`import { defineConfig } from 'astro/config'\n\nexport default defineConfig({})\n`)
  assert.equal(plain.result, 'added')
  assert.match(plain.src, /import inspeck from 'inspeck\/vite'/)
  assert.match(plain.src, /defineConfig\(\{\n  vite: \{ plugins: \[inspeck\(\)\] \},/)
  assert.equal(wireAstro(plain.src).result, 'present')
  assert.match(wireAstro(`export default defineConfig({ vite: { plugins: [tailwind()] } })`).src, /plugins: \[inspeck\(\), tailwind\(\)\]/)
  assert.match(wireAstro(`export default defineConfig({ vite: { ssr: {} } })`).src, /vite: \{ plugins: \[inspeck\(\)\], ssr/)
  assert.equal(wireAstro(`module.exports = makeConfig()`).result, 'manual')
})

test('Nuxt: a development-only script in the page head; twice changes nothing', () => {
  const out = wireNuxt(`export default defineNuxtConfig({\n  devtools: { enabled: true },\n})\n`)
  assert.equal(out.result, 'added')
  assert.match(out.src, /\$development: \{ app: \{ head: \{ script: \[\{ src: 'http:\/\/127\.0\.0\.1:4848\/inspeck\.js', async: true \}\] \} \} \},/)
  assert.equal(wireNuxt(out.src).result, 'present')
  assert.equal(wireNuxt(`export default defineNuxtConfig({ $development: { ssr: false } })`).result, 'manual')
})

test('the Vite plugin puts the widget on every HTML page the dev server sends, and leaves the rest alone', async () => {
  const p = vitePlugin.default({ port: 4999 })
  assert.equal(p.apply, 'serve', 'never in a build')
  const proxy = p.config().server.proxy['/__inspeck']
  assert.equal(proxy.target, 'http://127.0.0.1:4999')
  assert.equal(proxy.rewrite('/__inspeck/inspeck.js'), '/inspeck.js')
  let mw
  p.configureServer({ middlewares: { use: fn => { mw = fn } } })
  /* A stand-in response, written the ways frameworks write: setHeader + end, writeHead + several writes. */
  const respond = (accept, contentType, parts, viaWriteHead) => new Promise(done => {
    const headers = {}
    const out = []
    const res = {
      headersSent: false,
      getHeader: k => headers[k.toLowerCase()],
      setHeader(k, v) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT'); headers[k.toLowerCase()] = v },
      removeHeader(k) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT'); delete headers[k.toLowerCase()] },
      writeHead(status, h) { for (const [k, v] of Object.entries(h ?? {})) headers[k.toLowerCase()] = v; this.headersSent = true; return this },
      /* As in Node: once headers are sent, changing one throws. */
      get _sent() { return this.headersSent },
      write(c) { out.push(typeof c === 'string' ? c : Buffer.from(c).toString()); return true },
      end(c) { if (c != null && typeof c !== 'function') out.push(typeof c === 'string' ? c : Buffer.from(c).toString()); done({ body: out.join(''), headers }); return this },
    }
    mw({ method: 'GET', headers: { accept } }, res, () => {
      if (viaWriteHead) { res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': 999 }); for (const x of parts.slice(0, -1)) res.write(x); res.end(parts.at(-1)) }
      else { res.setHeader('content-type', contentType); res.setHeader('content-length', 999); res.end(parts.join('')) }
    })
  })
  const ssr = await respond('text/html', 'text/html; charset=utf-8', ['<html><body><h1>', 'Svelte', '</h1></body></html>'], true)
  assert.equal(ssr.body, '<html><body><h1>Svelte</h1><script src="/__inspeck/inspeck.js" async></script></body></html>')
  assert.equal(ssr.headers['content-length'], undefined, 'no stale length')
  const spa = await respond('text/html', 'text/html', ['<html><body><div id="app"></div></body></html>'])
  assert.match(spa.body, /<script src="\/__inspeck\/inspeck\.js" async><\/script><\/body>/)
  assert.equal(Number(spa.headers['content-length']), Buffer.byteLength(spa.body))
  /* Astro and SvelteKit write plain bytes, not text: they must come out as the page, not as numbers. */
  const enc = new TextEncoder()
  const bytes = await respond('text/html', 'text/html', [enc.encode('<!DOCTYPE html><html><body>'), enc.encode('Astro ✓</body></html>')], true)
  assert.equal(bytes.body, '<!DOCTYPE html><html><body>Astro ✓<script src="/__inspeck/inspeck.js" async></script></body></html>')
  const once = await respond('text/html', 'text/html', ['<body><script src="/__inspeck/inspeck.js" async></script></body>'])
  assert.equal(once.body.match(/inspeck\.js/g).length, 1, 'never twice')
  const js = await respond('*/*', 'text/javascript', ['console.log("</body>")'])
  assert.equal(js.body, 'console.log("</body>")', 'not HTML: untouched')
})

test('the Vite plugin answers /__inspeck/ only on this computer, and says which site is asking', async () => {
  const { networkInterfaces } = await import('node:os')
  const p = vitePlugin.default({ port: 4999 })
  const used = []
  p.configureServer({ middlewares: { use: fn => used.push(fn) } })
  const guard = used[0]
  const run = (remoteAddress, host, url = '/__inspeck/comments', headers = {}) => {
    const req = { url, method: 'GET', socket: { remoteAddress }, headers: { host, ...headers } }
    let status = 200, passed = false
    guard(req, { set statusCode(v) { status = v }, setHeader() {}, end() {} }, () => { passed = true })
    return { passed, status, origin: req.headers.origin }
  }
  assert.deepEqual(run('127.0.0.1', 'localhost:5173'), { passed: true, status: 200, origin: 'http://localhost:5173' })
  assert.equal(run('::ffff:127.0.0.1', 'app.localhost:5173').passed, true)
  assert.equal(run('192.168.1.40', '192.168.1.5:5173').status, 403, 'another device on the Wi-Fi')
  assert.equal(run('127.0.0.1', 'evil.example:5173').status, 403, 'a site pointing its name here')
  const lan = Object.values(networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal)?.address
  if (lan) assert.equal(run(lan, `${lan}:5173`).passed, true, 'this computer on its own network address')
  assert.equal(run('192.168.1.40', '192.168.1.5:5173', '/').passed, true, 'the app itself is still served to everyone')
  assert.equal(run('127.0.0.1', 'localhost:5173', '/__inspeck/x', { origin: 'http://localhost:5173' }).origin, 'http://localhost:5173')
})

test('a Content-Security-Policy in the app is found, so init can say what to allow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-csp-'))
  assert.equal(cspFileIn(dir), null)
  writeFileSync(join(dir, 'next.config.mjs'), `export default { async headers() { return [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: "script-src 'self'" }] }] } }`)
  assert.equal(cspFileIn(dir), join(dir, 'next.config.mjs'))
})

test('Storybook: the local-only tag in .storybook/preview-head.html, kept with what is there; twice changes nothing', () => {
  const fresh = wireStorybookHead(null)
  assert.equal(fresh.result, 'added')
  assert.match(fresh.src, /^<script>\/\* Inspeck: loads on this computer only/)
  const kept = wireStorybookHead('<link rel="preconnect" href="https://fonts.gstatic.com">\n')
  assert.match(kept.src, /^<link rel="preconnect"[^\n]*\n<script>/)
  assert.equal(wireStorybookHead(kept.src).result, 'present')
})

test('Docusaurus: the local-only tag goes in headTags, its code runs as written; twice changes nothing', () => {
  const src = `import type { Config } from '@docusaurus/types'\n\nconst config: Config = {\n  title: 'Docs',\n}\n\nexport default config\n`
  const { src: out, result } = wireDocusaurus(src)
  assert.equal(result, 'added')
  const code = JSON.parse(/innerHTML: ("(?:[^"\\]|\\.)*")/.exec(out)[1])
  assert.doesNotThrow(() => new Function(code), 'the code it adds is valid JavaScript')
  assert.match(code, /location\.hostname/, 'loads only on this computer')
  assert.equal(wireDocusaurus(out).result, 'present')
  const withTags = wireDocusaurus(`module.exports = {\n  headTags: [{ tagName: 'meta', attributes: {} }],\n}\n`)
  assert.match(withTags.src, /headTags: \[\n    \{ tagName: 'script'[\s\S]*\{ tagName: 'meta'/, 'into the list that is there')
  assert.equal(wireDocusaurus('export default makeConfig()').result, 'manual')
})

test('Create React App, Vue CLI and Angular: the tag goes in their HTML template', () => {
  for (const [deps, file, name] of [
    [{ 'react-scripts': '5.0.1', react: '18' }, 'public/index.html', 'Create React App'],
    [{ '@vue/cli-service': '5.0.8', vue: '3' }, 'public/index.html', 'Vue CLI'],
    [{ '@angular/core': '18.0.0' }, 'src/index.html', 'Angular'],
  ]) {
    const p = project({ 'package.json': JSON.stringify({ dependencies: deps }), [file]: '<!doctype html>\n<html>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n' })
    const out = p.run('--skip-plugin', '--skip-install', '--yes')
    assert.match(out, new RegExp(`${name}: the tag goes in ${file.replace('.', '\\.')}`), name)
    assert.match(p.read(file), /location\.hostname[\s\S]*inspeck\.js[\s\S]*<\/body>/, name)
    assert.match(p.run('--skip-plugin', '--skip-install', '--yes'), /already loads Inspeck/, `${name}, twice`)
  }
})

test('Storybook on Vite gets Inspeck from the app’s Vite setup, so no second tag; on webpack it gets the tag', () => {
  const vite = project({
    'package.json': JSON.stringify({ devDependencies: { vite: '^6', '@storybook/react-vite': '^8' } }),
    'vite.config.ts': `import { defineConfig } from 'vite'\nexport default defineConfig({\n  plugins: [],\n})\n`,
    '.storybook/main.ts': `export default { framework: '@storybook/react-vite' }\n`,
  })
  assert.match(vite.run('--skip-plugin', '--skip-install', '--yes'), /Storybook runs on your Vite setup, so Inspeck comes with it/)
  assert.throws(() => vite.read('.storybook/preview-head.html'), 'no second tag')
  const webpack = project({
    'package.json': JSON.stringify({ dependencies: { next: '15' }, devDependencies: { '@storybook/nextjs': '^8' } }),
    'app/layout.tsx': 'export default function L({ children }) {\n  return (\n    <html>\n      <body>{children}</body>\n    </html>\n  )\n}\n',
    '.storybook/main.ts': `export default { framework: '@storybook/nextjs' }\n`,
  })
  assert.match(webpack.run('--skip-plugin', '--skip-install', '--yes'), /added Inspeck to Storybook \(\.storybook\/preview-head\.html\)/)
  assert.match(webpack.read('.storybook/preview-head.html'), /inspeck\.js/)
})
