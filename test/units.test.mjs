/* The other forms a CSS row's tip offers (px ↔ rem, hex · rgb · oklch). Checked
 * against reference values (CSS Color 4 / oklch.com) and by round trips. */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let color, units

before(async () => {
  const out = mkdtempSync(join(tmpdir(), 'inspeck-units-'))
  const bundle = async (entry) => {
    const file = join(out, entry.replace(/\W/g, '_') + '.mjs')
    await build({ entryPoints: [join(root, entry)], outfile: file, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' })
    return import(pathToFileURL(file).href)
  }
  color = await bundle('widget/src/css/color.ts')
  units = await bundle('widget/src/css/units.ts')
})

const as = (text, format) => color.convertColor(text, format)

test('reference colours: red, white, black and a known blue in oklch', () => {
  assert.equal(as('#FF0000', 'oklch'), 'oklch(62.8% 0.25768 29.23)')
  assert.equal(as('#fff', 'oklch'), 'oklch(100% 0 0)')
  assert.equal(as('black', 'oklch'), 'black', 'named colours need a browser; outside one they stay')
  assert.equal(as('#000', 'oklch'), 'oklch(0% 0 0)')
  assert.equal(as('#3B82F6', 'oklch'), 'oklch(62.31% 0.18801 259.81)')
  assert.equal(as('oklch(62.8% 0.25768 29.23)', 'hex'), '#F00')
  assert.equal(as('oklch(0.628 0.25768 29.23)', 'rgb'), 'rgb(255, 0, 0)', 'lightness as a number or a percentage')
})

test('every way of writing a colour reads the same', () => {
  for (const v of ['#336699', '#369', 'rgb(51, 102, 153)', 'rgb(51 102 153)', 'rgba(51,102,153,1)', 'rgb(20% 40% 60%)', 'hsl(210, 50%, 40%)', 'hsl(210 50% 40%)', 'hsl(0.5833turn 50% 40%)', 'color(srgb 0.2 0.4 0.6)']) {
    assert.equal(as(v, 'hex'), '#369', v)
  }
  assert.equal(as('hsl(0 100% 50%)', 'hex'), '#F00')
  assert.equal(as('oklab(0.628 0.2249 0.1258)', 'hex'), '#F00')
})

test('transparency is kept in every format', () => {
  assert.equal(as('rgba(0, 0, 0, 0.5)', 'hex'), '#00000080')
  assert.equal(as('rgb(0 0 0 / 50%)', 'hex'), '#00000080')
  assert.equal(as('#FF000080', 'rgb'), 'rgba(255, 0, 0, 0.502)')
  assert.equal(as('#FF000080', 'oklch'), 'oklch(62.8% 0.25768 29.23 / 0.502)')
  assert.equal(as('transparent', 'rgb'), 'rgba(0, 0, 0, 0)')
  assert.equal(as('#0000', 'hex'), '#0000', 'a short hex with alpha stays short')
})

test('a colour sRGB can\'t show is brought in by chroma, marked ≈, and keeps its hue', () => {
  const p3 = as('color(display-p3 1 0 0)', 'hex')
  assert.match(p3, /^≈#/)
  const vivid = as('oklch(70% 0.35 145)', 'rgb')
  assert.match(vivid, /^≈rgb\(/)
  /* The mapped colour's hue matches the original's, to within a degree. */
  const back = color.parseColor(vivid.slice(1))
  const [, a, b] = color.toOklab(back)
  const hue = (Math.atan2(b, a) * 180) / Math.PI
  assert.ok(Math.abs(hue - 145) < 1, `hue ${hue}`)
  assert.doesNotMatch(as('oklch(70% 0.35 145)', 'oklch'), /≈/, 'oklch can say it exactly')
})

test('round trips: 3000 colours, hex → oklch → hex and hex → rgb → hex, come back exactly', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const h2 = (x) => x.toString(16).padStart(2, '0').toUpperCase()
  for (let i = 0; i < 3000; i++) {
    const hex = `#${h2(Math.floor(rand() * 256))}${h2(Math.floor(rand() * 256))}${h2(Math.floor(rand() * 256))}`
    const want = as(hex, 'hex')
    assert.equal(as(as(hex, 'oklch'), 'hex'), want, `${hex} via ${as(hex, 'oklch')}`)
    assert.equal(as(as(hex, 'rgb'), 'hex'), want)
  }
})

test('things that aren\'t colours are left alone', () => {
  for (const v of ['currentColor', 'inherit', 'var(--brand)', 'rgb(var(--r) 0 0)', 'color-mix(in srgb, red, blue)', 'nonsense']) assert.equal(as(v, 'hex'), v)
})

/* Each part as [the code's way, the other ways...]; the code's way always comes first, and only it is marked. */
const forms = (value, prop, rootPx = 16) => units.allForms(value, prop, rootPx).map(p => {
  assert.ok(p.forms[0].code && p.forms.slice(1).every(f => !f.code))
  return p.forms.map(f => f.text)
})
const labels = (value, prop) => units.allForms(value, prop, 16).map(p => p.forms.map(f => f.label))

test('sizes: px gives rem and rem gives px, at the page\'s root size; other units and tokens have none', () => {
  assert.deepEqual(forms('14px', 'font-size'), [['14px', '0.875rem']])
  assert.deepEqual(forms('1.5rem', 'gap'), [['1.5rem', '24px']], 'and back')
  assert.deepEqual(forms('.25rem', 'gap'), [['.25rem', '4px']])
  assert.deepEqual(forms('8px 14px', 'padding'), [['8px', '0.5rem'], ['14px', '0.875rem']])
  assert.deepEqual(forms('8px 8px', 'padding'), [['8px', '0.5rem']], 'once each')
  assert.deepEqual(forms('-12px', 'margin'), [['-12px', '-0.75rem']])
  assert.deepEqual(forms('15px', 'font-size', 10), [['15px', '1.5rem']], 'a 10px root (62.5%)')
  assert.deepEqual(forms('calc(100% - 12px)', 'width'), [['12px', '0.75rem']])
  assert.deepEqual(forms('0 1.5em 50% 10vw 1.4', 'x'), [], 'zero, em, %, vw and plain numbers')
  assert.deepEqual(forms('var(--spacing-200) 12px', 'padding'), [['12px', '0.75rem']], 'a token is kept whole')
  assert.deepEqual(forms('var(--gap, 12px)', 'gap'), [], 'fallback and all')
  assert.deepEqual(forms('url(icon-12px.svg)', 'background-image'), [])
  assert.deepEqual(forms('0.3333px', 'x'), [['0.3333px', '0.0208rem']], 'four decimals at most')
})

test('colours: each in the formats it isn\'t written in', () => {
  assert.deepEqual(forms('#3B82F6', 'color'), [['#3B82F6', 'rgb(59, 130, 246)', forms('#3B82F6', 'color')[0][2]]])
  assert.match(forms('#3B82F6', 'color')[0][2], /^oklch\(/)
  assert.deepEqual(forms('rgb(255, 255, 255)', 'color')[0].slice(0, 2), ['rgb(255, 255, 255)', '#FFF'])
  assert.equal(forms('oklch(62.8% 0.2577 29.23)', 'color')[0].length, 3, 'oklch gives hex and rgb')
  /* Named colours need a browser to read (the browser test covers them). */
  assert.deepEqual(forms('red', 'grid-area'), [], 'a word that may not be a colour')
  assert.match(forms('oklch(70% 0.4 150)', 'color')[0][1], /^≈#/, 'out of sRGB: the nearest, marked')
  assert.deepEqual(labels('rgb(1, 2, 3)', 'color'), [['rgb', 'hex', 'oklch']])
  assert.deepEqual(labels('hsl(0 100% 50%)', 'color'), [['hsl', 'hex', 'rgb', 'oklch']])
  assert.deepEqual(labels('2rem', 'gap'), [['rem', 'px']])
})

test('a whole value: a shadow, a gradient, a border; in the order written, at most three', () => {
  assert.deepEqual(forms('1px solid #E7E5E4', 'border').map(f => f[0]), ['1px', '#E7E5E4'])
  assert.deepEqual(forms('0 1px 2px rgba(0, 0, 0, 0.05)', 'box-shadow').map(f => f[0]), ['1px', '2px', 'rgba(0, 0, 0, 0.05)'])
  assert.equal(forms('linear-gradient(90deg, #fff 0%, #000 50%, red 100%), 4px', 'background-image').length, 3)
  assert.deepEqual(forms('"Red Hat Display", sans-serif', 'font-family'), [])
})
