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

/** A Vite plugin that adds the Inspeck widget's script tag while the dev server runs, and never to a build. */
export interface InspeckVitePlugin {
  name: 'inspeck'
  apply: 'serve'
  transformIndexHtml(): HtmlTag[]
}

export default function inspeck(options?: InspeckOptions): InspeckVitePlugin
export { inspeck }
