---
name: start
description: Turn Inspeck on for the person's web app in one step - open the app in the browser pane, add Inspeck to it, link the tab to this chat and start listening for notes. Use when the person runs /inspeck:start, or asks to start, set up or turn on Inspeck.
---

# Start Inspeck

Get the person from "installed" to "placing notes" without explaining the plumbing. Work quietly, then reply in the short format at the end. Don't narrate the steps as you go.

## 1. Find the app

Find the dev server for the project in your working folder:

- Already running? Check the usual local ports (3000, 3001, 4173, 4200, 5173, 5174, 8000, 8080, and any port in a `.claude/launch.json`), for example with `lsof -nP -iTCP -sTCP:LISTEN`, and prefer the one whose process runs in this project folder.
- Not running? Start it the way this project does (`.claude/launch.json` if there is one, else the `dev` script in `package.json`). If you can't tell how, ask in one line: "Start your dev server? (`npm run dev`)" and wait.

## 2. Open it with Inspeck on it

If you have a browser pane (the preview or browser tools), open the app there.

**Does the app load Inspeck itself?** Search the project for `inspeck` (a Vite plugin, a layout tag, a script in the HTML). If it doesn't, Inspeck added from the pane lasts only until the page fully reloads, and pages reload all the time while someone builds, so it keeps vanishing. Ask once, in one line: "Add Inspeck to your app so it stays after reloads? It's one line that only runs on your computer." On yes, add it the standard way, in the app's folder:

- **Vite or Next.js:** run `npx inspeck init --skip-plugin --yes`. It adds Inspeck in development only (the Vite plugin, or a tag in the Next.js layout guarded by `NODE_ENV`).
- **A plain HTML page, or anything else:** put this just before `</body>`, so it loads only on their computer and never on a deployed site:

  ```html
<script>/* Inspeck: loads on this computer only, never on the live site */
if (/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname)) document.head.appendChild(Object.assign(document.createElement('script'), { src: 'http://127.0.0.1:4848/inspeck.js', async: true }))</script>
  ```

Never write anything that belongs to this chat into their code: no session token, no `bind(...)` call. The tab stays linked to this chat across reloads by itself (Inspeck remembers its tab), and in a new chat `/inspeck:start` links it again. On no, carry on without it: the bind line adds Inspeck to the open page, and after a full reload you run the line again.

Then call the Inspeck `bind` tool and run the line it returns in that tab. It links the tab to this chat, and adds Inspeck to the page if the app still doesn't load it.

No browser pane? Call `bind` with `page` set to the app's address instead, so notes from it in any browser come here. The app needs Inspeck in its pages for that: add it as above if it doesn't load `inspeck.js` yet.

If Inspeck's instructions for this chat say the project's Inspeck dev plugin is older than it should be and you haven't asked yet, ask now, in one line, and update it on yes (the instructions give the command); then restart the dev server.

## 3. Listen for notes

Start the watcher `bind` gave you, as a background task. When it finishes it prints the new notes: handle them (see the inspeck skill), then start it again.

## 4. Reply, briefly

Exactly this shape, nothing more:

```
Inspeck is on.
✓ App opened · localhost:5180
✓ Inspeck added to your app · stays after reloads
✓ Linked to this chat
Click anything to note it · say "check my Inspeck notes" to send them
```

(Notes wait on the page until the person asks you for them, or go as they're placed if they turned on Auto-send notes to Claude in Inspeck's settings; with Auto-send on, end with "Click anything to note it · it comes straight here" instead.) Adjust only what's true: the address you opened; "Inspeck added to your app · stays after reloads" when you added the line, "Inspeck loaded by your app" when the app already had it, or "Inspeck added to this page · run /inspeck:start again after a full reload" when they said no; for a person using their own browser, "Linked to localhost:5180 in any browser". If a step failed, replace its line with what's wrong and the one thing to do about it.
