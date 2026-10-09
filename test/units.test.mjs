/* Settings › Sizes and Colours: the conversions the CSS card shows. Checked
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

const f = (sizes, colors, rootPx = 16) => ({ sizes, colors, rootPx })

test('sizes: px ↔ rem at the page\'s root size; other units and tokens untouched', () => {
  const rem = f('rem', 'written'), px = f('px', 'written')
  assert.equal(units.present('14px', 'font-size', rem), '0.875rem')
  assert.equal(units.present('8px 14px', 'padding', rem), '0.5rem 0.875rem')
  assert.equal(units.present('-12px', 'margin', rem), '-0.75rem')
  assert.equal(units.present('1.5rem', 'gap', px), '24px')
  assert.equal(units.present('.25rem', 'gap', px), '4px')
  assert.equal(units.present('15px', 'font-size', f('rem', 'written', 10)), '1.5rem', 'a 10px root (62.5%)')
  assert.equal(units.present('calc(100% - 12px)', 'width', rem), 'calc(100% - 0.75rem)')
  assert.equal(units.present('1.5em 50% 10vw 1.4', 'x', rem), '1.5em 50% 10vw 1.4')
  assert.equal(units.present('var(--spacing-200) 12px', 'padding', rem), 'var(--spacing-200) 0.75rem')
  assert.equal(units.present('var(--gap, 12px)', 'gap', rem), 'var(--gap, 12px)', 'a token is kept whole, fallback and all')
  assert.equal(units.present('url(icon-12px.svg)', 'background-image', rem), 'url(icon-12px.svg)')
  assert.equal(units.present('1px', 'border-width', rem), '0.0625rem')
  assert.equal(units.present('0.3333px', 'x', f('rem', 'written')), '0.0208rem', 'four decimals at most')
})

test('a whole value: a shadow, a gradient, a border, in one go', () => {
  assert.equal(units.present('0 1px 2px rgba(0, 0, 0, 0.05)', 'box-shadow', f('rem', 'hex')), '0 0.0625rem 0.125rem #0000000D')
  assert.equal(units.present('linear-gradient(90deg, #fff 0%, oklch(62.8% 0.2577 29.23) 100%)', 'background-image', f('written', 'rgb')),
    'linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 0, 0) 100%)')
  assert.equal(units.present('1px solid #E7E5E4', 'border', f('px', 'oklch')), '1px solid oklch(92.32% 0.00256 48.72)')
  assert.equal(units.present('"Red Hat Display", sans-serif', 'font-family', f('rem', 'hex')), '"Red Hat Display", sans-serif')
  assert.equal(units.present('14px', 'padding', f('written', 'written')), '14px', 'as written: untouched')
})
