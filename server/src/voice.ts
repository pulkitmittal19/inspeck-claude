/* Voice for notes. The page can't always use the microphone (the Claude app's
 * browser doesn't allow it), so this server listens for it: it runs the small
 * native listener (native/listen, built to server/bin/inspeck-listen, outside
 * the dist folder the build cleans) and passes
 * its events to the page as they come, one JSON object per line.
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

/** Whether this machine can do voice, and if not, why. */
export function voiceAvailable(): { available: boolean; reason?: string } {
  if (process.platform !== 'darwin') return { available: false, reason: 'Voice needs a Mac for now.' }
  /* Darwin 25 is macOS 26, the first with SpeechAnalyzer. */
  if (Number(release().split('.')[0]) < 25) return { available: false, reason: 'Voice needs macOS 26 or later.' }
  if (!existsSync(HELPER)) return { available: false, reason: 'The voice listener isn\'t built (npm run build:listen).' }
  return { available: true }
}

let current: ChildProcess | null = null

/** Stream one listening session to the page: loading, listening, level, text, then done or error. */
export function listenStream(req: IncomingMessage, res: ServerResponse): void {
  const can = voiceAvailable()
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  const out = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n') }
  if (!can.available) { out({ type: 'error', code: 'unsupported', message: can.reason }); res.end(); return }

  /* One microphone, one session. */
  current?.kill('SIGTERM')
  const child = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  current = child
  let rest = ''
  let ended = false
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    rest += chunk
    let i: number
    while ((i = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, i).trim()
      rest = rest.slice(i + 1)
      if (!line) continue
      try { const ev = JSON.parse(line); out(ev); if (ev.type === 'done' || ev.type === 'error') ended = true } catch { /* not ours */ }
    }
  })
  child.on('error', err => { out({ type: 'error', code: 'failed', message: `Couldn't start the voice listener: ${err.message}` }); ended = true })
  child.on('exit', () => {
    if (current === child) current = null
    if (!ended) out({ type: 'error', code: 'failed', message: 'The voice listener stopped unexpectedly.' })
    res.end()
  })
  /* The page went away (or cancelled): stop listening now, no finishing. */
  res.on('close', () => { if (child.exitCode === null) child.kill('SIGTERM') })
  req.on('aborted', () => { if (child.exitCode === null) child.kill('SIGTERM') })
}

/** Finish the current session: the listener stops the mic and settles the last words, then sends done. */
export function stopListening(): boolean {
  if (!current || current.exitCode !== null) return false
  current.stdin?.write('stop\n')
  return true
}
