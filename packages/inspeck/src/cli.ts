/* `npx inspeck init`: everything a new user needs, in one command.
 *
 *  1. The Claude Code plugin: added from GitHub and installed, unless it's
 *     already there. It serves the widget and hands notes to Claude.
 *  2. The app in this folder: the widget's script tag, added the way the app
 *     is built, in development only.
 *       - Vite:     `inspeck()` in vite.config, from this package.
 *       - Next.js:  a development-only tag in the root layout.
 *       - HTML:     the tag before </body> in index.html (asks first: a static
 *                   page has no "development only").
 *     Anything else gets the tag printed to paste.
 *
 * Running it twice changes nothing: every step checks first. No dependencies;
 * Node 18+.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline/promises'

const MARKETPLACE = 'pulkitmittal19/inspeck-claude'
const PLUGIN = 'inspeck@inspeck'
const TAG_SRC = 'http://127.0.0.1:4848/inspeck.js'

interface Flags { yes: boolean; skipPlugin: boolean; skipInstall: boolean; cwd: string }

const say = (s = '') => process.stdout.write(s + '\n')
const done = (s: string) => say(`  ✓ ${s}`)
const note = (s: string) => say(`  · ${s}`)
const warn = (s: string) => say(`  ! ${s}`)

function run(cmd: string, args: string[], cwd?: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' })
  return { ok: !r.error && r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, missing: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' }
}

/* ---------- 1. the Claude Code plugin ---------- */

function installPlugin(): boolean {
  say('Claude Code plugin')
  const version = run('claude', ['--version'])
  if (version.missing) {
    warn('Claude Code isn\'t installed (no `claude` command). Install it from https://claude.com/claude-code, then run:')
    say(`      claude plugin marketplace add ${MARKETPLACE}`)
    say(`      claude plugin install ${PLUGIN}`)
    return false
  }
  if (/\binspeck@/.test(run('claude', ['plugin', 'list']).out)) {
    done('already installed')
    return true
  }
  if (!/\binspeck\b/.test(run('claude', ['plugin', 'marketplace', 'list']).out)) {
    const added = run('claude', ['plugin', 'marketplace', 'add', MARKETPLACE])
    if (!added.ok) { warn(`couldn't add the marketplace:\n${added.out.trim()}`); return false }
    done(`added the marketplace ${MARKETPLACE}`)
  }
  const installed = run('claude', ['plugin', 'install', PLUGIN])
  if (!installed.ok) { warn(`couldn't install the plugin:\n${installed.out.trim()}`); return false }
  done('installed; new Claude sessions start with it')
  return true
}

/* ---------- 2. the app ---------- */

type App =
  | { kind: 'vite'; config: string }
  | { kind: 'next'; layout: string | null }
  | { kind: 'html'; file: string }
  | { kind: 'other' }

function readJson(path: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

const firstExisting = (cwd: string, names: string[]) => names.map(n => join(cwd, n)).find(p => existsSync(p)) ?? null

function detect(cwd: string): App {
  const pkg = readJson(join(cwd, 'package.json'))
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  const vite = firstExisting(cwd, ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'])
  if (vite) return { kind: 'vite', config: vite }
  if (deps.next) {
    return { kind: 'next', layout: firstExisting(cwd, [
      'app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js',
      'pages/_document.tsx', 'pages/_document.jsx', 'pages/_document.js', 'src/pages/_document.tsx', 'src/pages/_document.jsx', 'src/pages/_document.js',
    ]) }
  }
  const html = firstExisting(cwd, ['index.html'])
  if (html && !pkg) return { kind: 'html', file: html }
  if (html && !deps.react && !deps.vue && !deps.svelte && !deps['@angular/core']) return { kind: 'html', file: html }
  return { kind: 'other' }
}

function packageManager(cwd: string): [string, string[]] {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return ['pnpm', ['add', '-D', 'inspeck']]
  if (existsSync(join(cwd, 'yarn.lock'))) return ['yarn', ['add', '-D', 'inspeck']]
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return ['bun', ['add', '-d', 'inspeck']]
  return ['npm', ['install', '-D', 'inspeck']]
}

/** Put a line after the file's last top-level import (or at the top). */
function afterImports(src: string, line: string): string {
  const imports = [...src.matchAll(/^import[^\n]*?(?:from\s*)?['"][^'"]+['"];?[ \t]*$/gm)]
  if (!imports.length) return `${line}\n${src}`
  const last = imports[imports.length - 1]
  const at = last.index! + last[0].length
  return `${src.slice(0, at)}\n${line}${src.slice(at)}`
}

/** Add `inspeck()` to a Vite config. 'present' if it's already wired (this package or a hand-written tag). */
export function wireVite(src: string, file: string): { src: string; result: 'added' | 'present' | 'manual' } {
  if (/['"]inspeck\/vite['"]/.test(src) || src.includes('inspeck.js')) return { src, result: 'present' }
  const plugins = /\bplugins\s*:\s*\[/.exec(src)
  if (!plugins) return { src, result: 'manual' }
  const open = plugins.index + plugins[0].length
  const empty = /^\s*\]/.test(src.slice(open))
  let out = `${src.slice(0, open)}${empty ? 'inspeck()' : 'inspeck(), '}${src.slice(open)}`
  out = file.endsWith('.cjs')
    ? `const inspeck = require('inspeck/vite').default\n${out}`
    : afterImports(out, `import inspeck from 'inspeck/vite'`)
  return { src: out, result: 'added' }
}

/** Add a development-only tag before </body> in a Next.js layout or _document. */
const NEXT_TAG = `{process.env.NODE_ENV === 'development' && <script src="${TAG_SRC}" async />}`

export function wireNext(src: string): { src: string; result: 'added' | 'present' | 'manual' } {
  if (src.includes('inspeck.js')) return { src, result: 'present' }
  /* </body> on a line of its own: the tag goes on the line above, indented one step in. */
  const own = /^([ \t]*)<\/body>/m.exec(src)
  if (own) return { src: `${src.slice(0, own.index)}${own[1]}  ${NEXT_TAG}\n${src.slice(own.index)}`, result: 'added' }
  /* On one line with the rest (create-next-app's `<body …>{children}</body>`): just before it. */
  const inline = src.indexOf('</body>')
  if (inline >= 0) return { src: `${src.slice(0, inline)}${NEXT_TAG}${src.slice(inline)}`, result: 'added' }
  return { src, result: 'manual' }
}

/** Add the tag before </body> in a plain HTML page. */
export function wireHtml(src: string): { src: string; result: 'added' | 'present' | 'manual' } {
  if (src.includes('inspeck.js')) return { src, result: 'present' }
  const body = /^([ \t]*)<\/body>/im.exec(src)
  if (!body) return { src, result: 'manual' }
  const line = `${body[1]}  <script src="${TAG_SRC}" async></script>\n`
  return { src: src.slice(0, body.index) + line + src.slice(body.index), result: 'added' }
}

async function confirm(question: string, flags: Flags): Promise<boolean> {
  if (flags.yes) return true
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return /^y(es)?$/i.test((await rl.question(`  ? ${question} (y/N) `)).trim()) } finally { rl.close() }
}

function printNextTag() {
  say(`      ${NEXT_TAG}`)
}

function printTag() {
  say(`      <script src="${TAG_SRC}" async></script>`)
  say('    Add it in development only; on any address that isn\'t this machine the widget stays silent anyway.')
}

async function wireApp(flags: Flags): Promise<void> {
  const { cwd } = flags
  const app = detect(cwd)
  const rel = (p: string) => relative(cwd, p) || p
  say('Your app')

  if (app.kind === 'vite') {
    if (!flags.skipInstall) {
      const [pm, args] = packageManager(cwd)
      const r = run(pm, args, cwd)
      if (!r.ok) { warn(`\`${pm} ${args.join(' ')}\` failed:\n${r.out.trim()}`); return }
      done(`installed inspeck with ${pm}`)
    }
    const { src, result } = wireVite(readFileSync(app.config, 'utf8'), app.config)
    if (result === 'present') done(`${rel(app.config)} already loads Inspeck`)
    else if (result === 'added') { writeFileSync(app.config, src); done(`added inspeck() to ${rel(app.config)} (only while vite serves, never in a build)`) }
    else {
      warn(`couldn't find the plugins list in ${rel(app.config)}. Add this yourself:`)
      say(`      import inspeck from 'inspeck/vite'`)
      say('      plugins: [inspeck()]')
    }
    return
  }

  if (app.kind === 'next') {
    if (!app.layout) { warn('Next.js app, but no app/layout or pages/_document found. Add this inside <body> of your root layout:'); printNextTag(); return }
    const { src, result } = wireNext(readFileSync(app.layout, 'utf8'))
    if (result === 'present') done(`${rel(app.layout)} already loads Inspeck`)
    else if (result === 'added') { writeFileSync(app.layout, src); done(`added a development-only tag to ${rel(app.layout)}`) }
    else { warn(`couldn't find </body> in ${rel(app.layout)}. Add this inside <body>:`); printNextTag() }
    return
  }

  if (app.kind === 'html') {
    const current = readFileSync(app.file, 'utf8')
    if (current.includes('inspeck.js')) { done(`${rel(app.file)} already loads Inspeck`); return }
    note(`${rel(app.file)} is a plain page, so the tag can't be development-only. Off this machine it stays silent, but remove it before you ship.`)
    if (!(await confirm(`Add the tag to ${rel(app.file)}?`, flags))) { note('left it alone. To add it yourself:'); printTag(); return }
    const { src, result } = wireHtml(current)
    if (result === 'added') { writeFileSync(app.file, src); done(`added the tag to ${rel(app.file)}`) }
    else { warn(`couldn't find </body> in ${rel(app.file)}. Add this before it:`); printTag() }
    return
  }

  note('No Vite, Next.js or plain index.html here. Add this to your page\'s HTML, in development only:')
  printTag()
}

/* ---------- the command ---------- */

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const flags: Flags = {
    yes: rest.includes('--yes') || rest.includes('-y'),
    skipPlugin: rest.includes('--skip-plugin'),
    skipInstall: rest.includes('--skip-install'),
    cwd: process.cwd(),
  }
  if (command !== 'init') {
    say('Usage: npx inspeck init [--yes] [--skip-plugin] [--skip-install]')
    say('')
    say('  Installs the Inspeck plugin for Claude Code and adds the widget to the app in this folder.')
    say('  --yes           add the tag to a plain HTML page without asking')
    say('  --skip-plugin   leave Claude Code alone')
    say('  --skip-install  don\'t install the npm package (Vite)')
    return command === undefined || command === '--help' || command === '-h' ? 0 : 1
  }
  say('Inspeck')
  say('')
  const plugin = flags.skipPlugin ? true : installPlugin()
  say('')
  await wireApp(flags)
  say('')
  say('Next: start your dev server and open the app, in Chrome or in the Claude app\'s browser.')
  say('Press ⌥ I (Alt+I) for Inspeck, click anything to leave a note, then ask Claude to check your Inspeck notes.')
  if (!plugin) say('(Install the Claude Code plugin first: the widget is served by it.)')
  return 0
}
