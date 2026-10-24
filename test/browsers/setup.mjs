/* The React test pages are built from big libraries kept outside the repo: build them if they aren't there. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export default async function () {
  const dir = join(import.meta.dirname, '..', '..', 'widget', 'dev', 'tables')
  if (!existsSync(join(dir, 'react-bundle.js')) || !existsSync(join(dir, 'overlays-bundle.js'))) await import(join(dir, 'build.mjs'))
}
