"use strict";(()=>{function d(e,t={},...o){let i=document.createElement(e);for(let[n,s]of Object.entries(t))s===!1||s==null||i.setAttribute(n,s===!0?"":String(s));return V(i,o),i}function V(e,t){for(let o of t)o===!1||o==null||e.appendChild(typeof o=="object"?o:document.createTextNode(String(o)))}var w="http://www.w3.org/2000/svg";function m(e,t=16,o=1.7){let i=document.createElementNS(w,"svg");for(let[n,s]of Object.entries({width:String(t),height:String(t),viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":String(o),"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))i.setAttribute(n,s);for(let[n,s]of e){let p=document.createElementNS(w,n);for(let[a,r]of Object.entries(s))p.setAttribute(a,r);i.appendChild(p)}return i}function E(e){let t=new CSSStyleSheet;return t.replaceSync(e),t}function k(e){return e?e instanceof HTMLTextAreaElement?!0:e instanceof HTMLInputElement?!["button","checkbox","radio","range","color","file","submit","reset","image"].includes(e.type):e instanceof HTMLElement&&e.isContentEditable:!1}var S="0.2.0",f=document.currentScript,M=(()=>{try{if(f?.src)return new URL(f.src).origin}catch{}return"http://127.0.0.1:4848"})();function T(){if(f?.hasAttribute("data-inspeck-anywhere"))return!0;let e=location.hostname;return e==="localhost"||e==="127.0.0.1"||e==="[::1]"||e.endsWith(".localhost")||e.endsWith(".test")}var b={get(e){try{return sessionStorage.getItem(`inspeck:${e}`)}catch{return null}},set(e,t){try{t==null?sessionStorage.removeItem(`inspeck:${e}`):sessionStorage.setItem(`inspeck:${e}`,t)}catch{}}};var C=`
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
`;function A(){let e=document.createElement("inspeck-root");e.setAttribute("data-inspeck","");let t=e.attachShadow({mode:"open"});t.adoptedStyleSheets=[E(C)];let o=document.createElement("div");o.className="ix",t.appendChild(o);let i=typeof e.showPopover=="function";i&&e.setAttribute("popover","manual");let n=()=>{if(!(!i||!e.isConnected))try{e.matches(":popover-open")&&e.hidePopover(),e.showPopover()}catch{}},s=()=>document.querySelector("dialog:modal")??document.documentElement,p=()=>{let u=s();if(e.parentNode!==u){let y=t.activeElement;u.appendChild(e),n(),y?.focus({preventScroll:!0})}};p(),n();let a=u=>{u.target!==e&&(u.newState==="open"?queueMicrotask(()=>{p(),n()}):queueMicrotask(p))};document.addEventListener("toggle",a,!0);let r=new MutationObserver(()=>{(!e.isConnected||e.parentNode!==s())&&p()});r.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["open"]});let l=new MutationObserver(()=>{e.hasAttribute("inert")&&e.removeAttribute("inert"),e.hasAttribute("aria-hidden")&&e.removeAttribute("aria-hidden")});return l.observe(e,{attributes:!0,attributeFilter:["inert","aria-hidden"]}),{el:e,root:t,ui:o,owns:u=>u.composedPath().includes(e),destroy(){document.removeEventListener("toggle",a,!0),r.disconnect(),l.disconnect(),e.remove()}}}function O(e,t){let o=d("div",{class:"outline",hidden:!0});e.appendChild(o);let i=null,n=0,s=()=>{if(n=0,!i)return;if(!i.isConnected){p();return}let a=i.getBoundingClientRect();o.style.transform=`translate(${a.left-2}px, ${a.top-2}px)`,o.style.width=`${a.width+4}px`,o.style.height=`${a.height+4}px`,t?.(i,a),n=requestAnimationFrame(s)};function p(){i=null,o.hidden=!0,n&&cancelAnimationFrame(n),n=0}return{show(a){if(a!==i){i=a;let r=getComputedStyle(a).borderTopLeftRadius;o.style.borderRadius=r&&r!=="0px"?`calc(${r} + 2px)`:"3px"}o.hidden=!1,n||s()},hide:p,get target(){return i}}}var B=["button","a[href]","input","select","textarea","summary","label","[role=button]","[role=link]","[role=menuitem]","[role=menuitemcheckbox]","[role=menuitemradio]","[role=option]","[role=tab]","[role=treeitem]","[role=checkbox]","[role=radio]","[role=switch]","[role=gridcell]","[role=row]","[role=combobox]","[role=slider]"].join(",");function I(e,t,o){for(let i of document.elementsFromPoint(e,t))if(!(i===o||o.contains(i)))return i===document.documentElement||i===document.body?null:i;return null}function P(e){let t=e.closest(B);return t&&t!==document.body?t:e instanceof SVGElement&&!(e instanceof SVGSVGElement)?e.ownerSVGElement??e:e}function H(e){let t=e.parentElement;return t&&t!==document.body&&t!==document.documentElement?t:null}function L(e,t,o){let i=null;for(let n of Array.from(e.children)){let s=n.getBoundingClientRect();if(!(!s.width&&!s.height)&&(i??=n,t>=s.left&&t<=s.right&&o>=s.top&&o<=s.bottom))return n}return i}function g(e,t){if(!e||e===t||t.contains(e)||e===document.documentElement||e===document.body)return!1;let o=e.getBoundingClientRect();return o.width>0||o.height>0}var N=["pointerdown","pointerup","pointermove","pointerover","pointerout","pointerenter","pointerleave","pointercancel","mousedown","mouseup","mousemove","mouseover","mouseout","mouseenter","mouseleave","click","dblclick","auxclick","contextmenu","dragstart","touchstart","touchend","touchmove","wheel","keydown","keyup","keypress","beforeinput","input","change","focusin","focusout","focus","blur","scroll","resize","visibilitychange"];function F(e,t){let o=n=>{if(e.owns(n)){t.ui(n),n.stopImmediatePropagation();return}if((n.type==="focusout"||n.type==="blur")&&n.relatedTarget===e.el){n.stopImmediatePropagation();return}let s=t.page(n);s&&(n.stopImmediatePropagation(),s==="swallow"&&n.cancelable&&n.preventDefault())},i={capture:!0,passive:!1};for(let n of N)window.addEventListener(n,o,i),n==="visibilitychange"&&document.addEventListener(n,o,i);return()=>{for(let n of N)window.removeEventListener(n,o,i),n==="visibilitychange"&&document.removeEventListener(n,o,i)}}function v(e){for(let t of e.composedPath())if(t instanceof HTMLElement&&t.dataset.action)return{action:t.dataset.action,el:t};return null}var c=e=>["path",{d:e}],x={inspect:[c("M17.5 17.5L22 22"),c("M20 11a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z"),c("M14.5 9.5l.9.8c.4.3.6.5.6.7s-.2.4-.6.7l-.9.8"),c("M7.5 9.5l-.9.8c-.4.3-.6.5-.6.7s.2.4.6.7l.9.8"),c("M12 8.5 10 13.5")],freeze:[c("M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"),c("M9.5 4.6 12 7l2.5-2.4M9.5 19.4 12 17l2.5 2.4")],list:[c("M9 7h10.5M9 12h10.5M9 17h10.5"),["path",{d:"M4.5 7h.01M4.5 12h.01M4.5 17h.01","stroke-width":"2.6"}]],close:[c("M6.5 6.5l11 11M17.5 6.5l-11 11")],copy:[["rect",{x:"8.5",y:"8.5",width:"11",height:"11",rx:"2"}],c("M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3")],enter:[c("M19 6v5a3 3 0 0 1-3 3H6"),c("M10 10l-4 4 4 4")],note:[c("M5 5h14v10h-9l-4 4v-4H5z")],check:[c("M5 12.5l4.5 4.5L19 7.5")],trash:[c("M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5")],chevron:[c("M9.5 6l6 6-6 6")]};var R=[{action:"freeze",icon:"freeze",label:"Freeze the page",key:"F"},{action:"list",icon:"list",label:"All notes"},{action:"close",icon:"close",label:"Close",key:"Esc"}];function _(e){let t=R.map((r,l)=>{let u=d("button",{type:"button",class:"btn","data-action":r.action,"aria-label":r.label,"data-tip":r.label,"data-key":r.key},m(x[r.icon],16));return u.style.setProperty("--i",String(R.length-1-l)),u});t.splice(t.length-1,0,d("span",{class:"sep"}));let o=d("div",{class:"row"},...t),i=d("button",{type:"button",class:"logo","data-action":"open","aria-label":"Open Inspeck","data-tip":"Inspeck","data-key":"\u2325I"},m(x.inspect,18,1.5)),n=d("div",{class:"bar",role:"toolbar","aria-label":"Inspeck"},i,o),s=d("div",{class:"tip",role:"tooltip"});e.append(n,s),requestAnimationFrame(()=>n.style.setProperty("--ix-open-w",`${o.scrollWidth+8}px`));let p=null,a=r=>{if(r===p)return;if(p=r,!r||!r.dataset.tip||r.classList.contains("btn")&&!n.hasAttribute("data-open")){s.removeAttribute("data-show");return}s.replaceChildren(r.dataset.tip,...r.dataset.key?[d("span",{class:"kbd"},r.dataset.key)]:[]);let l=r.getBoundingClientRect(),u=s.offsetWidth;s.style.left=`${Math.min(window.innerWidth-u-8,Math.max(8,l.left+l.width/2-u/2))}px`,s.style.top=`${l.top-34}px`,s.setAttribute("data-show","")};return{setOpen(r){n.toggleAttribute("data-open",r),i.tabIndex=r?-1:0,a(null)},setPressed(r,l){n.querySelector(`[data-action="${r}"]`)?.setAttribute("aria-pressed",String(l))},handle(r){if(r.type==="pointerover"){let l=v(r);a(l?.el??null)}else if(r.type==="pointerout"||r.type==="pointerleave"){let l=r.relatedTarget;(!(l instanceof Node)||!n.contains(l))&&a(null)}else if(r.type==="click"){let l=v(r);if(l&&n.contains(l.el))return a(null),l.action}return null}}}var $=new Set(["pointerdown","pointerup","mousedown","mouseup","click","dblclick","auxclick","contextmenu","touchstart","touchend","dragstart"]),h=class{host;toolbar;outline;open=!1;through=!1;target=null;pointer={x:-1,y:-1};raw=null;stepped=!1;pickFrame=0;unroute;constructor(){this.host=A(),this.toolbar=_(this.host.ui),this.outline=O(this.host.ui),this.unroute=F(this.host,{ui:t=>this.onUi(t),page:t=>this.onPage(t)}),b.get("open")==="1"&&this.setOpen(!0)}setOpen(t){t!==this.open&&(this.open=t,this.toolbar.setOpen(t),b.set("open",t?"1":null),t?this.pointer.x>=0&&this.schedulePick():this.setTarget(null))}act(t){switch(t){case"open":this.setOpen(!0);break;case"close":this.setOpen(!1);break}}schedulePick(){this.pickFrame||(this.pickFrame=requestAnimationFrame(()=>{if(this.pickFrame=0,!this.open)return;let t=I(this.pointer.x,this.pointer.y,this.host.el);this.stepped&&t===this.raw||(this.raw=t,this.stepped=!1,this.setTarget(t?P(t):null))}))}setTarget(t){g(t,this.host.el)||(t=null),this.target=t,t?this.outline.show(t):this.outline.hide()}step(t){if(!this.target)return;let o=t==="up"?H(this.target):L(this.target,this.pointer.x,this.pointer.y);o&&g(o,this.host.el)&&(this.stepped=!0,this.setTarget(o))}press(t){}onUi(t){let o=this.toolbar.handle(t);o&&this.act(o),t.type==="keydown"&&this.onKey(t,!0),t.type==="keyup"&&this.onKeyUp(t),t.type==="pointerover"&&this.open&&this.setTarget(null)}onPage(t){switch(t.type){case"keydown":return this.onKey(t,!1);case"keyup":return this.onKeyUp(t)}if(this.open){if(t.type==="pointermove"){let o=t;this.pointer={x:o.clientX,y:o.clientY},this.schedulePick();return}if(t.type==="mouseout"&&!t.relatedTarget){this.setTarget(null);return}if($.has(t.type))return this.through?void 0:(t.type==="pointerdown"&&t.button===0&&this.press(t),"swallow")}}onKey(t,o){if(t.altKey&&!t.metaKey&&!t.ctrlKey&&t.code==="KeyI")return this.setOpen(!this.open),t.preventDefault(),"swallow";if(this.open&&!(!o&&k(document.activeElement))&&!o)switch(t.key){case"Escape":return this.setOpen(!1),"swallow";case"ArrowUp":case"ArrowDown":return this.target?(this.step(t.key==="ArrowUp"?"up":"down"),"swallow"):void 0;case" ":return this.through||this.setThrough(!0),"swallow"}}onKeyUp(t){if(t.key===" "&&this.through)return this.setThrough(!1),"swallow"}setThrough(t){this.through=t,this.host.ui.querySelector(".outline")?.toggleAttribute("data-through",t)}destroy(){this.unroute(),this.host.destroy()}};function K(){if(window.__INSPECK__?.app)return;let e=new h;window.__INSPECK__={app:e,version:S,server:M,destroy(){e.destroy(),delete window.__INSPECK__}}}if(!T())console.info(`Inspeck: not starting on ${location.hostname}, which isn't this machine.`);else if(!(window.top!==window&&!document.currentScript?.hasAttribute("data-inspeck-frames"))){let e=()=>"requestIdleCallback"in window?requestIdleCallback(K,{timeout:1500}):setTimeout(K,200);document.readyState==="complete"?e():window.addEventListener("load",e,{once:!0})}})();
