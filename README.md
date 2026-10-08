# Inspeck for Claude

Point at something on a web page, say what's wrong or what you like, and Claude picks it up in your session — along with what that element measures against your design system.

This is the Claude half of Inspeck. The other half is on the page: Inspeck inside your app, or the Inspeck Chrome extension. Both send comments here.

## Install

```bash
claude plugin marketplace add pulkitmittal19/inspeck-claude
claude plugin install inspeck@inspeck
```

Requires Node.js 20 or later. Claude Code starts the Inspeck server with every session from then on.

## Use

Place comments on a page, then in Claude Code:

- **"Check my Inspeck comments"** — Claude works through what's waiting.
- **"Watch for my Inspeck comments"** — Claude picks each one up as you place it.

Or have comments arrive by themselves. Start Claude with Inspeck's channel on:

```bash
claude --channels plugin:inspeck@inspeck
```

Channels are a new Claude Code feature and may change. Comments that arrive this way stay open until Claude handles them, so asking still finds anything a session missed.

## What Claude can do

| Shown as | Tool | |
|---|---|---|
| Check comments | `pending` | what's waiting, grouped by page |
| Open comment | `get` | one comment in full, with its screenshot |
| Wait for comments | `watch` | wait until you place one |
| Reply on badge | `reply` | ask you something, on the page |
| Mark done | `resolve` | close it with one line saying what changed |
| Decline | `dismiss` | close it with a reason |

A comment is a **fix** (on your own app: change the code) or a **reference** (from another site: bring the idea in, translated to your tokens). The address decides which, and the page can override it.

## For pages: sending comments

The server listens on `http://127.0.0.1:4848`. The format is defined once, in [`server/src/format.ts`](server/src/format.ts).

| | |
|---|---|
| `POST /comments` | place a comment |
| `GET /comments?page=<url>` | everything on a page, to draw its badges and show replies |
| `PATCH /comments/:id` | edit the note |
| `POST /comments/:id/replies` | answer Claude on the badge |
| `DELETE /comments/:id` | withdraw it |

Only local pages (`localhost`, `127.0.0.1`, `*.localhost`, `*.local`, `*.test`, and private network addresses like `192.168.x.x`) and browser extensions may post. Anything else — a staging URL, say — has to be named in `INSPECK_ALLOWED_ORIGINS`. Ordinary websites are refused, so a page can't slip a comment into your Claude session.

## Settings

| Variable | Default | |
|---|---|---|
| `INSPECK_PORT` | `4848` | where pages send comments |
| `INSPECK_HOME` | `~/.inspeck` | where comments and screenshots are kept |
| `INSPECK_ALLOWED_ORIGINS` | none | extra origins allowed to post, comma-separated |

Comments and screenshots stay on your machine. `~/.inspeck/last-client.json` records what the last Claude session reported about itself, which is the first thing to check if something isn't arriving.

## Working on it

```bash
npm install
npm run typecheck
npm run build      # bundles server/dist/inspeck.mjs, which is committed
npm test           # starts the bundled server and plays both the page and Claude
```

The bundle is committed on purpose: Claude Code installs a plugin by copying it from GitHub and never runs `npm install`.
