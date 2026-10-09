"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/inspeck/src/vite.ts
var vite_exports = {};
__export(vite_exports, {
  default: () => inspeck,
  inspeck: () => inspeck
});
module.exports = __toCommonJS(vite_exports);
var envPort = () => {
  const raw = typeof process !== "undefined" ? process.env?.INSPECK_PORT : void 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : void 0;
};
function inspeck(options = {}) {
  const port = options.port ?? envPort() ?? 4848;
  const enabled = options.enabled ?? true;
  return {
    name: "inspeck",
    apply: "serve",
    transformIndexHtml: () => enabled ? [{ tag: "script", attrs: { src: `http://127.0.0.1:${port}/inspeck.js`, async: true }, injectTo: "body" }] : []
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  inspeck
});
