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

If you have a browser pane (the preview or browser tools), open the app there. Then call the Inspeck `bind` tool and run the line it returns in that tab. The line adds Inspeck to the page when the app doesn't load it itself, so the person's code doesn't change, and it links the tab to this chat.

No browser pane? Call `bind` with `page` set to the app's address instead, so notes from it in any browser come here. The app then needs Inspeck in its pages: if it doesn't load `inspeck.js` yet, offer `npx inspeck init` (run in the app's folder; it adds it in development only).

## 3. Listen for notes

Start the watcher `bind` gave you, as a background task. When it finishes it prints the new notes: handle them (see the inspeck skill), then start it again.

## 4. Reply, briefly

Exactly this shape, nothing more:

```
Inspeck is on.
✓ App opened · localhost:5180
✓ Inspeck added · no code changed
✓ Linked to this chat
Click anything to note it · ↑ in the pill sends your notes
```

(Notes wait until the person presses ↑ Send, or go as they're placed if they turned on Send notes right away in Inspeck's settings; the last line is the same either way.) Adjust only what's true: the address you opened; "Inspeck added · no code changed" when the bind line added it, or "Inspeck loaded by your app" when the app already had it; for a person using their own browser, "Linked to localhost:5180 in any browser". If a step failed, replace its line with what's wrong and the one thing to do about it.
