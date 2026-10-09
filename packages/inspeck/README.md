# inspeck

Hover any element of your app to see its CSS, written the way your code writes it. Click it to leave a note for Claude. Claude, in the same desktop session, picks the note up and fixes the code.

## Set up

In your app's folder:

```bash
npx inspeck init
```

It installs the [Inspeck plugin for Claude Code](https://github.com/pulkitmittal19/inspeck-claude), which serves the widget and hands your notes to Claude, with auto-update on so new versions arrive by themselves (`--no-auto-update` to skip), and adds the widget to your app in development only: `inspeck()` in a Vite config, a development-only tag in a Next.js layout, or the tag in a plain `index.html` (it asks first). Running it again changes nothing.

Inside the Claude app's browser pane you only need the plugin: Claude adds the widget to the page when it opens your app.

## Vite, by hand

```bash
npm i -D inspeck
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import inspeck from 'inspeck/vite'

export default defineConfig({
  plugins: [inspeck()],
})
```

The widget's script tag is added only while `vite` serves your app, never to a build, so it can't reach production. With no Claude session running the plugin, the tag fails quietly and your app is unaffected.

### Options

| Option | Default | |
|---|---|---|
| `port` | `4848`, or `INSPECK_PORT` | where the Inspeck plugin serves the widget |
| `enabled` | `true` | turn the tag off without removing the plugin, e.g. `enabled: !process.env.CI` |

## License

MIT
