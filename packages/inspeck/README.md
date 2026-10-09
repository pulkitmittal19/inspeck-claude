# inspeck

Hover any element of your app to see its CSS, written the way your code writes it. Click it to leave a note for Claude. Claude, in the same desktop session, picks the note up and fixes the code.

This package adds the Inspeck widget to your Vite dev server. The widget itself is served by the [Inspeck plugin for Claude Code](https://github.com/pulkitmittal19/inspeck-claude), so install that first:

```bash
claude plugin marketplace add pulkitmittal19/inspeck-claude
claude plugin install inspeck@inspeck
```

## Vite

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
