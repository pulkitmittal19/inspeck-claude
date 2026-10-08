/* The widget's CSS reading, without a browser: the parts that are pure logic.
 * Bundled from the TypeScript sources on the fly, so these test what ships. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let rules, cascade, describe

before(async () => {
  const out = mkdtempSync(join(tmpdir(), 'inspeck-css-'))
  const bundle = async (name) => {
    const file = join(out, `${name}.mjs`)
    await build({ entryPoints: [join(root, `widget/src/css/${name}.ts`)], outfile: file, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' })
    return import(pathToFileURL(file).href)
  }
  ;[rules, cascade, describe] = await Promise.all([bundle('rules'), bundle('cascade'), bundle('describe')])
})

test('selector lists split only at top-level commas', () => {
  assert.deepEqual(rules.splitList('a, :is(b, c) > d, [data-x="1,2"]'), ['a', ':is(b, c) > d', '[data-x="1,2"]'])
})

test('the rightmost compound decides the index bucket', () => {
  assert.equal(rules.bucketOf('.card > .btn:hover'), '.btn')
  assert.equal(rules.bucketOf('main #save'), '#save')
  assert.equal(rules.bucketOf('ul li'), 'li')
  assert.equal(rules.bucketOf('[role=menuitem]:hover'), '*')
  assert.equal(rules.bucketOf('.hover\\:bg-primary:hover'), '.hover:bg-primary', 'Tailwind escapes are undone')
})

test('specificity follows the spec for :is, :where and :not', () => {
  assert.equal(rules.specificity('#a .b c'), 1e6 + 1e3 + 1)
  assert.equal(rules.specificity(':where(#a) .b'), 1e3)
  assert.equal(rules.specificity(':is(#a, .b) span'), 1e6 + 1)
  assert.equal(rules.specificity('.btn:not(.ghost)'), 2e3)
  assert.equal(rules.specificity('[role=menuitem]:hover'), 2e3)
})

test('a box shorthand gives each side its part', () => {
  assert.equal(cascade.sideOf('8px 14px', 'left'), '14px')
  assert.equal(cascade.sideOf('1px 2px 3px', 'left'), '2px')
  assert.equal(cascade.sideOf('var(--a) var(--b)', 'top'), 'var(--a)')
  assert.equal(cascade.sideOf('var(--pad)', 'top'), null, 'a lone var() might hold several values')
  assert.deepEqual(cascade.parts('calc(1px + 2px) var(--x, 3px) 4px'), ['calc(1px + 2px)', 'var(--x, 3px)', '4px'])
})

test('values compress to the shortest shorthand', () => {
  assert.equal(describe.compress(['8px', '8px', '8px', '8px']), '8px')
  assert.equal(describe.compress(['8px', '16px', '8px', '16px']), '8px 16px')
  assert.equal(describe.compress(['0px', 'var(--s)', '4px', 'var(--s)']), '0px var(--s) 4px')
})

test('a font shorthand yields just the longhand asked for', () => {
  const v = '600 13px/20px var(--font-body)'
  assert.equal(describe.fontPart(v, 'font-size'), '13px')
  assert.equal(describe.fontPart(v, 'line-height'), '20px')
  assert.equal(describe.fontPart(v, 'font-weight'), '600')
  assert.equal(describe.fontPart(v, 'font-family'), 'var(--font-body)')
  assert.equal(describe.fontPart('500 var(--text-sm) / 1.5 Inter', 'line-height'), '1.5')
  assert.equal(describe.fontPart('var(--font-heading)', 'font-size'), null)
})

test('Tailwind plumbing is stripped down to the token', () => {
  assert.equal(describe.unplumb('var(--tw-font-weight, var(--font-weight-medium))'), 'var(--font-weight-medium)')
  assert.equal(describe.unplumb('var(--tw-leading, var(--text-sm--line-height))'), 'var(--text-sm--line-height)')
  assert.equal(describe.unplumb('var(--radius-200)'), 'var(--radius-200)')
})

test('colours read as hex', () => {
  assert.equal(describe.hex('rgb(23, 23, 28)'), '#17171C')
  assert.equal(describe.hex('rgb(255, 255, 255)'), '#FFF')
  assert.equal(describe.hex('rgba(0, 0, 0, 0.5)'), '#00000080')
  assert.equal(describe.oklchHex('oklch(0.205 0 none)'), '#171717')
  assert.equal(describe.oklchHex('oklch(1 0 0)'), '#FFF')
})

test('labels skip utility and generated classes', () => {
  const el = (tag, cls, extra = {}) => ({ tagName: tag.toUpperCase(), id: '', classList: cls.split(' ').filter(Boolean), getAttribute: () => null, ...extra })
  assert.equal(describe.labelOf(el('button', 'relative inline-flex items-center px-3 btn-primary')), 'button.btn-primary')
  assert.equal(describe.labelOf(el('h1', 'page-title')), 'h1.page-title')
  assert.equal(describe.labelOf(el('div', 'css-1x9fqa sc-bdVaJa p-200 hover:bg-x')), 'div')
  assert.equal(describe.labelOf(el('button', '', { id: 'radix-:r5:' })), 'button')
})
