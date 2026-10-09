// packages/inspeck/src/vite.ts
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
export {
  inspeck as default,
  inspeck
};
