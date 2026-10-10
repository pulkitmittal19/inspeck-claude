/* Voice for notes. The page can't always use the microphone (the Claude app's
 * browser doesn't allow it), so this server listens for it: it runs the small
 * native listener (native/listen, built to server/bin/inspeck-listen, outside
 * the dist folder the build cleans) and passes its events to the page as they
 * come, one JSON object per line.
 *
 * Starting is quick because a listener is kept warm: when a note opens, the
 * page asks for one (POST /voice/warm), which loads the speech model and sets up
 * everything but the microphone. Pressing the mic then only opens the mic,
 * about 0.1 s. The mic is never opened before that press, and a warm listener
 * nobody uses goes away on its own.
 *
 * Mac only, macOS 26 or later (Apple's on-device SpeechAnalyzer). One session at
 * a time: a new one ends the last. The page ends it by asking it to stop (the
 * last words are finished first) or by going away (it's cut off at once).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { release } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HELPER = process.env.INSPECK_LISTEN || join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'inspeck-listen')
/** How long a warm listener waits for the mic to be pressed before it goes. */
const WARM_SECONDS = 90

/** Whether this machine can do voice, and if not, why. */
export function voiceAvailable(): { available: boolean; reason?: string } {
  if (process.platform !== 'darwin') return { available: false, reason: 'Voice needs a Mac for now.' }
  /* Darwin 25 is macOS 26, the first with SpeechAnalyzer. */
  if (Number(release().split('.')[0]) < 25) return { available: false, reason: 'Voice needs macOS 26 or later.' }
  if (!existsSync(HELPER)) return { available: false, reason: 'The voice listener isn\'t built (npm run build:listen).' }
  return { available: true }
}

type Event = { type: string; [k: string]: unknown }

/** One run of the listener: its events go to whoever is listening to it now. */
class Listener {
  readonly child: ChildProcess
  ready = false
  on: ((e: Event) => void) | null = null
  constructor(standby: boolean) {
    this.child = spawn(HELPER, standby ? ['--standby', '--wait', String(WARM_SECONDS)] : [], { stdio: ['pipe', 'pipe', 'ignore'] })
    let rest = ''
    this.child.stdout!.setEncoding('utf8')
    this.child.stdout!.on('data', (chunk: string) => {
      rest += chunk
      let i: number
      while ((i = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, i).trim()
        rest = rest.slice(i + 1)
        if (!line) continue
        let e: Event
        try { e = JSON.parse(line) } catch { continue }
        if (e.type === 'ready') { this.ready = true; this.onReady?.() } else this.on?.(e)
      }
    })
    this.child.on('error', () => {})
  }
  onReady: (() => void) | null = null
  get alive() { return this.child.exitCode === null && this.child.signalCode === null }
  say(line: string) { if (this.alive) this.child.stdin?.write(`${line}\n`) }
  kill() { if (this.alive) this.child.kill('SIGTERM') }
}

let warm: Listener | null = null
let current: Listener | null = null

/** Get a listener ready for the next press of the mic, if there isn't one already. */
export function warmVoice(): boolean {
  if (!voiceAvailable().available) return false
  if (warm?.alive) return true
  const l = new Listener(true)
  l.child.on('exit', () => { if (warm === l) warm = null })
  warm = l
  return true
}

/** Stream one listening session to the page: loading, listening, level, text, then done or error. */
export function listenStream(req: IncomingMessage, res: ServerResponse): void {
  const can = voiceAvailable()
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  const out = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n') }
  if (!can.available) { out({ type: 'error', code: 'unsupported', message: can.reason }); res.end(); return }

  /* One microphone, one session. A warm listener if there is one; otherwise one from cold. */
  current?.kill()
  let l: Listener
  if (warm?.alive) { l = warm; warm = null } else l = new Listener(false)
  current = l
  let ended = false
  l.on = e => { out(e); if (e.type === 'done' || e.type === 'error') ended = true }
  if (l.child.stdin && l.ready) l.say('start')
  else l.onReady = () => l.say('start')
  const finish = () => {
    if (current === l) current = null
    if (!ended) out({ type: 'error', code: 'failed', message: 'The voice listener stopped unexpectedly.' })
    res.end()
  }
  if (!l.alive) finish()
  else l.child.on('exit', finish)
  l.child.on('error', err => { out({ type: 'error', code: 'failed', message: `Couldn't start the voice listener: ${err.message}` }); ended = true })
  /* The page went away (or cancelled): stop listening now, no finishing. */
  res.on('close', () => l.kill())
  req.on('aborted', () => l.kill())
}

/** Finish the current session: the listener stops the mic and settles the last words, then sends done. */
export function stopListening(): boolean {
  if (!current?.alive) return false
  current.say('stop')
  return true
}
