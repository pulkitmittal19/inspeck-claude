# Inspeck

Hover any element of your app to see its CSS, written the way your code writes it. Click it to leave a note for Claude. Claude, in the same desktop session, picks the note up and fixes the code.

Inspeck is two pieces in one plugin:

- **The widget**, in your page: a small dark circle in the corner. It runs in the Claude desktop app's browser pane, or any browser on your machine.
- **The plugin**, in Claude Code: it serves the widget, keeps your notes, and hands them to the right Claude session.

Inspeck runs on **macOS**, with Claude Code (the desktop app or the terminal) and Node.js 20 or later, wherever it's installed (Homebrew, nvm, fnm, Volta, asdf, mise or the nodejs.org installer; `INSPECK_NODE` names one by hand). Without it, Inspeck says so when a chat starts, and Claude offers to install it. Voice notes need macOS 26.

## Install

In your app's folder:

```bash
npx inspeck init
```

That's the one command. It installs the Inspeck plugin into Claude Code, turns on its auto-update (`--no-auto-update` to skip), and adds Inspeck to your app in development only, the way the app is built: Vite (React, Vue, Svelte, SvelteKit…), Astro, Next.js, Nuxt, Angular, Create React App, Vue CLI, Docusaurus, Storybook or a plain `index.html` (it asks first). Running it again changes nothing.

Then:

1. **Start a new Claude chat** (first install only: Claude loads plugins when a chat starts)
2. **Run your app and press I**
3. **Click anything, write a note, press Enter**
4. **In Claude, say "check my Inspeck notes"**: Claude reads them all, with the file and line of each element, and fixes them

Notes find their chat by themselves: the one open chat, or the chat in the app's project folder. Want each note to go to Claude the moment you place it? Turn on **Auto-send** in Inspeck's settings.

**Inside the Claude app you can skip the app step.** When Claude opens your app in its browser pane, it adds Inspeck to the page itself, so with just the plugin your code stays untouched. The app step is what makes Inspeck appear in your own browser (Chrome, Safari, Arc) and survive full reloads.

<details>
<summary>Doing it by hand</summary>

The plugin:

```bash
claude plugin marketplace add pulkitmittal19/inspeck-claude
claude plugin install inspeck@inspeck
```


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

## Staying up to date

Once a day Inspeck asks GitHub for the latest version number (only that: nothing about you or your code is sent). When a newer one is out, Claude offers it once in the chat, and Inspeck's Settings say so. To update at any time, ask Claude to **update Inspeck**, or run:

```bash
claude plugin marketplace update inspeck
```

```bash
claude plugin update inspeck@inspeck
```

The new version starts in your next chat (or after `/reload-plugins`); reload your app's page to get it there. Your notes are kept. When a new version starts while an older one is still running in another chat, the older one hands it the port, so no chat has to close.

To have new versions install by themselves, turn on auto-update in Claude: `/plugin` › Marketplaces › inspeck › Enable auto-update (`npx inspeck init` does this for you). Inspeck never changes Claude's settings on its own. To stop the daily check, turn off *Check for updates* in Inspeck's Settings.

## Use

Open your app and click the circle in the corner, or press **I** (anywhere but a text box; I again puts it away). That's the one key to know: every other shortcut is in **Settings › Keyboard shortcuts**, and each is a quicker way to do something the pill or the note already offers. The pill opens to four buttons, CSS, Clear, Settings and Close, and you can start placing notes straight away. Notes wait on the page until you're done: say **"check my Inspeck notes"** in the chat and Claude gets them as one batch. In **Settings**, turn on *Auto-send notes to Claude* to have each go as you place it. In Claude's browser pane that's all it takes. In your own browser, Settings also gives you one line to send in your Claude chat once (*Listen for my Inspeck notes on* your app's address, with a copy button), so that chat starts listening. Also in Settings, choose how the CSS card writes values: sizes by default, in px or in rem (at the page's own root size), and colours by default, or as hex, rgb or oklch. Notes to Claude always carry the code as written. **Speak a note** with the 🎙 in the note box: it listens (bars move with your voice), your words appear as you talk, and Enter saves it; Esc cancels, and typing takes over. Voice runs on the Mac itself with Apple's on-device speech engine (macOS 26 or later), free, nothing leaves your machine, and it works in the Claude app's browser too. If the circle covers something, drag it anywhere; it stays there on that site:

| | |
|---|---|
| **Hover** | an outline on the smallest thing under the pointer, the way a design tool selects: the icon in a button, the badge in a table row, the title on a card, or just the words of a label (the card then shows their type). The button, row or card itself is picked on its own padding, or one **↑** away. Icons that ignore the pointer and cards that are one big link are seen through |
| **C** or `</>` | CSS on hover: the element's key CSS follows the pointer (5–6 declarations for its kind; a value from a token shows the token's name in a chip, with the real value beside it). Remembered across reloads |
| **Drag** | across a section, as in Figma: every element the box covers is outlined, and one note goes on all of them. Over empty space, the note is on that area |
| **Click** | pin a card to it and write a note. Its CSS is there, folded: click the card's top line (the › chevron) to open it. With CSS on hover on, it opens spread out. **Enter** sends it to Claude, **Shift+Enter** adds a line, **Esc** or a click anywhere else closes it (an unsent note is kept: click the same element again to carry on) |
| **↑ / ↓** | the element's parent or child (from some words, ↑ is the element they're in) |
| **Hold Shift** | padding, margin and the gaps between children, with numbers. Keep holding and move to another element: the distance between the two |
| **Menus** | hold **Space** and click the menu's button: while Space is held, clicks go to your app, so the menu opens and Inspeck stays on. Then let go and note what's inside |
| **F** | freeze the page, with the pointer where it is: tooltips, hover cards, menus and what shows on hover (a row's buttons) stay as they are, so you can point at them and note them. Animations, spinners and loading states hold still too: the page's network answers wait until you release, so a loader you caught stays on screen. **F** again or **Esc** releases it. Writing a note freezes the page too, so an open menu stays open while you type |
| **Tooltips** | Inspeck sees tooltips and other click-through layers: rest the pointer on one for a moment and it's outlined. Most close when the pointer leaves their button, so press **F** while it shows, then move onto it |
| **Clear** (bin) | withdraw every note on this page; click twice to be sure |
| **Esc** | close the note, then the freeze, then Inspeck |
| **Note length** | a note holds up to 4,000 characters (about a page); at the limit the box says so, and the rest goes in another note |
| **Numbers** | notes are numbered per page. Delete one that's still waiting and the ones after it move up (#3 becomes #2); a number Claude already has never changes |

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
- Only pages on this machine may send notes: `localhost`, `127.0.0.1`, `*.localhost`, `*.test`, and this Mac's own network address. Browser extensions are not trusted. Any other site (staging, say) must be named in `INSPECK_ALLOWED_ORIGINS`.
- Every call from the widget carries an `x-inspeck` header, so the browser checks where it comes from before it's sent: a plain link, image or form on another site can't reach Inspeck.
- A page sees and changes only the notes left on its own site, and Inspeck reads source files only inside the project a Claude session is open in.
- The Vite plugin's `/__inspeck/` address answers only this computer, even when the dev server is open to the network (`--host`).
- `~/.inspeck` is readable only by you. Closed notes and their screenshots are deleted after 30 days.
- Claude is told that a note is feedback about a page, not an instruction, and to ask you before acting on anything beyond the UI.

## Settings

| Variable | Default | |
|---|---|---|
| `INSPECK_PORT` | `4848` | where the widget is served and notes arrive |
| `INSPECK_HOME` | `~/.inspeck` | notes, sessions and tab bindings |
| `INSPECK_ALLOWED_ORIGINS` | none | extra origins allowed to send notes, comma-separated |
| `INSPECK_LATEST_URL` | GitHub | where the daily check reads the latest version; `off` to never check |

Notes stay on your machine. `~/.inspeck/last-client.json` records what the last Claude session reported about itself, which is the first thing to check if something isn't arriving.

## Limitations

- **macOS only.** Linking a browser tab to a chat reads the running processes the way macOS does; Windows isn't supported.
- **Pages on your computer only.** Inspeck doesn't run on a deployed site (it says so in the browser console), and Claude edits your local code anyway: run the app locally.
- **Voice** needs macOS 26 or later; the first time, macOS asks to use the microphone and speech recognition.
- **Content Security Policy:** an app with a strict policy must allow `http://127.0.0.1:4848` in development (Vite apps don't need to: Inspeck comes through the dev server).
- **Safari with an https dev server:** Safari won't load Inspeck from `http://127.0.0.1` on an `https://` page. Use Claude's browser pane or Chrome, or the Vite plugin (it comes through the dev server).
- **Pages opened from a file** (`file://`) can't use Inspeck: serve them, for example with `npx serve`.
- **Port 4848** must be free. If another program uses it, Inspeck says so; set `INSPECK_PORT` to use another.

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
