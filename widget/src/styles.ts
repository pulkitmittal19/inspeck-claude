/* Everything the widget draws lives in its shadow root and is styled from
   here. The host resets every inherited property, so the app's CSS (a global
   `* {}` reset, a Tailwind preflight, a dark theme) can't reach in. */

export const CSS = /* css */ `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  overflow: visible !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  color-scheme: dark;

  --ix-bg: #18181B;
  --ix-bg-2: rgba(255, 255, 255, 0.06);
  --ix-line: rgba(255, 255, 255, 0.08);
  --ix-text: #F4F4F5;
  --ix-dim: rgba(244, 244, 245, 0.55);
  --ix-faint: rgba(244, 244, 245, 0.38);
  --ix-accent: #FF3D8A;
  --ix-accent-ink: #E0186F;
  --ix-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset, 0 12px 32px rgba(0, 0, 0, 0.32);
  --ix-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  --ix-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
  /* Motion. Things arrive on a long, soft ease-out and leave on a short ease-in:
     arriving is information, leaving is getting out of the way. */
  --ix-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ix-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ix-ease-io: cubic-bezier(0.65, 0, 0.35, 1);
  --ix-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* syntax colours for the CSS card */
  --ix-c-prop: #FF8AB8;
  --ix-c-num: #F5C77E;
  --ix-c-token: #7DD3FC;
  --ix-c-kw: #C4B5FD;
  --ix-c-hex: #E9E9EB;
  --ix-c-punct: rgba(244, 244, 245, 0.4);
}
:host::backdrop { display: none !important; }

*, *::before, *::after { box-sizing: border-box; }
:where(button, input, textarea) { font: inherit; color: inherit; margin: 0; }
button { appearance: none; background: none; border: 0; padding: 0; cursor: pointer; }
[hidden] { display: none !important; }

.ix { font-family: var(--ix-sans); font-size: 12px; line-height: 1.4; color: var(--ix-text); -webkit-font-smoothing: antialiased; }

/* ---------- toolbar: the circle that grows into the pill ----------
   Opening: the pill stretches out of the circle while the glyph turns away,
   then the buttons arrive one by one from the corner.
   Closing: the buttons let go together, then the pill draws back in and the
   glyph returns. Closing is quicker than opening. */
.bar {
  position: fixed; right: 20px; bottom: 20px; height: 40px; width: 40px;
  border-radius: 20px; background: var(--ix-bg); overflow: hidden; pointer-events: auto;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.07) inset, 0 8px 24px rgba(0, 0, 0, 0.24), 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: width 260ms var(--ix-ease-io) 70ms, transform 180ms var(--ix-ease), box-shadow 200ms ease;
}
.bar[data-open] { width: var(--ix-open-w, 108px); transition: width 380ms var(--ix-ease), transform 180ms var(--ix-ease), box-shadow 200ms ease; }
.bar:not([data-open]):hover { transform: scale(1.06); }
.bar:not([data-open]):active { transform: scale(0.94); transition-duration: 90ms; }
/* Frozen: a quiet pink ring around the whole pill, so you know the page is held. */
.bar[data-frozen] { box-shadow: 0 0 0 1.5px rgba(255, 61, 138, 0.75) inset, 0 8px 24px rgba(0, 0, 0, 0.24), 0 0 0 4px rgba(255, 61, 138, 0.14); }

.bar .logo {
  position: absolute; right: 0; top: 0; width: 40px; height: 40px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center; color: #fff;
  transition: opacity 200ms ease 170ms, transform 360ms var(--ix-ease) 130ms;
}
.bar[data-open] .logo {
  opacity: 0; transform: rotate(-90deg) scale(0.55); pointer-events: none;
  transition: opacity 120ms ease, transform 260ms var(--ix-ease);
}

.bar .row {
  position: absolute; right: 4px; top: 4px; height: 32px;
  display: flex; align-items: center; gap: 2px; pointer-events: none;
}
.bar[data-open] .row { pointer-events: auto; }

.bar .btn {
  position: relative; width: 32px; height: 32px; flex-shrink: 0; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.78);
  opacity: 0; transform: translateX(8px) scale(0.86);
  transition: opacity 110ms var(--ix-ease-in), transform 160ms var(--ix-ease-in), background 140ms ease, color 140ms ease;
}
.bar[data-open] .btn {
  opacity: 1; transform: none;
  transition: opacity 220ms ease, transform 420ms var(--ix-ease), background 140ms ease, color 140ms ease;
  transition-delay: calc(90ms + var(--i, 0) * 45ms), calc(90ms + var(--i, 0) * 45ms), 0ms, 0ms;
}
.bar .btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.bar .btn:active { transform: scale(0.9); transition-duration: 80ms; }
.bar .btn[aria-pressed="true"] { background: rgba(255, 61, 138, 0.26); color: #fff; }
.bar .btn[aria-pressed="true"] svg { animation: ix-spin-in 420ms var(--ix-ease); }
@keyframes ix-spin-in { from { transform: rotate(-60deg) scale(0.7); } to { transform: none; } }

/* ---------- frozen: a clear sheet over the page catches the real pointer ---------- */
.frost { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; background: transparent; }

/* ---------- the outline that follows the element under the pointer ---------- */
.outline {
  position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform;
  border: 1.5px solid var(--ix-accent); border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: opacity 120ms ease;
}
.outline[data-state="enter"] { opacity: 0; }
.outline[data-state="out"] { opacity: 0; transition-duration: 90ms; }
/* Moving to another element: glide there. While scrolling it follows instantly. */
.outline[data-glide] { transition: transform 150ms var(--ix-ease), width 150ms var(--ix-ease), height 150ms var(--ix-ease), border-radius 150ms var(--ix-ease), opacity 120ms ease; }
.outline[data-through] { border-style: dashed; opacity: 0.6; }

/* ---------- the CSS card ---------- */
.card {
  position: fixed; left: 0; top: 0; pointer-events: none;
  min-width: 240px; max-width: min(420px, calc(100vw - 16px));
  padding: 9px 11px 10px; border-radius: 11px; background: var(--ix-bg); box-shadow: var(--ix-shadow);
  transform-origin: var(--ix-origin, top left);
  transition: opacity 160ms ease, transform 220ms var(--ix-ease), box-shadow 200ms ease;
}
.card[data-state="enter"] { opacity: 0; transform: translateY(var(--ix-rise, 4px)) scale(0.985); }
.card[data-state="out"] { opacity: 0; transform: translateY(2px) scale(0.98); transition: opacity 110ms var(--ix-ease-in), transform 140ms var(--ix-ease-in); }
.card[data-glide] { transition: opacity 160ms ease, transform 220ms var(--ix-ease), box-shadow 200ms ease, left 150ms var(--ix-ease), top 150ms var(--ix-ease); }
.card[data-pinned] { pointer-events: auto; box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.2) inset, 0 16px 40px rgba(0, 0, 0, 0.36); }
/* Sent: the card bows out toward its marker. */
.card[data-state="out"][data-sent] { transform: scale(0.94); transition: opacity 180ms var(--ix-ease-in), transform 220ms var(--ix-ease-in); }

/* Height that animates: a one-row grid going from 0fr to 1fr. */
.reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 220ms var(--ix-ease), opacity 160ms ease; }
.reveal[data-open] { grid-template-rows: 1fr; opacity: 1; }
.reveal > .inner { min-height: 0; overflow: hidden; }
.reveal.quick { transition-duration: 180ms, 120ms; }
.card-head {
  display: flex; align-items: center; gap: 8px; padding-bottom: 6px; margin-bottom: 4px;
  border-bottom: 1px solid var(--ix-line); white-space: nowrap;
}
.card-head .label { font: 650 11.5px/1.2 var(--ix-mono); color: var(--ix-text); overflow: hidden; text-overflow: ellipsis; }
.card-head .comp { font: 500 11px/1.2 var(--ix-sans); color: var(--ix-dim); }
.card-head .size { margin-left: auto; padding-left: 8px; font: 500 10.5px/1 var(--ix-mono); color: var(--ix-dim); }
.css { font: 11px/1.75 var(--ix-mono); color: var(--ix-text); }
.decl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.decl.empty { color: var(--ix-dim); font-family: var(--ix-sans); }
.c-prop { color: var(--ix-c-prop); }
.c-num { color: var(--ix-c-num); }
.c-token { color: var(--ix-c-token); }
.c-kw { color: var(--ix-c-kw); }
.c-hex { color: var(--ix-c-hex); }
.c-fn, .c-punct { color: var(--ix-c-punct); }
.res { margin-left: 8px; color: var(--ix-faint); }
.sw {
  display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}

/* pinned: tools, the fold line, the note */
.card .tools { display: flex; gap: 2px; margin-left: 4px; animation: ix-fade-in 200ms ease 60ms both; }
@keyframes ix-fade-in { from { opacity: 0; transform: translateX(-3px); } to { opacity: 1; transform: none; } }
.card .num { font: 700 10.5px/1 var(--ix-sans); color: var(--ix-dim); }
.tool {
  width: 22px; height: 22px; border-radius: 6px; color: var(--ix-dim);
  display: flex; align-items: center; justify-content: center;
}
.tool:hover { background: var(--ix-bg-2); color: var(--ix-text); }
.fold {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 0 1px; text-align: left; border-radius: 5px;
  font: 11px/1.4 var(--ix-mono); color: var(--ix-dim); white-space: nowrap; overflow: hidden;
}
.fold:hover { color: var(--ix-text); }
.fold-peek { margin-left: auto; overflow: hidden; text-overflow: ellipsis; color: var(--ix-faint); }
/* Spacing lives on the child, never on .inner: padding there would survive the collapse. */
.note-wrap .note { margin-top: 8px; }
.note {
  display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 9px;
  border-radius: 9px; background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.12) inset; color: var(--ix-dim);
  transition: box-shadow 140ms ease;
}
.note:focus-within { box-shadow: 0 0 0 1.5px var(--ix-accent) inset; }
.note > svg { flex-shrink: 0; margin-bottom: 4px; }
.note-input {
  flex: 1; min-width: 220px; height: 20px; resize: none; border: 0; outline: 0; background: transparent; padding: 0;
  font: 12.5px/20px var(--ix-sans); color: var(--ix-text); overflow-y: auto;
}
.note-input::placeholder { color: var(--ix-faint); }
.send {
  width: 24px; height: 24px; flex-shrink: 0; border-radius: 7px; background: rgba(255, 255, 255, 0.1);
  color: var(--ix-dim); display: flex; align-items: center; justify-content: center;
  transition: background 160ms ease, color 160ms ease, transform 120ms var(--ix-ease);
}
.send[data-ready] { background: var(--ix-accent-ink); color: #fff; }
.send[data-ready]:hover { filter: brightness(1.1); }
.send:active:not(:disabled) { transform: scale(0.9); }
.send:disabled { cursor: default; }
.status {
  display: flex; align-items: center; gap: 7px; padding: 7px 9px; border-radius: 8px;
  background: var(--ix-bg-2); font: 12px/1.35 var(--ix-sans); color: var(--ix-text);
}
.status[data-kind="error"] { color: #FFB4C9; }
.status svg { animation: ix-check 360ms var(--ix-spring) both; }
@keyframes ix-check { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
.status-wrap .status { margin-top: 8px; }
.keys { display: flex; gap: 12px; padding-top: 7px; font: 10.5px/1 var(--ix-sans); color: var(--ix-dim); }
.keys .kbd { margin-right: 3px; }
.note-actions { display: flex; padding-top: 6px; }
.link { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border-radius: 6px; font: 500 11px/1 var(--ix-sans); color: var(--ix-dim); }
.link:hover { color: var(--ix-text); background: var(--ix-bg-2); }
@keyframes ix-pulse { 0%, 100% { transform: none } 30% { transform: translateX(-4px) } 60% { transform: translateX(3px) } }
.card[data-pulse] { animation: ix-pulse 260ms ease; }

/* ---------- markers and their preview ---------- */
.marker {
  position: fixed; left: 0; top: 0; width: 20px; height: 20px; border-radius: 10px; pointer-events: auto;
  background: #17171C; color: #fff; font: 700 10.5px/1 var(--ix-sans);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 0 1.5px #fff, 0 2px 6px rgba(0, 0, 0, 0.28);
  transition: transform 180ms var(--ix-ease), opacity 200ms ease, box-shadow 180ms ease;
}
.marker:hover { transform: scale(1.14) translateY(-1px); box-shadow: 0 0 0 1.5px #fff, 0 4px 12px rgba(0, 0, 0, 0.3); }
.marker:active { transform: scale(0.96); transition-duration: 80ms; }
/* A new note: the marker pops into place. */
.marker[data-born] { animation: ix-pop 460ms var(--ix-spring) both; }
@keyframes ix-pop { 0% { transform: scale(0); opacity: 0; } 60% { opacity: 1; } 100% { transform: none; } }
.marker[data-gone] { transform: scale(0.4); opacity: 0; transition: transform 200ms var(--ix-ease-in), opacity 160ms ease; }
.marker[data-nested]::after {
  content: ''; position: absolute; right: -4px; bottom: -4px; width: 8px; height: 8px; border-radius: 4px;
  background: var(--ix-accent); box-shadow: 0 0 0 1.5px #fff;
}
.marker[data-lost] { opacity: 0.45; box-shadow: 0 0 0 1.5px #fff, 0 0 0 3px rgba(23, 23, 28, 0.25); }
.preview {
  position: fixed; left: 0; top: 0; width: max-content; max-width: 280px; pointer-events: none;
  padding: 8px 10px; border-radius: 10px; background: var(--ix-bg); box-shadow: var(--ix-shadow);
  transition: opacity 140ms ease, transform 200ms var(--ix-ease);
}
.preview[data-state="enter"] { opacity: 0; transform: translateY(3px) scale(0.98); }
.preview[data-state="out"] { opacity: 0; transition-duration: 90ms; }
.preview-head { font: 600 10.5px/1.3 var(--ix-sans); color: var(--ix-dim); margin-bottom: 3px; }
.preview-head span { font-family: var(--ix-mono); font-weight: 500; }
.preview-text { font: 12px/1.45 var(--ix-sans); color: var(--ix-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.preview-lost { margin-top: 5px; font: 11px/1.3 var(--ix-sans); color: var(--ix-faint); }

/* ---------- hold Shift: spacing ---------- */
.spacing { position: fixed; inset: 0; pointer-events: none; transition: opacity 140ms ease; }
.spacing[data-state="enter"] { opacity: 0; }
.spacing[data-state="out"] { opacity: 0; transition-duration: 90ms; }
.band { position: fixed; }
.band.padding { background: rgba(255, 61, 138, 0.2); }
.band.margin { background: rgba(245, 199, 126, 0.28); }
.band.gap { background: rgba(125, 211, 252, 0.32); }
.sp-label {
  position: fixed; transform: translate(-50%, -50%); padding: 1px 5px; border-radius: 4px;
  background: #17171C; color: #fff; font: 600 10px/1.4 var(--ix-mono); white-space: nowrap;
}

/* small label that appears above a toolbar button on hover */
.tip {
  position: fixed; pointer-events: none; padding: 5px 8px; border-radius: 7px;
  background: var(--ix-bg); color: var(--ix-text); font: 500 11px/1 var(--ix-sans);
  box-shadow: var(--ix-shadow); white-space: nowrap; display: flex; gap: 6px; align-items: center;
  opacity: 0; transform: translateY(2px); transition: opacity 120ms ease, transform 120ms ease;
}
.tip[data-show] { opacity: 1; transform: none; }
.kbd { padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.24); font: 600 10px/1.3 var(--ix-sans); color: var(--ix-dim); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0ms !important; transition-delay: 0ms !important; }
  .bar, .bar .logo, .bar .btn, .card, .outline, .preview, .marker, .reveal { transition-duration: 120ms !important; }
  .card[data-state], .preview[data-state], .bar .btn { transform: none !important; }
}
`
