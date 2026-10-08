/* Talking to the Inspeck server that served this script. */
import { SERVER, TAB_ID, VERSION } from './env'

export interface CssLine { property: string; value: string; resolved?: string }

export interface NoteIn {
  note: string
  page: string
  element: { selector: string; tag: string; text?: string; trail?: string[]; name?: string; within?: string; anchor?: string }
  at: { x: number; y: number }
  rect: { x: number; y: number; w: number; h: number }
  css: CssLine[]
}

export interface Note {
  id: string
  n: number
  note: string
  page: string
  status: 'new' | 'seen' | 'resolved' | 'dismissed'
  element: NoteIn['element']
  at?: { x: number; y: number }
  rect?: NoteIn['rect']
  createdAt: string
}

export class ApiError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVER}${path}`, {
      method,
      credentials: 'omit',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Can’t reach Inspeck. Is a Claude session open?')
  }
  const data = await res.json().catch(() => ({})) as { error?: string } & T
  if (!res.ok) throw new ApiError(data.error ?? `Inspeck answered ${res.status}`)
  return data
}

export const api = {
  async add(n: NoteIn): Promise<Note> {
    const r = await call<{ comment: Note }>('POST', '/comments', { ...n, tabId: TAB_ID, client: { name: 'widget', version: VERSION } })
    return r.comment
  },
  async list(page: string): Promise<Note[]> {
    const r = await call<{ comments: Note[] }>('GET', `/comments?page=${encodeURIComponent(page)}`)
    return r.comments
  },
  async edit(id: string, note: string): Promise<Note> {
    return (await call<{ comment: Note }>('PATCH', `/comments/${id}`, { note })).comment
  },
  /** Claude, from its own browser pane: send this tab's notes to my session. */
  async bind(token: string): Promise<{ project: string }> {
    return call<{ project: string }>('POST', '/bind', { tabId: TAB_ID, token })
  },
  async remove(id: string): Promise<void> {
    await call('DELETE', `/comments/${id}`)
  },
}
