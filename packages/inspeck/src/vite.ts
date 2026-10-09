/* Inspeck for Vite: adds the widget's one <script> tag to the pages the dev
 * server serves. Only while serving (`apply: 'serve'`): a build never carries
 * it, so it can't reach production by accident.
 *
 * The widget itself comes from the Inspeck Claude Code plugin, which serves it
 * on 127.0.0.1:4848 while a Claude session is open. With no session running,
 * the tag fails quietly and the app is unaffected.
 *
 * No dependency on Vite's types: the plugin is a plain object Vite accepts, so
 * this package installs with nothing else.
 */

export interface InspeckOptions {
  /** Where the Inspeck plugin serves the widget. Default 4848, or INSPECK_PORT if set. */
  port?: number
  /** Turn the tag off without removing the plugin, e.g. `enabled: !process.env.CI`. Default true. */
  enabled?: boolean
}

interface HtmlTag {
  tag: string
  attrs: Record<string, string | boolean>
  injectTo: 'body'
}

export interface InspeckVitePlugin {
  name: 'inspeck'
  apply: 'serve'
  transformIndexHtml(): HtmlTag[]
}

const envPort = (): number | undefined => {
  const raw = typeof process !== 'undefined' ? process.env?.INSPECK_PORT : undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined
}

export default function inspeck(options: InspeckOptions = {}): InspeckVitePlugin {
  const port = options.port ?? envPort() ?? 4848
  const enabled = options.enabled ?? true
  return {
    name: 'inspeck',
    apply: 'serve',
    transformIndexHtml: () => enabled
      ? [{ tag: 'script', attrs: { src: `http://127.0.0.1:${port}/inspeck.js`, async: true }, injectTo: 'body' }]
      : [],
  }
}

export { inspeck }
