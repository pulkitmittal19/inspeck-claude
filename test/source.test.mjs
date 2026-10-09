/* Where an element is written, for each framework and dev plugin, without a
 * browser: stand-in elements carry exactly what each one attaches in development. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let sourceOf, componentOf, shortName, lineIn

before(async () => {
  globalThis.location = new URL('http://localhost:5173/app')
  globalThis.window = globalThis
  const out = mkdtempSync(join(tmpdir(), 'inspeck-src-'))
  const bundle = async (entry) => {
    const file = join(out, entry.replace(/\W/g, '_') + '.mjs')
    await build({ entryPoints: [join(root, entry)], outfile: file, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' })
    return import(pathToFileURL(file).href)
  }
  ;({ sourceOf } = await bundle('widget/src/source.ts'))
  ;({ componentOf } = await bundle('widget/src/css/describe.ts'))
  ;({ shortName } = await bundle('widget/src/css/highlight.ts'))
  ;({ lineIn } = await bundle('widget/src/defs.ts'))
})

/* A stand-in element: attributes, a parent, and whatever else a framework hangs on it. */
const el = (attrs = {}, parent = null, extra = {}) => Object.assign({
  getAttribute: (k) => attrs[k] ?? null,
  parentElement: parent,
}, extra)

test('code-inspector-plugin: the element’s own line, then where its parent is written', async () => {
  const card = el({ 'data-insp-path': '/Users/me/app/src/Card.vue:8:3:div' })
  const title = el({ 'data-insp-path': '/Users/me/app/src/Card.vue:12:5:h2' }, card)
  assert.deepEqual(await sourceOf(title), [
    { file: '/Users/me/app/src/Card.vue', line: 12, column: 5 },
    { file: '/Users/me/app/src/Card.vue', line: 8, column: 3 },
  ])
})

test('react-dev-inspector: a relative path and its line', async () => {
  const b = el({ 'data-inspector-relative-path': 'src/components/SaveBar.tsx', 'data-inspector-line': '41', 'data-inspector-column': '7' })
  assert.deepEqual(await sourceOf(b), [{ file: 'src/components/SaveBar.tsx', line: 41, column: 7 }])
})

test('vite-plugin-vue-inspector: file, line and column in one attribute', async () => {
  assert.deepEqual(await sourceOf(el({ 'data-v-inspector': 'src/views/Settings.vue:27:9' })), [{ file: 'src/views/Settings.vue', line: 27, column: 9 }])
})

test('Svelte 4 counts lines from 0, Svelte 5 from 1; both come out as the line you see', async () => {
  const s4 = el({}, null, { __svelte_meta: { loc: { file: 'src/lib/Nav.svelte', line: 9, column: 2, char: 211 } } })
  const s5 = el({}, null, { __svelte_meta: { loc: { file: 'src/lib/Nav.svelte', line: 10, column: 2 } } })
  assert.deepEqual(await sourceOf(s4), [{ file: 'src/lib/Nav.svelte', line: 10, column: 3 }])
  assert.deepEqual(await sourceOf(s5), [{ file: 'src/lib/Nav.svelte', line: 10, column: 3 }])
})

test('Vue: the component’s file and the ones around it, without a line', async () => {
  const app = { type: { __file: '/Users/me/app/src/App.vue' }, parent: null }
  const page = { type: { __file: '/Users/me/app/src/pages/Billing.vue' }, parent: app }
  const button = { type: { __file: '/Users/me/app/node_modules/ui-kit/Button.vue' }, parent: page }
  assert.deepEqual(await sourceOf(el({}, null, { __vueParentComponent: button })), [
    { file: '/Users/me/app/src/pages/Billing.vue', line: 0 },
    { file: '/Users/me/app/src/App.vue', line: 0 },
  ])
})

test('a page with no dev info gives nothing, and quickly', async () => {
  const t = Date.now()
  assert.deepEqual(await sourceOf(el()), [])
  assert.ok(Date.now() - t < 200)
})

test('the component name comes from Vue, Svelte or Angular when it isn’t React', () => {
  assert.equal(componentOf(el({}, null, { __vueParentComponent: { type: { __name: 'BillingCard' } } })), 'BillingCard')
  assert.equal(componentOf(el({}, null, { __vueParentComponent: { type: { __file: '/a/src/PlanPicker.vue' } } })), 'PlanPicker')
  assert.equal(componentOf(el({}, null, { __svelte_meta: { loc: { file: 'src/lib/Nav.svelte', line: 3 } } })), 'Nav')
  globalThis.ng = { getComponent: () => null, getOwningComponent: () => new (class _SettingsPage {})() }
  assert.equal(componentOf(el()), 'SettingsPage')
  delete globalThis.ng
})

test('a long token name keeps its family and the words that set it apart', () => {
  assert.equal(shortName('text-primary'), 'text-primary', 'short names are untouched')
  assert.equal(shortName('semantic-color-background-interactive-primary-hover-pressed'), 'semantic-color…hover-pressed')
  assert.equal(shortName('component-button-primary-padding-inline-large-density-comfortable'), 'component…density-comfortable')
  assert.equal(shortName('color_brand_primary_background_surface_elevated_hover'), 'color_brand…elevated_hover')
  const word = shortName('a'.repeat(40))
  assert.equal(word.length, 30)
  assert.match(word, /^a+…a+$/)
  for (const n of ['semantic-color-background-interactive-primary-hover-pressed', 'x-'.repeat(30) + 'end']) assert.ok(shortName(n).length <= 30)
})

test('inside a component, the element’s line is the one with its tag and its class, not just the first tag', () => {
  const lines = [
    'import { Tag } from "@/ds"',
    'export const ConvoTag = ({ label }) =>',
    '<Tag tone="neutral"',
    '  render={<span />}>',
    '  <span className="truncate">{label}</span>',
    '</Tag>;',
  ]
  const def = { file: '/src/convo-tag.jsx', line: 2, lines }
  assert.equal(lineIn(def, ['<span'], ['truncate']), 5)
  assert.equal(lineIn(def, ['<span'], ['no-such-class']), 4, 'no class match: the first <span')
  assert.equal(lineIn(def, ['<Missing']), null)
})
