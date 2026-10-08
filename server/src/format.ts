/* The comment format — the one thing the page and Claude both depend on.
 *
 * Inspeck reaches this server two ways, from inside an app and from the
 * Chrome extension, and both must send exactly this shape. As long as they
 * do, either one can be redesigned freely and nothing on this side notices.
 *
 * The same file renders comments back out as text for Claude, so the words
 * Claude reads — Fix and Reference, Text, Color and Spacing, "raw → nearest"
 * — are defined once, here, and match what the person saw on the page.
 */
import { z } from 'zod'

export const KINDS = ['fix', 'reference'] as const
export type Kind = (typeof KINDS)[number]

/* new → seen → resolved | dismissed. "Seen" means Claude has read it, so the
   badge can say Claude is on it rather than leave the person wondering. */
export type Status = 'new' | 'seen' | 'resolved' | 'dismissed'

/* The groups match the extension's modes. "other" catches radius, shadow and
   whatever else a measurement returns, rather than inventing more headings. */
export const GROUPS = ['text', 'color', 'spacing', 'other'] as const

const Measurement = z.object({
  group: z.enum(GROUPS),
  /** e.g. "padding-left", "gap", "font", "color", "border-radius". */
  property: z.string().max(80),
  /** As the browser resolved it: "13px", "14px / 500 / 20px", "#101828". */
  value: z.string().max(200),
  /** On a fix, the token this value matches or is nearest to. On a reference,
      the equivalent in your own system. */
  token: z.string().max(120).optional(),
  /** Fix only: true when the value is the token itself, false when it is raw. */
  onSystem: z.boolean().optional(),
  /** Anything worth saying that the fields can't: "near-identical",
      "no token of yours matches". */
  note: z.string().max(200).optional(),
})
export type Measurement = z.infer<typeof Measurement>

const CssLine = z.object({
  property: z.string().max(60),
  value: z.string().max(300),
  resolved: z.string().max(160).optional(),
})
export type CssLine = z.infer<typeof CssLine>

/** What a page sends when someone places a comment. */
export const NewComment = z.object({
  kind: z.enum(KINDS).optional(),
  note: z.string().max(4000),
  page: z.string().url().max(2000),
  element: z.object({
    selector: z.string().max(1000),
    tag: z.string().max(40).optional(),
    text: z.string().max(300).optional(),
    /** React component names, outermost first. */
    trail: z.array(z.string().max(120)).max(12).optional(),
    /** How the widget labels it, e.g. `button.btn-primary`. */
    name: z.string().max(200).optional(),
    /** For an element inside a menu or popover: the buttons that open it, e.g. "More › Share". */
    within: z.string().max(300).optional(),
    /** Selector of the outermost of those buttons. */
    anchor: z.string().max(1000).optional(),
  }),
  /** Document coordinates of the badge, so every page draws it in the same place. */
  at: z.object({ x: z.number(), y: z.number() }).optional(),
  /** The element's box in document coordinates when the note was placed. */
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  measured: z.array(Measurement).max(40).optional(),
  /** The element's key declarations as the code writes them, with the resolved value. */
  css: z.array(CssLine).max(16).optional(),
  /** What sent it: the in-page widget or the extension, and its version. */
  client: z.object({ name: z.string().max(40), version: z.string().max(20) }).optional(),
  /** A data URL. The server writes it to disk and keeps only the path. */
  screenshot: z.string().max(4_500_000).optional(),
})
export type NewComment = z.infer<typeof NewComment>

export interface Message {
  from: 'you' | 'claude'
  text: string
  at: string
}

export interface Comment {
  id: string
  /** Numbers restart per page, because they are read against one screen. */
  n: number
  kind: Kind
  status: Status
  note: string
  page: string
  createdAt: string
  element: NewComment['element']
  at?: { x: number; y: number }
  rect?: { x: number; y: number; w: number; h: number }
  measured: Measurement[]
  css?: CssLine[]
  client?: { name: string; version: string }
  /** Absolute path to the PNG on this machine. */
  screenshot?: string
  thread: Message[]
  /** Why it was closed: Claude's summary on resolve, its reason on dismiss. */
  outcome?: { summary: string; at: string }
}

/* ------------------------------------------------------------------------ */

/**
 * Whether an address can only be this machine: loopback, and the dev domains
 * that resolve to it. Pages here may send notes without being named, because
 * nothing else on the network can serve them. Notes become text a Claude
 * session reads, so the default stays this narrow; LAN and staging addresses
 * are opted in through INSPECK_ALLOWED_ORIGINS.
 */
export function isThisMachine(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' ||
    host.endsWith('.localhost') || host.endsWith('.test')
}

/**
 * Whether an address only exists on a developer's machine or network: this
 * machine, plus `.local` names and private IPs such as the "Network" URL a dev
 * server prints. Used to tell your own app from someone else's site.
 */
export function isLocalHost(host: string): boolean {
  return isThisMachine(host) || host.endsWith('.local') ||
    /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

/**
 * Whether a page is your own app or someone else's site.
 *
 * Addresses that only exist on a developer's machine are fixes. Everything
 * else is a reference, because on a public site you are not going to change
 * anything — you are taking notes. The page can always say otherwise.
 */
export function kindFor(page: string): Kind {
  let host: string
  try { host = new URL(page).hostname } catch { return 'fix' }
  return isLocalHost(host) ? 'fix' : 'reference'
}

/** A page as people say it: no scheme, no trailing slash, no fragment. */
export function pageLabel(page: string): string {
  try {
    const u = new URL(page)
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return `${u.host}${path}${u.search}`
  } catch {
    return page
  }
}

/** The key comments are grouped and numbered by — the page without its fragment. */
export function pageKey(page: string): string {
  try {
    const u = new URL(page)
    u.hash = ''
    return u.toString()
  } catch {
    return page
  }
}

const KIND_LABEL: Record<Kind, string> = { fix: 'Fix', reference: 'Reference' }

/* Properties whose group already says what they are. "text 14px / 500 / 20px"
   reads fine; "text font 14px / 500 / 20px" says the same thing twice. */
const IMPLIED = new Set(['font', 'text', 'type', 'color'])

function verdict(m: Measurement, kind: Kind): string {
  const extra = m.note ? `, ${m.note}` : ''
  if (kind === 'reference') {
    if (m.token) return `→ your ${m.token}${extra}`
    return m.note ?? 'no token of yours matches'
  }
  if (m.onSystem && m.token) return `${m.token} ✓${extra}`
  if (m.onSystem === false && m.token) return `raw → nearest ${m.token}${extra}`
  if (m.onSystem === false) return `raw${extra}`
  return m.note ?? ''
}

function measuredLine(m: Measurement, kind: Kind): string {
  const what = IMPLIED.has(m.property) ? m.value : `${m.property} ${m.value}`
  const v = verdict(m, kind)
  return row(m.group, v ? `${what}   ${v}` : what)
}

const row = (label: string, value: string) => `${label.padEnd(8)} ${value}`

/** The line a person reads a comment by: "Fix 2 · localhost:5173/v2/conversations". */
export function heading(c: Comment): string {
  return `${KIND_LABEL[c.kind]} ${c.n} · ${pageLabel(c.page)}`
}

/**
 * One comment, in full, as Claude reads it.
 *
 * Laid out like the comment card on the page: the note first because that is
 * what a person wrote, then where the element is, then what was measured.
 */
export function render(c: Comment): string {
  const lines: string[] = [heading(c), c.note.trim() || '(no note)', '']

  const where = [c.element.name && c.element.name !== c.element.selector ? `${c.element.name}  (${c.element.selector})` : c.element.selector]
  if (c.element.text) where.push(`"${c.element.text}"`)
  lines.push(row('where', where.join(' · ')))
  if (c.element.within) lines.push(row('inside', `${c.element.within} (closed now? open it from ${c.element.anchor ?? 'the page'})`))
  if (c.element.trail?.length) lines.push(row('source', c.element.trail.join(' › ')))
  for (const l of c.css ?? []) {
    lines.push(row('css', `${l.property}: ${l.value};${l.resolved ? `   ${l.resolved}` : ''}`))
  }

  for (const group of GROUPS) {
    for (const m of c.measured.filter(x => x.group === group)) lines.push(measuredLine(m, c.kind))
  }

  if (c.screenshot) lines.push(row('shot', 'attached'))

  if (c.thread.length) {
    lines.push('')
    for (const msg of c.thread) lines.push(`${msg.from === 'you' ? 'you' : 'claude'}: ${msg.text}`)
  }

  lines.push('', `id ${c.id} · ${c.status}`)
  return lines.join('\n')
}

/** One line per comment, for a list. */
export function summaryLine(c: Comment): string {
  const note = c.note.trim() || '(no note)'
  const short = note.length > 64 ? note.slice(0, 63) + '…' : note
  return `  ${String(c.n).padStart(2)}  ${KIND_LABEL[c.kind].padEnd(9)} ${short}   · ${c.status} · id ${c.id}`
}
