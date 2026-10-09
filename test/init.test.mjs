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
const { wireVite, wireNext, wireHtml, withAutoUpdate } = await import(pathToFileURL(join(pkg, 'dist/cli.js')).href)

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
  assert.match(src, /\n {4}<script src="http:\/\/127\.0\.0\.1:4848\/inspeck\.js" async><\/script>\n {2}<\/body>/)
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
  assert.match(p.read('index.html'), /<script src="http:\/\/127\.0\.0\.1:4848\/inspeck\.js" async><\/script>\n {2}<\/body>/)
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
