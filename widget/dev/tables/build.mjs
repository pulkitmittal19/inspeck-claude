/* Builds the React test pages (react.html, overlays.html, systems.html) from src/, with the real libraries: Ant Design, MUI,
 * TanStack, Radix, Headless UI, Sonner, react-hot-toast. They're installed once into a cache folder outside the
 * repo (they're big, and only these pages need them), at the versions below. `node widget/dev/tables/build.mjs` */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const cache = join(homedir(), '.cache', 'inspeck-test-pages')
const LIBS = {
  react: '18.3.1', 'react-dom': '18.3.1', antd: '5.18.0', '@mui/material': '5.15.19', '@mui/x-data-grid': '7.6.1',
  '@emotion/react': '11.11.4', '@emotion/styled': '11.11.5', '@tanstack/react-table': '8.17.3',
  '@radix-ui/react-dialog': '1.1.2', '@radix-ui/react-popover': '1.1.2', '@radix-ui/react-dropdown-menu': '2.1.2', '@radix-ui/react-tooltip': '1.1.3',
  '@headlessui/react': '2.1.10', sonner: '1.5.0', 'react-hot-toast': '2.4.1',
  /* systems.html: the same screen in six design systems. */
  'lucide-react': '0.395.0', '@radix-ui/react-tabs': '1.1.1', '@radix-ui/react-checkbox': '1.1.2', '@radix-ui/react-switch': '1.1.1',
  '@radix-ui/react-avatar': '1.1.1', '@chakra-ui/react': '2.8.2', 'framer-motion': '11.2.10', '@mantine/core': '7.10.2',
  '@mantine/hooks': '7.10.2', '@primer/react': '36.27.0', '@primer/octicons-react': '19.10.0', 'styled-components': '5.3.11',
}
const stamp = join(cache, 'versions.json')
const wanted = JSON.stringify(LIBS)
if (!existsSync(stamp) || (await import('node:fs')).readFileSync(stamp, 'utf8') !== wanted) {
  mkdirSync(cache, { recursive: true })
  writeFileSync(join(cache, 'package.json'), JSON.stringify({ private: true, dependencies: LIBS }))
  execFileSync('npm', ['install', '--silent', '--legacy-peer-deps', '--no-audit', '--no-fund'], { cwd: cache, stdio: 'inherit' })
  writeFileSync(stamp, wanted)
}
for (const [src, out, mode] of [['react-tables.jsx', 'react-bundle.js', 'production'], ['overlays.jsx', 'overlays-bundle.js', 'development']]) {
  await build({
    entryPoints: [join(here, 'src', src)], outfile: join(here, out), bundle: true, minify: true, format: 'iife',
    nodePaths: [join(cache, 'node_modules')], define: { 'process.env.NODE_ENV': JSON.stringify(mode) }, logLevel: 'warning',
  })
}
for (const ds of ['shadcn', 'mui', 'antd', 'chakra', 'mantine', 'primer']) {
  await build({
    entryPoints: [join(here, 'src', 'systems', `${ds}.jsx`)], outdir: join(here, 'systems'), bundle: true, minify: true, format: 'iife',
    nodePaths: [join(cache, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning',
  })
}
console.log('built react-bundle.js, overlays-bundle.js and systems/')
