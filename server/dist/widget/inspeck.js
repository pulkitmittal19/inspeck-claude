"use strict";(()=>{function u(t,e={},...r){let s=document.createElement(t);for(let[o,i]of Object.entries(e))i===!1||i==null||s.setAttribute(o,i===!0?"":String(i));return O(s,r),s}function O(t,e){for(let r of e)r===!1||r==null||t.appendChild(typeof r=="object"?r:document.createTextNode(String(r)))}var y="http://www.w3.org/2000/svg";function h(t,e=16,r=1.7){let s=document.createElementNS(y,"svg");for(let[o,i]of Object.entries({width:String(e),height:String(e),viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":String(r),"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))s.setAttribute(o,i);for(let[o,i]of t){let p=document.createElementNS(y,o);for(let[d,n]of Object.entries(i))p.setAttribute(d,n);s.appendChild(p)}return s}function w(t){let e=new CSSStyleSheet;return e.replaceSync(t),e}function E(t){return t?t instanceof HTMLTextAreaElement?!0:t instanceof HTMLInputElement?!["button","checkbox","radio","range","color","file","submit","reset","image"].includes(t.type):t instanceof HTMLElement&&t.isContentEditable:!1}var k="0.2.0",f=document.currentScript,S=(()=>{try{if(f?.src)return new URL(f.src).origin}catch{}return"http://127.0.0.1:4848"})();function M(){if(f?.hasAttribute("data-inspeck-anywhere"))return!0;let t=location.hostname;return t==="localhost"||t==="127.0.0.1"||t==="[::1]"||t.endsWith(".localhost")||t.endsWith(".test")}var b={get(t){try{return sessionStorage.getItem(`inspeck:${t}`)}catch{return null}},set(t,e){try{e==null?sessionStorage.removeItem(`inspeck:${t}`):sessionStorage.setItem(`inspeck:${t}`,e)}catch{}}};var C=`
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
`;function I(){let t=document.createElement("inspeck-root");t.setAttribute("data-inspeck","");let e=t.attachShadow({mode:"open"});e.adoptedStyleSheets=[w(C)];let r=document.createElement("div");r.className="ix",e.appendChild(r);let s=typeof t.showPopover=="function";s&&t.setAttribute("popover","manual");let o=()=>{if(!(!s||!t.isConnected))try{t.matches(":popover-open")&&t.hidePopover(),t.showPopover()}catch{}},i=()=>document.querySelector("dialog:modal")??document.documentElement,p=()=>{let l=i();if(t.parentNode!==l){let x=e.activeElement;l.appendChild(t),o(),x?.focus({preventScroll:!0})}};p(),o();let d=l=>{l.target!==t&&(l.newState==="open"?queueMicrotask(()=>{p(),o()}):queueMicrotask(p))};document.addEventListener("toggle",d,!0);let n=new MutationObserver(()=>{(!t.isConnected||t.parentNode!==i())&&p()});n.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["open"]});let a=new MutationObserver(()=>{t.hasAttribute("inert")&&t.removeAttribute("inert"),t.hasAttribute("aria-hidden")&&t.removeAttribute("aria-hidden")});return a.observe(t,{attributes:!0,attributeFilter:["inert","aria-hidden"]}),{el:t,root:e,ui:r,owns:l=>l.composedPath().includes(t),destroy(){document.removeEventListener("toggle",d,!0),n.disconnect(),a.disconnect(),t.remove()}}}var T=["pointerdown","pointerup","pointermove","pointerover","pointerout","pointerenter","pointerleave","pointercancel","mousedown","mouseup","mousemove","mouseover","mouseout","mouseenter","mouseleave","click","dblclick","auxclick","contextmenu","dragstart","touchstart","touchend","touchmove","wheel","keydown","keyup","keypress","beforeinput","input","change","focusin","focusout","focus","blur","scroll","resize","visibilitychange"];function H(t,e){let r=o=>{if(t.owns(o)){e.ui(o),o.stopImmediatePropagation();return}if((o.type==="focusout"||o.type==="blur")&&o.relatedTarget===t.el){o.stopImmediatePropagation();return}let i=e.page(o);i&&(o.stopImmediatePropagation(),i==="swallow"&&o.cancelable&&o.preventDefault())},s={capture:!0,passive:!1};for(let o of T)window.addEventListener(o,r,s),o==="visibilitychange"&&document.addEventListener(o,r,s);return()=>{for(let o of T)window.removeEventListener(o,r,s),o==="visibilitychange"&&document.removeEventListener(o,r,s)}}function g(t){for(let e of t.composedPath())if(e instanceof HTMLElement&&e.dataset.action)return{action:e.dataset.action,el:e};return null}var c=t=>["path",{d:t}],v={inspect:[c("M17.5 17.5L22 22"),c("M20 11a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z"),c("M14.5 9.5l.9.8c.4.3.6.5.6.7s-.2.4-.6.7l-.9.8"),c("M7.5 9.5l-.9.8c-.4.3-.6.5-.6.7s.2.4.6.7l.9.8"),c("M12 8.5 10 13.5")],freeze:[c("M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"),c("M9.5 4.6 12 7l2.5-2.4M9.5 19.4 12 17l2.5 2.4")],list:[c("M9 7h10.5M9 12h10.5M9 17h10.5"),["path",{d:"M4.5 7h.01M4.5 12h.01M4.5 17h.01","stroke-width":"2.6"}]],close:[c("M6.5 6.5l11 11M17.5 6.5l-11 11")],copy:[["rect",{x:"8.5",y:"8.5",width:"11",height:"11",rx:"2"}],c("M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3")],enter:[c("M19 6v5a3 3 0 0 1-3 3H6"),c("M10 10l-4 4 4 4")],note:[c("M5 5h14v10h-9l-4 4v-4H5z")],check:[c("M5 12.5l4.5 4.5L19 7.5")],trash:[c("M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5")],chevron:[c("M9.5 6l6 6-6 6")]};var N=[{action:"freeze",icon:"freeze",label:"Freeze the page",key:"F"},{action:"list",icon:"list",label:"All notes"},{action:"close",icon:"close",label:"Close",key:"Esc"}];function L(t){let e=N.map((n,a)=>{let l=u("button",{type:"button",class:"btn","data-action":n.action,"aria-label":n.label,"data-tip":n.label,"data-key":n.key},h(v[n.icon],16));return l.style.setProperty("--i",String(N.length-1-a)),l});e.splice(e.length-1,0,u("span",{class:"sep"}));let r=u("div",{class:"row"},...e),s=u("button",{type:"button",class:"logo","data-action":"open","aria-label":"Open Inspeck","data-tip":"Inspeck","data-key":"\u2325I"},h(v.inspect,18,1.5)),o=u("div",{class:"bar",role:"toolbar","aria-label":"Inspeck"},s,r),i=u("div",{class:"tip",role:"tooltip"});t.append(o,i),requestAnimationFrame(()=>o.style.setProperty("--ix-open-w",`${r.scrollWidth+8}px`));let p=null,d=n=>{if(n===p)return;if(p=n,!n||!n.dataset.tip||n.classList.contains("btn")&&!o.hasAttribute("data-open")){i.removeAttribute("data-show");return}i.replaceChildren(n.dataset.tip,...n.dataset.key?[u("span",{class:"kbd"},n.dataset.key)]:[]);let a=n.getBoundingClientRect(),l=i.offsetWidth;i.style.left=`${Math.min(window.innerWidth-l-8,Math.max(8,a.left+a.width/2-l/2))}px`,i.style.top=`${a.top-34}px`,i.setAttribute("data-show","")};return{setOpen(n){o.toggleAttribute("data-open",n),s.tabIndex=n?-1:0,d(null)},setPressed(n,a){o.querySelector(`[data-action="${n}"]`)?.setAttribute("aria-pressed",String(a))},handle(n){if(n.type==="pointerover"){let a=g(n);d(a?.el??null)}else if(n.type==="pointerout"||n.type==="pointerleave"){let a=n.relatedTarget;(!(a instanceof Node)||!o.contains(a))&&d(null)}else if(n.type==="click"){let a=g(n);if(a&&o.contains(a.el))return d(null),a.action}return null}}}var m=class{host;toolbar;open=!1;unroute;constructor(){this.host=I(),this.toolbar=L(this.host.ui),this.unroute=H(this.host,{ui:e=>this.onUi(e),page:e=>this.onPage(e)}),b.get("open")==="1"&&this.setOpen(!0)}setOpen(e){e!==this.open&&(this.open=e,this.toolbar.setOpen(e),b.set("open",e?"1":null))}act(e){switch(e){case"open":this.setOpen(!0);break;case"close":this.setOpen(!1);break}}onUi(e){let r=this.toolbar.handle(e);r&&this.act(r),e.type==="keydown"&&this.onKey(e,!0)}onPage(e){if(e.type==="keydown")return this.onKey(e,!1)}onKey(e,r){if(e.altKey&&!e.metaKey&&!e.ctrlKey&&e.code==="KeyI")return this.setOpen(!this.open),e.preventDefault(),"swallow";if(this.open&&!(!r&&E(document.activeElement))&&e.key==="Escape")return this.setOpen(!1),"swallow"}destroy(){this.unroute(),this.host.destroy()}};function A(){if(window.__INSPECK__?.app)return;let t=new m;window.__INSPECK__={app:t,version:k,server:S,destroy(){t.destroy(),delete window.__INSPECK__}}}if(!M())console.info(`Inspeck: not starting on ${location.hostname}, which isn't this machine.`);else if(!(window.top!==window&&!document.currentScript?.hasAttribute("data-inspeck-frames"))){let t=()=>"requestIdleCallback"in window?requestIdleCallback(A,{timeout:1500}):setTimeout(A,200);document.readyState==="complete"?t():window.addEventListener("load",t,{once:!0})}})();
