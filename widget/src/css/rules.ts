/* An index of every style rule on the page, so we can ask "which rules apply
 * to this element?" without testing thousands of selectors.
 *
 * getComputedStyle tells you a value but not how it was written: it has
 * already replaced var(--radius-200) with 8px. To show the CSS the way the
 * code writes it, we read the authored declarations from the stylesheets
 * (the CSSOM keeps var() text) and work out which one wins.
 *
 * Rules are bucketed by the rightmost part of their selector (an id, a class,
 * a tag, or *), the same trick browsers use, so a lookup only tests the few
 * dozen rules that could possibly match.
 */

export interface Branch { text: string; spec: number }

export interface RuleEntry {
  style: CSSStyleDeclaration
  branches: Branch[]
  /** Source order across the whole page. Later wins at equal specificity. */
  order: number
  /** Cascade layer rank: higher wins for normal declarations. Unlayered is highest. */
  layer: number
  /** @media / @supports conditions that must hold for the rule to apply. */
  conds: Array<CSSMediaRule | CSSSupportsRule>
}

const UNLAYERED = 1e6

/* ---------------- selector parsing ---------------- */

/** Split at top-level commas: `a, :is(b, c)` → [`a`, `:is(b, c)`]. */
export function splitList(sel: string): string[] {
  const out: string[] = []
  let depth = 0, start = 0, quote = ''
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]
    if (quote) { if (ch === quote && sel[i - 1] !== '\\') quote = ''; continue }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '\\') i++
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) { out.push(sel.slice(start, i).trim()); start = i + 1 }
  }
  out.push(sel.slice(start).trim())
  return out.filter(Boolean)
}

/** How many characters an escape takes from a backslash at i: a hex escape with the space that may end it
    (Tailwind's `.\\32 xl\\:p-4` is the class `2xl:p-4`), or the one character after it. */
function escapeLength(sel: string, i: number): number {
  const hex = /^[0-9a-fA-F]{1,6}[ \t\n]?/.exec(sel.slice(i + 1))
  return 1 + (hex ? hex[0].length : 1)
}

/** The last compound selector: `.card > .btn:hover` → `.btn:hover`. Read forwards, so escapes are whole. */
export function rightmost(sel: string): string {
  let depth = 0, start = 0
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i]
    if (ch === '\\') { i += escapeLength(sel, i) - 1; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) start = i + 1
  }
  return sel.slice(start).trim()
}

const unescape = (s: string) => s.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, c: string) =>
  /^[0-9a-fA-F]/.test(c) && c.trim().length > 1 ? String.fromCodePoint(parseInt(c, 16)) : c)

/**
 * Where a selector lives in the index: id, then a class, then the tag, else *. Read a character at a
 * time, so an escaped character is part of a name: Tailwind's `.bg-\[\#e0f2fe\]` is the class
 * `bg-[#e0f2fe]`, not a class `bg-` and an id `e0f2fe]`. Names inside [attributes] and :pseudo(…)
 * arguments don't count.
 */
export function bucketOf(sel: string): string {
  const c = rightmost(sel)
  let id = '', cls = ''
  let depth = 0
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]
    if (ch === '\\') { i += escapeLength(c, i) - 1; continue }
    if (ch === '(' || ch === '[') { depth++; continue }
    if (ch === ')' || ch === ']') { depth--; continue }
    if (depth || (ch !== '#' && ch !== '.')) continue
    let j = i + 1
    while (j < c.length && (c[j] === '\\' || /[\w\-\u00A0-\uFFFF]/.test(c[j]))) j += c[j] === '\\' ? escapeLength(c, j) : 1
    const name = unescape(c.slice(i + 1, j))
    if (ch === '#' && !id) id = name
    if (ch === '.' && !cls) cls = name
    i = j - 1
  }
  if (id) return `#${id}`
  if (cls) return `.${cls}`
  const tag = /^([a-zA-Z][\w-]*)/.exec(c)
  if (tag) return tag[1].toLowerCase()
  return '*'
}

/** Specificity packed into one number: ids × 10⁶ + classes × 10³ + types. */
export function specificity(sel: string): number {
  let a = 0, b = 0, c = 0
  let s = sel
  /* :where() counts for nothing; :is/:not/:has count as their heaviest argument. */
  s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '')
  s = s.replace(/:(is|not|has|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_, _n, args: string) => {
    const best = Math.max(0, ...splitList(args).map(specificity))
    a += Math.floor(best / 1e6); b += Math.floor((best % 1e6) / 1e3); c += best % 1e3
    return ''
  })
  s = s.replace(/\\./g, 'x').replace(/"[^"]*"|'[^']*'/g, '')
  a += (s.match(/#[\w-]+/g) ?? []).length
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g) ?? []).length
  c += (s.replace(/:[\w-]+(\([^)]*\))?/g, '').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length
  c += (s.match(/::[\w-]+/g) ?? []).length
  return a * 1e6 + b * 1e3 + c
}

/* ---------------- the index ---------------- */

export interface RuleIndex {
  buckets: Map<string, RuleEntry[]>
  /** A cheap fingerprint of the page's CSS; when it changes, rebuild. */
  signature: string
}

function sheetsOf(root: Document | ShadowRoot): CSSStyleSheet[] {
  return [...Array.from(root.styleSheets), ...(root.adoptedStyleSheets ?? [])]
}

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try { return sheet.cssRules } catch { return null }   /* cross-origin: unreadable */
}

/* ---------------- stylesheets the page can't read ----------------
 *
 * A stylesheet from another server, sent without CORS (most CDNs), keeps its rules from the page's code.
 * Left out, the card shows a rule it can read in place of the one that wins. So the plugin fetches it
 * (it isn't a web page, so no such limit), and its rules take the same place in the page's order. */

const borrowed = new Map<string, CSSStyleSheet | 'asking' | 'failed'>()
let borrowedVersion = 0
let fetchSheet: ((href: string) => Promise<string>) | null = null

/** How to fetch a stylesheet the page can't read (the plugin's /css). */
export function borrowSheetsWith(fetcher: (href: string) => Promise<string>): void { fetchSheet = fetcher }

/** The rules of a sheet the page can't read, once fetched; until then null, and the fetch is on its way. */
function borrowedRules(sheet: CSSStyleSheet): CSSRuleList | null {
  const href = sheet.href
  if (!href || !fetchSheet) return null
  const got = borrowed.get(href)
  if (got instanceof CSSStyleSheet) return got.cssRules
  if (!got) {
    borrowed.set(href, 'asking')
    fetchSheet(href).then(text => {
      const copy = new CSSStyleSheet({ baseURL: href } as CSSStyleSheetInit)
      copy.replaceSync(text)
      borrowed.set(href, copy)
    }).catch(() => { borrowed.set(href, 'failed') }).finally(() => { borrowedVersion++ })
  }
  return null
}

/** A sheet's rules, borrowed if the page can't read them itself. */
function readableRules(sheet: CSSStyleSheet): CSSRuleList | null {
  return rulesOf(sheet) ?? borrowedRules(sheet)
}

/** Whether some of the page's CSS is out of reach still (not fetched, or couldn't be). */
export function unreadableCss(root: Document | ShadowRoot): boolean {
  return sheetsOf(root).some(s => !readableRules(s))
}

export function signatureOf(root: Document | ShadowRoot): string {
  let n = 0, parts = 0
  for (const s of sheetsOf(root)) {
    parts++
    n += rulesOf(s)?.length ?? 0
  }
  return `${parts}:${n}:${borrowedVersion}`
}

export function buildIndex(root: Document | ShadowRoot, skip?: CSSStyleSheet): RuleIndex {
  const buckets = new Map<string, RuleEntry[]>()
  const layerRank = new Map<string, number>()
  let order = 0

  const rankOf = (name: string) => {
    if (!layerRank.has(name)) layerRank.set(name, layerRank.size)
    return layerRank.get(name)!
  }

  const add = (rule: CSSStyleRule, selector: string, layer: number, conds: RuleEntry['conds']) => {
    const branches = splitList(selector)
      .filter(b => !b.includes('::'))           /* pseudo-elements aren't the element */
      .map(text => ({ text, spec: specificity(text) }))
    if (!branches.length) return
    const entry: RuleEntry = { style: rule.style, branches, order: order++, layer, conds }
    const keys = new Set(branches.map(b => bucketOf(b.text)))
    for (const k of keys) {
      const list = buckets.get(k)
      if (list) list.push(entry)
      else buckets.set(k, [entry])
    }
  }

  const walk = (list: CSSRuleList, layer: string | null, conds: RuleEntry['conds'], parentSel: string | null) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        const sel = parentSel ? resolveNesting(rule.selectorText, parentSel) : rule.selectorText
        add(rule, sel, layer == null ? UNLAYERED : rankOf(layer), conds)
        if (rule.cssRules?.length) walk(rule.cssRules, layer, conds, sel)
      } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, layer, [...conds, rule], parentSel)
      } else if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
        const name = layer ? `${layer}.${rule.name || `anon${order}`}` : (rule.name || `anon${order}`)
        rankOf(name)
        walk(rule.cssRules, name, conds, parentSel)
      } else if (typeof CSSLayerStatementRule !== 'undefined' && rule instanceof CSSLayerStatementRule) {
        for (const n of rule.nameList) rankOf(layer ? `${layer}.${n}` : n)
      } else if (rule instanceof CSSImportRule) {
        const inner = rule.styleSheet && readableRules(rule.styleSheet)
        const name = (rule as CSSImportRule & { layerName?: string | null }).layerName
        if (inner) walk(inner, name != null ? (layer ? `${layer}.${name}` : name || `anon${order}`) : layer, conds, parentSel)
      } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        /* @container, @scope, @document… — approximate: treat as applying. */
        walk((rule as CSSGroupingRule).cssRules, layer, conds, parentSel)
      }
    }
  }

  for (const sheet of sheetsOf(root)) {
    if (sheet === skip) continue
    const list = readableRules(sheet)
    if (list) walk(list, null, [], null)
  }
  return { buckets, signature: signatureOf(root) }
}

/** `&:hover` inside `.btn` → `:is(.btn):hover`; a bare `span` inside `.btn` → `:is(.btn) span`. */
function resolveNesting(sel: string, parent: string): string {
  return splitList(sel).map(b => b.includes('&') ? b.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${b}`).join(', ')
}

export function conditionsHold(conds: RuleEntry['conds']): boolean {
  for (const c of conds) {
    if (c instanceof CSSMediaRule) {
      if (!window.matchMedia(c.media.mediaText).matches) return false
    } else if (!CSS.supports(c.conditionText)) return false
  }
  return true
}

/** Rules that apply to the element right now, each with the specificity of its matching branch. */
export function matchingRules(index: RuleIndex, el: Element): Array<{ entry: RuleEntry; spec: number }> {
  const keys = ['*', el.tagName.toLowerCase()]
  if (el.id) keys.push(`#${el.id}`)
  for (const c of Array.from(el.classList)) keys.push(`.${c}`)
  const seen = new Set<RuleEntry>()
  const out: Array<{ entry: RuleEntry; spec: number }> = []
  for (const k of keys) {
    for (const entry of index.buckets.get(k) ?? []) {
      if (seen.has(entry)) continue
      seen.add(entry)
      let best = -1
      for (const b of entry.branches) {
        if (b.spec <= best) continue
        try { if (el.matches(b.text)) best = b.spec } catch { /* selector this browser can't evaluate */ }
      }
      if (best >= 0 && conditionsHold(entry.conds)) out.push({ entry, spec: best })
    }
  }
  return out
}

export { UNLAYERED }
