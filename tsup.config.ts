import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/* Two self-contained files, both committed to the repo. Claude Code installs a
   plugin by copying it from GitHub and never runs npm install, so each has to
   carry its dependencies inside it. */
export default defineConfig([
  /* The server Claude Code starts with each session. Node is the only requirement. */
  {
    entry: { inspeck: 'server/src/index.ts' },
    outDir: 'server/dist',
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    platform: 'node',
    target: 'node20',
    noExternal: [/.*/],
    clean: ['inspeck.mjs'],
    define: { __INSPECK_VERSION__: JSON.stringify(version) },
    /* Some bundled dependencies still call require(); give them one. */
    banner: { js: "import { createRequire as __inspeckRequire } from 'node:module'; const require = __inspeckRequire(import.meta.url);" },
  },
  /* The widget a page loads with one <script> tag, served by the server above. */
  {
    entry: { inspeck: 'widget/src/index.ts' },
    outDir: 'server/dist/widget',
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    platform: 'browser',
    target: ['chrome120', 'safari16'],
    minify: true,
    clean: true,
    define: { __INSPECK_VERSION__: JSON.stringify(version) },
  },
  /* The npm package `inspeck`: a Vite plugin that adds the widget's script tag
     in development. Both module formats, for ESM and CommonJS Vite configs. */
  {
    entry: { vite: 'packages/inspeck/src/vite.ts' },
    outDir: 'packages/inspeck/dist',
    format: ['esm', 'cjs'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
    platform: 'node',
    target: 'node18',
    clean: ['vite.js', 'vite.cjs'],
  },
  /* `npx inspeck init`: the command, and its parts on their own for the tests. */
  {
    entry: { bin: 'packages/inspeck/src/bin.ts', cli: 'packages/inspeck/src/cli.ts' },
    outDir: 'packages/inspeck/dist',
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    platform: 'node',
    target: 'node18',
    splitting: false,
  },
])
