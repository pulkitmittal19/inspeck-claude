import { defineConfig } from 'tsup'

/* One self-contained file, committed to the repo. Claude Code installs a
   plugin by copying it from GitHub and never runs npm install, so the server
   has to carry its dependencies inside it. Node is the only requirement. */
export default defineConfig({
  entry: { inspeck: 'server/src/index.ts' },
  outDir: 'server/dist',
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  platform: 'node',
  target: 'node20',
  noExternal: [/.*/],
  clean: true,
  /* Some bundled dependencies still call require(); give them one. */
  banner: { js: "import { createRequire as __inspeckRequire } from 'node:module'; const require = __inspeckRequire(import.meta.url);" },
})
