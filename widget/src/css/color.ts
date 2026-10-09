/* Colours, read in any CSS form and written back as hex, rgb or oklch.
 *
 * Everything goes through sRGB (0–1 per channel, possibly beyond for a colour
 * sRGB can't show) and, for oklch, Björn Ottosson's OKLab. A colour outside
 * sRGB — a vivid oklch or display-p3 — written as hex or rgb is brought in by
 * lowering its chroma at the same lightness and hue (as CSS Color 4 maps
 * gamut), not by clipping each channel, which shifts the hue; it is marked ≈.
 */

/** sRGB, gamma-encoded, 0–1 (beyond for wide-gamut colours), and alpha 0–1. */
export interface Rgba { r: number; g: number; b: number; a: number }

export type ColorFormat = 'hex' | 'rgb' | 'oklch'

/* ---------- transfer and matrices ---------- */

const toLinear = (c: number) => {
  const a = Math.abs(c)
  return Math.sign(c) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4)
}
const toGamma = (c: number) => {
  const a = Math.abs(c)
  return Math.sign(c) * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055)
}

export function toOklab({ r, g, b }: Rgba): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function fromOklab(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  }
}

const toOklch = (c: Rgba): [number, number, number] => {
  const [L, a, b] = toOklab(c)
  const C = Math.hypot(a, b)
  const H = (Math.atan2(b, a) * 180) / Math.PI
  return [L, C, H < 0 ? H + 360 : H]
}
const fromOklch = (L: number, C: number, H: number, alpha = 1) =>
  fromOklab(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), alpha)

/** Display P3 (linear) → sRGB (linear). */
function p3ToSrgb(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  return [
    toGamma(1.2249401763 * lr - 0.2249401763 * lg),
    toGamma(-0.0420569547 * lr + 1.0420569547 * lg),
    toGamma(-0.0196375546 * lr - 0.0786360456 * lg + 1.0982736002 * lb),
  ]
}

/* ---------- reading ---------- */

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
/** A colour function this module reads, with no nested functions inside. */
export const COLOR_FN = /\b(?:rgba?|hsla?|oklch|oklab|color)\([^()]*\)/gi
export const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi

const n = (v: string, percentOf: number) => (v === 'none' ? 0 : v.endsWith('%') ? (parseFloat(v) / 100) * percentOf : parseFloat(v))
const angle = (v: string) => {
  if (v === 'none') return 0
  const x = parseFloat(v)
  if (v.endsWith('turn')) return x * 360
  if (v.endsWith('grad')) return x * 0.9
  if (v.endsWith('rad')) return (x * 180) / Math.PI
  return x
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const k = (k0: number) => (k0 + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (k0: number) => l - a * Math.max(-1, Math.min(k(k0) - 3, 9 - k(k0), 1))
  return [f(0), f(8), f(4)]
}

let canvas: CanvasRenderingContext2D | null | undefined
/** A named colour (`rebeccapurple`), through the browser; null outside one. */
function named(word: string): Rgba | null {
  if (typeof document === 'undefined') return null
  if (!/^[a-z]+$/i.test(word) || /^(currentcolor|inherit|initial|unset|revert|none)$/i.test(word)) return null
  if (typeof CSS !== 'undefined' && !CSS.supports('color', word)) return null
  if (canvas === undefined) canvas = document.createElement('canvas').getContext('2d')
  if (!canvas) return null
  canvas.fillStyle = '#000'
  canvas.fillStyle = word
  /* The canvas hands it back as #rrggbb, or rgba(…) when see-through. */
  return parseColor(String(canvas.fillStyle))
}

/** Any CSS colour this card meets, or null when it isn't one (or can't be known here, like currentColor). */
export function parseColor(text: string): Rgba | null {
  const v = text.trim().toLowerCase()
  const hex = HEX.exec(v)
  if (hex) {
    let d = hex[1]
    if (d.length <= 4) d = [...d].map(c => c + c).join('')
    const byte = (i: number) => parseInt(d.slice(i, i + 2), 16) / 255
    return { r: byte(0), g: byte(2), b: byte(4), a: d.length === 8 ? byte(6) : 1 }
  }
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const fn = /^([a-z]+)\(([^()]*)\)$/.exec(v)
  if (!fn) return named(v)
  const [main, alphaPart] = fn[2].split('/')
  const args = main.replace(/,/g, ' ').trim().split(/\s+/)
  let alpha = 1
  if (alphaPart != null) alpha = n(alphaPart.trim(), 1)
  else if (args.length === 4 && fn[1] !== 'color') alpha = n(args.pop()!, 1)
  if (!Number.isFinite(alpha)) return null
  alpha = Math.min(1, Math.max(0, alpha))
  const ok = (...xs: number[]) => xs.every(Number.isFinite)
  switch (fn[1]) {
    case 'rgb':
    case 'rgba': {
      if (args.length !== 3) return null
      const [r, g, b] = args.map(x => n(x, 255) / 255)
      return ok(r, g, b) ? { r, g, b, a: alpha } : null
    }
    case 'hsl':
    case 'hsla': {
      if (args.length !== 3) return null
      /* Modern syntax allows bare numbers for saturation and lightness: they're percentages. */
      const pct = (x: string) => (x.endsWith('%') ? n(x, 1) : parseFloat(x) / 100)
      const [r, g, b] = hslToRgb(angle(args[0]), pct(args[1]), pct(args[2]))
      return ok(r, g, b) ? { r, g, b, a: alpha } : null
    }
    case 'oklch': {
      if (args.length !== 3) return null
      const L = n(args[0], 1), C = n(args[1], 0.4), H = angle(args[2])
      return ok(L, C, H) ? fromOklch(L, C, H, alpha) : null
    }
    case 'oklab': {
      if (args.length !== 3) return null
      const L = n(args[0], 1), a = n(args[1], 0.4), b = n(args[2], 0.4)
      return ok(L, a, b) ? fromOklab(L, a, b, alpha) : null
    }
    case 'color': {
      const [space, ...rest] = args
      if (rest.length !== 3) return null
      const [x, y, z] = rest.map(c => n(c, 1))
      if (!ok(x, y, z)) return null
      if (space === 'srgb') return { r: x, g: y, b: z, a: alpha }
      if (space === 'srgb-linear') return { r: toGamma(x), g: toGamma(y), b: toGamma(z), a: alpha }
      if (space === 'display-p3') { const [r, g, b] = p3ToSrgb(x, y, z); return { r, g, b, a: alpha } }
      return null
    }
  }
  return null
}

/* ---------- writing ---------- */

/* Within half a step of 0–255 rounds to an exact byte: that's in, not approximate. */
const EPS = 0.5 / 255
const inGamut = (c: Rgba) => [c.r, c.g, c.b].every(x => x >= -EPS && x <= 1 + EPS)

/** Into sRGB: lower the chroma (same lightness, same hue) until it fits. */
export function toGamut(c: Rgba): { color: Rgba; approx: boolean } {
  if (inGamut(c)) return { color: c, approx: false }
  const [L, C, H] = toOklch(c)
  if (L >= 1) return { color: { r: 1, g: 1, b: 1, a: c.a }, approx: true }
  if (L <= 0) return { color: { r: 0, g: 0, b: 0, a: c.a }, approx: true }
  let lo = 0, hi = C
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(fromOklch(L, mid, H))) lo = mid
    else hi = mid
  }
  return { color: fromOklch(L, lo, H, c.a), approx: true }
}

/** Shortest decimal that keeps `places` decimals: 0.5, 12, 0.875. */
const fixed = (x: number, places: number) => {
  const s = x.toFixed(places).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}
const byte = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255)

export function formatColor(c: Rgba, format: ColorFormat): string {
  if (format === 'oklch') {
    const [L, C, H] = toOklch(c)
    /* Grey has no hue; write 0 rather than a meaningless angle. */
    const grey = C < 0.0002
    const a = c.a < 1 ? ` / ${fixed(c.a, 3)}` : ''
    return `oklch(${fixed(L * 100, 2)}% ${grey ? 0 : fixed(C, 5)} ${grey ? 0 : fixed(H, 2)}${a})`
  }
  const { color, approx } = toGamut(c)
  const mark = approx ? '≈' : ''
  const [r, g, b] = [color.r, color.g, color.b].map(byte)
  if (format === 'rgb') {
    return color.a < 1 ? `${mark}rgba(${r}, ${g}, ${b}, ${fixed(color.a, 3)})` : `${mark}rgb(${r}, ${g}, ${b})`
  }
  const h2 = (x: number) => x.toString(16).padStart(2, '0').toUpperCase()
  let out = `#${h2(r)}${h2(g)}${h2(b)}`
  if (color.a < 1) out += h2(Math.round(color.a * 255))
  /* #FFFFFF → #FFF, as people write it. */
  out = out.replace(/^#([0-9A-F])\1([0-9A-F])\2([0-9A-F])\3(?:([0-9A-F])\4)?$/, (_, x, y, z, w) => `#${x}${y}${z}${w ?? ''}`)
  return mark + out
}

/** One colour written another way; anything it can't read comes back as it was. */
export function convertColor(text: string, format: ColorFormat): string {
  const c = parseColor(text)
  return c ? formatColor(c, format) : text
}
