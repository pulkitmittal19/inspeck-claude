/* The inbox, on disk.
 *
 * A file rather than memory, because the server lives only as long as a
 * Claude session and comments must outlive it: you comment with Claude
 * closed, reopen it tomorrow, and they are still there. It is also why two
 * Claude sessions never disagree — neither owns the comments, the file does.
 *
 * Every change is read-modify-write on the whole file, under a lock file so
 * two sessions can't interleave: without it, one session saving a stale copy
 * would erase a comment the other had just added. The write itself is an
 * atomic rename, so a reader never sees half a file and reads need no lock.
 */
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { kindFor, pageKey, type Comment, type Message, type NewComment, type Status } from './format.js'

interface Inbox {
  version: 1
  comments: Comment[]
}

export const HOME = process.env.INSPECK_HOME || join(homedir(), '.inspeck')
const FILE = join(HOME, 'inbox.json')
const SHOTS = join(HOME, 'shots')
const LOCK = join(HOME, 'inbox.lock')

/* A change takes a millisecond or two, so a lock older than this belongs to a
   process that died holding it. */
const STALE_LOCK_MS = 5000

/* Screenshots are capped because one oversized image can crowd everything
   else out of Claude's working memory. A cropped selection is far below this. */
const MAX_SHOT_BYTES = 3 * 1024 * 1024

export function inboxPath(): string {
  return FILE
}

function ensureDirs(): void {
  mkdirSync(SHOTS, { recursive: true })
}

export function read(): Inbox {
  if (!existsSync(FILE)) return { version: 1, comments: [] }
  const raw = readFileSync(FILE, 'utf8')
  try {
    const parsed = JSON.parse(raw) as Inbox
    if (!Array.isArray(parsed.comments)) throw new Error('no comments array')
    return parsed
  } catch {
    /* Never silently start over on top of someone's comments: keep the
       unreadable file beside the new one, so nothing is lost for good. */
    ensureDirs()
    renameSync(FILE, join(HOME, `inbox.unreadable-${Date.now()}.json`))
    return { version: 1, comments: [] }
  }
}

function write(inbox: Inbox): void {
  ensureDirs()
  const tmp = `${FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(inbox, null, 2))
  renameSync(tmp, FILE)
}

const pause = new Int32Array(new SharedArrayBuffer(4))

/* Creating the lock file with 'wx' fails if it exists, which makes taking it
   atomic across processes. Waiting blocks, like the rest of the store: the
   holder is only ever a few synchronous calls away from letting go. */
function locked<T>(fn: () => T): T {
  ensureDirs()
  for (;;) {
    try {
      closeSync(openSync(LOCK, 'wx'))
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > STALE_LOCK_MS) rmSync(LOCK, { force: true })
      } catch { /* let go between the two calls; try again */ }
      Atomics.wait(pause, 0, 0, 2)
    }
  }
  try { return fn() } finally { rmSync(LOCK, { force: true }) }
}

/** Change the inbox and save it in one step. Returns whatever `fn` returns. */
export function change<T>(fn: (inbox: Inbox) => T): T {
  return locked(() => {
    const inbox = read()
    const result = fn(inbox)
    write(inbox)
    return result
  })
}

const newId = () => randomBytes(4).toString('hex')

/* Numbers restart per page. The highest in use plus one, not the count, so
   deleting comment 2 of three can't hand the next one a second number 3. */
function nextNumber(inbox: Inbox, page: string): number {
  const key = pageKey(page)
  const used = inbox.comments.filter(c => pageKey(c.page) === key).map(c => c.n)
  return used.length ? Math.max(...used) + 1 : 1
}

function saveShot(id: string, dataUrl: string): string | undefined {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl)
  if (!m) return undefined
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_SHOT_BYTES) {
    throw new Error(`Screenshot is ${Math.round(bytes.length / 1024)} KB; the limit is ${MAX_SHOT_BYTES / 1024} KB. Crop to the selection.`)
  }
  ensureDirs()
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  const path = join(SHOTS, `${id}.${ext}`)
  writeFileSync(path, bytes)
  return path
}

export function add(input: NewComment, to?: Comment['to']): Comment {
  return change(inbox => {
    const id = newId()
    const comment: Comment = {
      id,
      n: nextNumber(inbox, input.page),
      kind: input.kind ?? kindFor(input.page),
      status: 'new',
      note: input.note.trim(),
      page: pageKey(input.page),
      createdAt: new Date().toISOString(),
      element: input.element,
      ...(input.at ? { at: input.at } : {}),
      ...(input.rect ? { rect: input.rect } : {}),
      ...(input.group ? { group: input.group } : {}),
      ...(input.source?.length ? { source: input.source } : {}),
      measured: input.measured ?? [],
      ...(input.css?.length ? { css: input.css } : {}),
      ...(input.client ? { client: input.client } : {}),
      ...(input.tabId ? { tabId: input.tabId } : {}),
      ...(to ? { to } : {}),
      ...(input.held ? { held: true as const } : {}),
      thread: [],
    }
    if (input.screenshot) {
      const path = saveShot(id, input.screenshot)
      if (path) comment.screenshot = path
    }
    inbox.comments.push(comment)
    return comment
  })
}

export function get(id: string): Comment | undefined {
  return read().comments.find(c => c.id === id)
}

/** Open comments, oldest first, optionally for one page. */
export function open(page?: string): Comment[] {
  const key = page ? pageKey(page) : undefined
  return read().comments
    .filter(c => (c.status === 'new' || c.status === 'seen') && (!key || c.page === key))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Everything on one page, closed ones included — what a page needs to draw its badges. */
export function forPage(page: string): Comment[] {
  const key = pageKey(page)
  return read().comments.filter(c => c.page === key).sort((a, b) => a.n - b.n)
}

/**
 * Claim every comment Claude has not read yet, marking them seen.
 *
 * Claiming happens in one write, so when two Claude sessions are open the
 * first to look takes the comment and the second never gets a duplicate.
 */
export function claimNew(page?: string, mine: (c: Comment) => boolean = () => true): Comment[] {
  const key = page ? pageKey(page) : undefined
  const wanted = (c: Comment) => c.status === 'new' && !c.held && (!key || c.page === key) && mine(c)
  /* Watch calls this every second. Look first without the lock, so an idle
     watch never rewrites the file; the claim itself re-checks under it. */
  if (!read().comments.some(wanted)) return []
  return change(inbox => {
    const claimed = inbox.comments.filter(wanted)
    for (const c of claimed) c.status = 'seen'
    return claimed.map(c => ({ ...c }))
  })
}

/** Give every open note that matches to `to`, in one write. Returns those it moved. */
export function adopt(which: (c: Comment) => boolean, to: NonNullable<Comment['to']>): Comment[] {
  if (!read().comments.some(c => (c.status === 'new' || c.status === 'seen') && which(c))) return []
  return change(inbox => {
    const moved = inbox.comments.filter(c => (c.status === 'new' || c.status === 'seen') && which(c))
    for (const c of moved) c.to = { ...to }
    return moved.map(c => ({ ...c }))
  })
}

/** Mark these as read in one write: their markers leave the page. A held note read this way has been sent. */
export function markAllSeen(ids: string[]): void {
  if (!ids.length) return
  change(inbox => { for (const c of inbox.comments) if (ids.includes(c.id) && c.status === 'new') { c.status = 'seen'; delete c.held } })
}

/** Send held notes: from now on the watcher hands them to Claude. Returns those sent. */
export function release(which: (c: Comment) => boolean): Comment[] {
  const wanted = (c: Comment) => c.status === 'new' && !!c.held && which(c)
  if (!read().comments.some(wanted)) return []
  return change(inbox => {
    const sent = inbox.comments.filter(wanted)
    for (const c of sent) delete c.held
    return sent.map(c => ({ ...c }))
  })
}

export function markSeen(id: string): Comment | undefined {
  return change(inbox => {
    const c = inbox.comments.find(x => x.id === id)
    if (c && c.status === 'new') { c.status = 'seen'; delete c.held }
    return c ? { ...c } : undefined
  })
}

export function close(id: string, status: Extract<Status, 'resolved' | 'dismissed'>, summary: string): Comment | undefined {
  return change(inbox => {
    const c = inbox.comments.find(x => x.id === id)
    if (!c) return undefined
    c.status = status
    c.outcome = { summary, at: new Date().toISOString() }
    return { ...c }
  })
}

export function say(id: string, from: Message['from'], text: string): Comment | undefined {
  return change(inbox => {
    const c = inbox.comments.find(x => x.id === id)
    if (!c) return undefined
    c.thread.push({ from, text, at: new Date().toISOString() })
    /* A reply from the person reopens a closed comment: they are still talking. */
    if (from === 'you' && (c.status === 'resolved' || c.status === 'dismissed')) c.status = 'new'
    return { ...c }
  })
}

export function editNote(id: string, note: string): Comment | undefined {
  return change(inbox => {
    const c = inbox.comments.find(x => x.id === id)
    if (!c) return undefined
    c.note = note.trim()
    return { ...c }
  })
}

/** The person withdrew it. The screenshot goes with it. */
export function remove(id: string): boolean {
  return change(inbox => {
    const i = inbox.comments.findIndex(x => x.id === id)
    if (i === -1) return false
    const [gone] = inbox.comments.splice(i, 1)
    if (gone.screenshot) rmSync(gone.screenshot, { force: true })
    return true
  })
}
