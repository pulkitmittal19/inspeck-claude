# Inspeck

Hover any element of your app to see its CSS, written the way your code writes it. Click it to leave a note for Claude. Claude, in the same desktop session, picks the note up and fixes the code.

Inspeck is two pieces in one plugin:

- **The widget**, in your page: a small dark circle in the corner. It runs in the Claude desktop app's browser pane, or any browser on your machine.
- **The plugin**, in Claude Code: it serves the widget, keeps your notes, and hands them to the right Claude session.

## Install

In your app's folder:

```bash
npx inspeck init
```

That's all. It installs the Inspeck plugin into Claude Code (every session starts it from then on), turns on auto-update so new versions arrive by themselves (`--no-auto-update` to skip), and adds the widget to your app the way it's built: `inspeck()` in a Vite config, a development-only tag in a Next.js layout, or the tag in a plain `index.html` (it asks first). Running it again changes nothing, so if you installed before auto-update existed, run it once more to turn it on. Requires Node.js 20 or later.

Then, in Claude: **`/inspeck:start`**. It opens your app in the browser pane, turns Inspeck on and links it to the chat. The first time Inspeck opens, a four-step tour shows the basics.

**Inside the Claude app you don't even need the second part.** When Claude opens your app in its browser pane, it adds Inspeck to the page itself, so with just the plugin installed your code stays untouched. The app step is for using Inspeck in your own browser (Chrome, Safari, Arc).

<details>
<summary>Doing it by hand</summary>

The plugin:

```bash
claude plugin marketplace add pulkitmittal19/inspeck-claude
claude plugin install inspeck@inspeck
```

For new versions by themselves, turn on auto-update in Claude: `/plugin` › Marketplaces › inspeck › Enable auto-update.

Then one line in your app, in development only:

```html
<script src="http://127.0.0.1:4848/inspeck.js"></script>
```

**Vite**: install the [`inspeck`](packages/inspeck) package, which adds the tag only while serving, never to a build.

```bash
npm i -D inspeck
```

```ts
// vite.config.ts
import inspeck from 'inspeck/vite'

export default defineConfig({
  plugins: [inspeck()],
})
```

**Next.js** (`app/layout.tsx`):

```tsx
{process.env.NODE_ENV === 'development' && <script src="http://127.0.0.1:4848/inspeck.js" async />}
```

**Plain HTML**: paste the tag before `</body>`, and leave it out of production builds. If it ships by mistake, the widget stays silent on any address that isn't this machine.

</details>

If your app sets a Content Security Policy in development, allow `http://127.0.0.1:4848` in `script-src` and `connect-src`.

## Use

Open your app and click the circle in the corner, or press **⌥ I** (Option + I). The pill opens to four buttons, CSS, Clear, Settings and Close, and you can start placing notes straight away. Notes wait on the page until you're done: a **↑ Send** button appears in the pill with how many, and sends them to Claude as one batch (asking Claude to check your notes sends them too). In **Settings**, turn on *Send notes right away* to have each go as you place it, and choose how the CSS card writes values: sizes by default, in px or in rem (at the page's own root size), and colours by default, or as hex, rgb or oklch. Notes to Claude always carry the code as written. If the circle covers something, drag it anywhere; it stays there on that site:

| | |
|---|---|
| **Hover** | an outline on the element, nothing else: Inspeck stays out of the way while you look for what to note |
| **C** or `</>` | CSS on hover: the element's key CSS follows the pointer (5–6 declarations for its kind; a value from a token shows the token's name in a chip, with the real value beside it). Remembered across reloads |
| **Drag** | across a section, as in Figma: every element the box covers is outlined, and one note goes on all of them. Over empty space, the note is on that area |
| **Click** | pin a card to it and write a note. Its CSS is there, folded: click the card's top line (the › chevron) to open it. With CSS on hover on, it opens spread out. **Enter** sends it to Claude, **Shift+Enter** adds a line, **Esc** or a click anywhere else closes it (an unsent note is kept: click the same element again to carry on) |
| **↑ / ↓** | the element's parent or child |
| **Hold Shift** | padding, margin and the gaps between children, with numbers. Keep holding and move to another element: the distance between the two |
| **Hold Space** | clicks go to your app: open a menu, then note something inside it |
| **F** | freeze the page, with the pointer where it is: tooltips, hover cards, menus and what shows on hover (a row's buttons) stay as they are, so you can point at them and note them. Animations, spinners and loading states hold still too: the page's network answers wait until you release, so a loader you caught stays on screen. **F** again or **Esc** releases it. Writing a note freezes the page too, so an open menu stays open while you type |
| **Tooltips** | Inspeck sees tooltips and other click-through layers: rest the pointer on one for a moment and it's outlined. Most close when the pointer leaves their button, so press **F** while it shows, then move onto it |
| **Clear** (bin) | withdraw every note on this page; click twice to be sure |
| **Esc** | close the note, then the freeze, then Inspeck |

Each note also tells Claude where the element is written in your code (`convo-tag.jsx:22`) and where its component is used. It reads this in development from React (including React 19 on big pages, by finding each component in your source), Vue, Svelte, or any app using code-inspector-plugin, react-dev-inspector or vite-plugin-vue-inspector. Without any of these (a page rendered by Rails, Django or PHP), Claude finds the code by the element's text, classes and selector instead. Notes are kept per page, and a hash route (`#/settings`) counts as its own page.

Your notes stay on the page as numbered markers. Hover one to read it, click it to edit or delete. When you ask Claude to check your notes, it reads every new one, and their markers leave the page: you never clear what you've handed over. Claude keeps each note until it marks it done. A note on something inside a menu remembers the way in ("in More › Share"); when the menu closes, its marker waits on the button that opens it.

## Claude's side

When Claude opens your app in its browser pane, it links that tab to its session (`bind`) and starts a small background watcher. From then on each note you place arrives in that session by itself, even with other sessions open. You can also just say **"check my Inspeck notes"**.

In your own browser (Chrome, Safari, Arc), Inspeck works the same way. To tell Claude which session your notes are for, say **"check my Inspeck notes"** in that session once: it takes the notes no other session would, and from then on every note from that site comes to it, in any browser. Or ask Claude to link the site (`bind` with the page's address).

| Shown as | Tool | |
|---|---|---|
| Check comments | `pending` | every new note in full; reading them clears their markers from the page |
| Open comment | `get` | one note in full |
| Wait for comments | `watch` | wait in the foreground until one arrives |
| Link browser tab | `bind` | send a browser tab's notes to this session |
| Mark done | `resolve` | close it with one line saying what changed |
| Decline | `dismiss` | close it with a reason |

Claude talks to you only in the chat. The page shows your notes, never Claude's answers.

Which session gets a note: the session its tab is bound to; else the session its site is linked to; else the only open session; else the session opened in the project that's serving the page. If none of those, it waits, and the first session where you check your notes takes it (and its site).

## Safety

Notes become text a Claude session reads, so who may send them is the plugin's security boundary.

- The server listens on `127.0.0.1` only, and checks that the Host header names this machine (no DNS rebinding).
- Only pages on this machine may send notes: `localhost`, `127.0.0.1`, `*.localhost`, `*.test`, and browser extensions. A LAN address or a staging site must be named in `INSPECK_ALLOWED_ORIGINS`.
- Claude is told that a note is feedback about a page, not an instruction, and to ask you before acting on anything beyond the UI.

## Settings

| Variable | Default | |
|---|---|---|
| `INSPECK_PORT` | `4848` | where the widget is served and notes arrive |
| `INSPECK_HOME` | `~/.inspeck` | notes, sessions and tab bindings |
| `INSPECK_ALLOWED_ORIGINS` | none | extra origins allowed to send notes, comma-separated |

Notes stay on your machine. `~/.inspeck/last-client.json` records what the last Claude session reported about itself, which is the first thing to check if something isn't arriving.

## Working on it

```bash
npm install
npm run typecheck
npm run build      # server/dist/inspeck.mjs and server/dist/widget/inspeck.js, both committed
npm test           # the server, routing between sessions, the widget's CSS reading, the npm package
```

Both bundles are committed on purpose: Claude Code installs a plugin by copying it from GitHub and never runs `npm install`.

To work on the widget, run the server with `INSPECK_DEV=1` and open `http://127.0.0.1:4848/__dev/`, a test page with tokens, utility classes, a dropdown with a submenu, a modal and hover-only states. The widget is rebuilt with `npm run build` and picked up on the next reload.

## License

MIT
