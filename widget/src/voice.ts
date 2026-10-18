/* Voice for notes, from the page's side.
 *
 * The plugin's server does the listening (the Claude app's browser won't let a
 * page use the microphone): this starts a session there and reads what it sends
 * back, a line at a time: getting ready, listening, how loud, the words so far,
 * and finally all of them. stop() finishes the last words; cancel() drops them.
 */
import { api } from './api'
import { SERVER } from './env'
import { nativeFetch } from './native'

export type VoiceEvent =
  | { type: 'loading'; what: 'mic' | 'model'; progress?: number }
  | { type: 'listening' }
  | { type: 'level'; value: number }
  | { type: 'text'; final: string; partial: string }
  | { type: 'done'; text: string }
  | { type: 'error'; code: string; message: string }
  /** Another note started listening, so this one stopped: what it heard stays. */
  | { type: 'ended'; reason: string }

let known: boolean | undefined
let asking: Promise<boolean> | null = null

/** Whether voice works on this machine. Asked once; until the answer comes, no. */
export function voiceReady(): boolean { return known === true }
export function checkVoice(): Promise<boolean> {
  asking ??= api.voice().then(v => (known = v.available), () => (known = false))
  return asking
}

/** A note opened (or a session ended) with the mic there: have the next start be quick. */
export function warmVoice(): void {
  if (known) void api.warmVoice().catch(() => {})
}

export interface Listening { stop(): void; cancel(): void }

export function listen(on: (e: VoiceEvent) => void): Listening {
  const ctrl = new AbortController()
  let over = false
  const finish = (e: VoiceEvent) => { if (!over) { over = e.type === 'done' || e.type === 'error' || e.type === 'ended'; on(e) } }
  void (async () => {
    try {
      const res = await nativeFetch(`${SERVER}/voice/listen`, { method: 'POST', credentials: 'omit', headers: { 'x-inspeck': '1' }, signal: ctrl.signal })
      if (!res.ok || !res.body) throw new Error(`Inspeck answered ${res.status}`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let rest = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        rest += value
        let i: number
        while ((i = rest.indexOf('\n')) >= 0) {
          const line = rest.slice(0, i).trim()
          rest = rest.slice(i + 1)
          if (line) try { finish(JSON.parse(line) as VoiceEvent) } catch { /* half a line */ }
        }
      }
      if (!over && !ctrl.signal.aborted) finish({ type: 'error', code: 'failed', message: 'Listening stopped unexpectedly.' })
    } catch {
      if (!ctrl.signal.aborted) finish({ type: 'error', code: 'offline', message: 'Can’t reach Inspeck to listen. Is a Claude session open?' })
    }
  })()
  return {
    stop: () => { void api.stopVoice().catch(() => {}) },
    cancel: () => { over = true; ctrl.abort() },
  }
}
