/* Things going wrong around Inspeck's server: a speech helper that dies or can't start, and a chat that ends
 * without stopping it. The server stays up for as long as its chat does, says what happened, and goes with the chat. */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const headers = { 'x-inspeck': '1', origin: 'http://localhost:5173' }
/* A failed test never reaches its own stop, and a server still running would keep this file from ending. */
const started = []
after(() => { for (const kid of started) kid.kill() })

/** The server as Claude starts it: stdin held open by the chat. `end()` is the chat ending with no goodbye. */
async function start(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-errors-'))
  copyFileSync(join(root, 'server/dist/inspeck.mjs'), join(dir, 'inspeck.mjs'))
  mkdirSync(join(dir, 'widget'))
  copyFileSync(join(root, 'server/dist/widget/inspeck.js'), join(dir, 'widget/inspeck.js'))
  const port = Number(env.INSPECK_PORT) || 48100 + Math.floor(Math.random() * 800)
  const kid = spawn(process.execPath, [join(dir, 'inspeck.mjs')], { cwd: dir, stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, INSPECK_HOME: join(dir, 'home'), INSPECK_PORT: String(port), INSPECK_LATEST_URL: 'off', CLAUDE_PLUGIN_ROOT: '', ...env } })
  started.push(kid)
  let said = ''
  kid.stderr.on('data', d => { said += d })
  const up = async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) })).ok } catch { return false } }
  for (let i = 0; i < 50 && !await up(); i++) await new Promise(r => setTimeout(r, 100))
  const exited = new Promise(r => kid.once('exit', () => r(true)))
  return {
    dir, port, up, exited,
    said: () => said,
    listen: () => fetch(`http://127.0.0.1:${port}/voice/listen`, { method: 'POST', headers, signal: AbortSignal.timeout(6000) }),
    end: () => kid.stdin.end(),
    stop: () => { kid.kill(); rmSync(dir, { recursive: true, force: true }) },
  }
}
function helper(body, mode = 0o755) {
  const file = join(mkdtempSync(join(tmpdir(), 'inspeck-helper-')), 'listen.cjs')
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(file, mode)
  return file
}
const ready = `console.log(JSON.stringify({ type: 'ready' }))`

test('a speech helper whose input has closed: the page is told, and Inspeck stays up (writing to it must not end the server)', async () => {
  const s = await start({ INSPECK_LISTEN: helper(`require('node:fs').closeSync(0); setTimeout(() => { ${ready}; setTimeout(() => process.exit(0), 800) }, 300)`) })
  const said = await (await s.listen()).text()
  assert.match(said, /stopped unexpectedly/)
  await new Promise(r => setTimeout(r, 300))
  assert.equal(await s.up(), true, 'still answering')
  s.stop()
})

test('a speech helper that dies at once, or as soon as it\'s ready: the page is told, and Inspeck stays up', async () => {
  for (const body of ['process.exit(1)', `${ready}; process.exit(1)`]) {
    const s = await start({ INSPECK_LISTEN: helper(body) })
    assert.match(await (await s.listen()).text(), /"type":"error"/)
    assert.equal(await s.up(), true)
    s.stop()
  }
})

test('a speech helper that can\'t start: the page is told why, and the session ends (an open connection would use up the page\'s few)', async () => {
  const s = await start({ INSPECK_LISTEN: helper('x', 0o644) })
  assert.match(await (await s.listen()).text(), /Couldn't start the voice listener/)
  assert.equal(await s.up(), true)
  s.stop()
})

test('a chat waiting for the port leaves nothing behind from its tries: when it gets the port, it says so once (each leftover would run then, and hold memory until then)', async () => {
  const first = await start()
  const waiting = await start({ INSPECK_PORT: String(first.port) })
  /* Long enough for a second try, which also fails. */
  await new Promise(r => setTimeout(r, 6000))
  first.stop()
  const listening = () => waiting.said().match(/Listening for comments/g)?.length ?? 0
  for (let i = 0; i < 100 && !listening(); i++) await new Promise(r => setTimeout(r, 100))
  await new Promise(r => setTimeout(r, 300))
  assert.equal(listening(), 1)
  waiting.stop()
})

test('a chat that ends without stopping its Inspeck (a crash, a force-quit): stdin closes, and it goes, freeing the port', async () => {
  const s = await start()
  assert.equal(await s.up(), true)
  s.end()
  assert.equal(await Promise.race([s.exited, new Promise(r => setTimeout(() => r(false), 4000))]), true, 'it exited')
  assert.equal(await s.up(), false, 'the port is free')
  s.stop()
})
