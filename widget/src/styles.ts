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
  --ix-ease: cubic-bezier(0.32, 0.72, 0, 1);

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

/* ---------- toolbar: the circle that grows into the pill ---------- */
.bar {
  position: fixed; right: 20px; bottom: 20px; height: 40px; width: 40px;
  border-radius: 20px; background: var(--ix-bg); overflow: hidden; pointer-events: auto;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset, 0 8px 24px rgba(0, 0, 0, 0.24);
  transition: width 360ms var(--ix-ease);
}
.bar[data-open] { width: var(--ix-open-w, 174px); }

.bar .logo {
  position: absolute; right: 0; top: 0; width: 40px; height: 40px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center; color: #fff;
  transition: opacity 160ms ease, transform 320ms var(--ix-ease);
}
.bar[data-open] .logo { opacity: 0; transform: rotate(-90deg) scale(0.6); pointer-events: none; }

.bar .row {
  position: absolute; right: 4px; top: 4px; height: 32px;
  display: flex; align-items: center; gap: 2px; pointer-events: none;
}
.bar[data-open] .row { pointer-events: auto; }

.bar .btn {
  position: relative; width: 32px; height: 32px; flex-shrink: 0; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.78);
  opacity: 0; transform: translateX(10px) scale(0.85);
  transition: opacity 180ms ease, transform 320ms var(--ix-ease), background 140ms ease, color 140ms ease;
}
.bar[data-open] .btn {
  opacity: 1; transform: none;
  transition-delay: calc(70ms + var(--i, 0) * 28ms), calc(70ms + var(--i, 0) * 28ms), 0ms, 0ms;
}
.bar .btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.bar .btn[aria-pressed="true"] { background: rgba(255, 61, 138, 0.24); color: #fff; }
.bar .sep { width: 1px; height: 16px; margin: 0 3px; background: rgba(255, 255, 255, 0.16); flex-shrink: 0;
  opacity: 0; transition: opacity 180ms ease; }
.bar[data-open] .sep { opacity: 1; transition-delay: 120ms; }

/* ---------- the outline that follows the element under the pointer ---------- */
.outline {
  position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform;
  border: 1.5px solid var(--ix-accent); border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
}
.outline[data-through] { border-style: dashed; opacity: 0.6; }

/* ---------- the CSS card ---------- */
.card {
  position: fixed; left: 0; top: 0; pointer-events: none;
  min-width: 240px; max-width: min(420px, calc(100vw - 16px));
  padding: 9px 11px 10px; border-radius: 11px; background: var(--ix-bg); box-shadow: var(--ix-shadow);
}
.card[data-pinned] { pointer-events: auto; box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.2) inset, 0 14px 36px rgba(0, 0, 0, 0.34); }
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
  .bar, .bar .logo, .bar .btn, .bar .sep, .tip { transition-duration: 1ms !important; transition-delay: 0ms !important; }
}
`
