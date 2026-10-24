/* Starting with whatever Node the Mac has: the launcher Claude Code runs (server/bin/inspeck), and the check
 * at the start of a chat that says, in plain words, when there's no Node new enough. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAUNCHER = join(root, 'server/bin/inspeck')
/** The launcher as Claude Code runs it, on a Mac with none of the usual places (LOOK replaces them). */
const run = (args, { look = '', env = {} } = {}) => spawnSync('sh', [LAUNCHER, ...args], {
  encoding: 'utf8',
  env: { HOME: join(tmpdir(), 'inspeck-no-home'), PATH: '/usr/bin:/bin', INSPECK_NODE_LOOK: look, ...env },
})

/** A fake `node` that says it's this version. */
function fakeNode(version) {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-node-'))
  writeFileSync(join(dir, 'node'), `#!/bin/sh\nif [ "$1" = -e ]; then printf ${version}; fi\n`)
  chmodSync(join(dir, 'node'), 0o755)
  return join(dir, 'node')
}

test('the launcher finds a Node new enough, even in a folder with spaces, and runs with it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inspeck-fnm-'))
  const place = join(dir, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin')
  mkdirSync(place, { recursive: true })
  symlinkSync(process.execPath, join(place, 'node'))
  const old = fakeNode(18)
  const r = run(['--which'], { look: `${old}\n${join(place, 'node')}` })
  assert.equal(r.stdout.trim(), join(place, 'node'), 'past an old one, to one new enough')
  const ran = run(['-e', 'process.stdout.write("ran " + process.versions.node.split(".")[0])'], { look: join(place, 'node') })
  assert.match(ran.stdout, /^ran \d+$/)
  assert.ok(Number(ran.stdout.split(' ')[1]) >= 20)
  rmSync(dir, { recursive: true, force: true })
})

test('INSPECK_NODE names the Node to use', () => {
  assert.equal(run(['--which'], { env: { INSPECK_NODE: process.execPath } }).stdout.trim(), process.execPath)
})

test('no Node at all: the chat is told in plain words, and Claude is asked to offer to help', () => {
  const r = run(['--check'])
  assert.equal(r.status, 0, 'a check that finds a problem still runs fine')
  const said = JSON.parse(r.stdout)
  assert.match(said.systemMessage, /Inspeck needs Node\.js 20 or later, and it isn't installed on this Mac\. Install it with .+, then start a new chat\./)
  assert.equal(said.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(said.hookSpecificOutput.additionalContext, /offer to install it .*ask before running anything/)
  const started = run([join(root, 'server/dist/inspeck.mjs')])
  assert.equal(started.status, 1)
  assert.match(started.stderr, /Node\.js 20 or later is needed and wasn't found/)
})

test('only an old Node: the message names it', () => {
  const r = run(['--check'], { look: fakeNode(18) })
  assert.match(JSON.parse(r.stdout).systemMessage, /an older one: .*\(Node 18\)/)
})

test('a Node new enough: the check says nothing', () => {
  const r = run(['--check'], { look: process.execPath })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('Claude Code starts the server through the launcher, and the check runs when a chat starts', () => {
  const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.inspeck
  assert.equal(mcp.command, 'sh')
  assert.deepEqual(mcp.args, ['${CLAUDE_PLUGIN_ROOT}/server/bin/inspeck', '${CLAUDE_PLUGIN_ROOT}/server/dist/inspeck.mjs'])
  const hooks = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf8')).hooks.SessionStart[0]
  assert.equal(hooks.matcher, 'startup')
  assert.equal(hooks.hooks[0].command, 'sh "${CLAUDE_PLUGIN_ROOT}/server/bin/inspeck" --check')
})

test('started the way .mcp.json says, from a plugin folder with a space in its path, the server answers, and the watcher runs on the same Node', async () => {
  const plugin = join(mkdtempSync(join(tmpdir(), 'inspeck plugin ')), 'inspeck')
  cpSync(join(root, 'server/bin'), join(plugin, 'server/bin'), { recursive: true })
  cpSync(join(root, 'server/dist'), join(plugin, 'server/dist'), { recursive: true })
  const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.inspeck
  const client = new Client({ name: 'test-claude', version: '0' })
  await client.connect(new StdioClientTransport({
    command: mcp.command,
    args: mcp.args.map(a => a.replace('${CLAUDE_PLUGIN_ROOT}', plugin)),
    env: { HOME: join(tmpdir(), 'inspeck-no-home'), PATH: '/usr/bin:/bin', INSPECK_NODE: process.execPath, INSPECK_HOME: join(plugin, 'home'), INSPECK_PORT: String(49300 + Math.floor(Math.random() * 90)), INSPECK_LATEST_URL: 'off' },
    stderr: 'ignore',
  }))
  const said = client.getInstructions() ?? ''
  await client.close()
  /* (Node names the file by its real path: /var is /private/var on a Mac.) */
  assert.ok(said.includes(`"${process.execPath}" "${join(realpathSync(plugin), 'server/dist/inspeck.mjs')}" wait`), 'the watcher command names the Node to use')
  /* And that command runs as written, even without `node` on the PATH: it starts waiting (stopped here after 2 s). */
  const watcher = spawnSync('sh', ['-c', `exec ${said.match(/"[^"]+" "[^"]+inspeck\.mjs" wait/)[0]}`], { encoding: 'utf8', timeout: 2000, env: { PATH: '/usr/bin:/bin', INSPECK_HOME: join(plugin, 'home') } })
  assert.equal(watcher.signal, 'SIGTERM', 'still waiting for notes when stopped')
  assert.equal(watcher.stderr, '')
  rmSync(dirname(plugin), { recursive: true, force: true })
})
