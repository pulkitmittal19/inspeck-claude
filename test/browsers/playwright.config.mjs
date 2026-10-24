/* Inspeck in real browser engines: Chrome, Firefox and WebKit (Safari's), with real mouse and keyboard.
 * `npm run test:browsers`. Its own Inspeck server on its own port and notes folder: the real one is never touched. */
import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PORT = 4870
const home = join(tmpdir(), 'inspeck-browser-tests')

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}/__dev/`, viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
  ],
  globalSetup: './setup.mjs',
  webServer: {
    /* The server runs as Claude Code runs it, over stdin; `tail` keeps that open. */
    command: `rm -rf "${home}" && tail -f /dev/null | INSPECK_DEV=1 INSPECK_PORT=${PORT} INSPECK_HOME="${home}" INSPECK_LATEST_URL=off node server/dist/inspeck.mjs`,
    cwd: join(import.meta.dirname, '..', '..'),
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    stdout: 'ignore',
  },
})
