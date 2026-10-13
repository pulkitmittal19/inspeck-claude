export interface InspeckOptions {
  /** Where the Inspeck plugin serves the widget. Default 4848, or INSPECK_PORT if set. */
  port?: number
  /** Turn the tag off without removing the plugin, e.g. `enabled: !process.env.CI`. Default true. */
  enabled?: boolean
}

/**
 * A Vite plugin that puts the Inspeck widget on every page the dev server serves (server-rendered ones
 * included), passing it through the dev server at /__inspeck/ so it loads from the page's own address.
 * Never in a build.
 */
export interface InspeckVitePlugin {
  name: 'inspeck'
  apply: 'serve'
  config(): { server: { proxy: Record<string, unknown> } }
  configureServer(server: { middlewares: { use(fn: (req: unknown, res: unknown, next: (err?: unknown) => void) => void): void } }): void
  transformIndexHtml(): Array<{ tag: string; attrs: Record<string, string | boolean>; injectTo: 'body' }>
}

export default function inspeck(options?: InspeckOptions): InspeckVitePlugin
export { inspeck }
