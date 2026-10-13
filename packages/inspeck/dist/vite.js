// packages/inspeck/src/vite.ts
var PREFIX = "/__inspeck";
var SRC = `${PREFIX}/inspeck.js`;
var envPort = () => {
  const raw = typeof process !== "undefined" ? process.env?.INSPECK_PORT : void 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : void 0;
};
function withTag(html) {
  if (html.includes("inspeck.js")) return html;
  const tag = `<script src="${SRC}" async></script>`;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}
var isHtml = (res) => /text\/html/i.test(String(res.getHeader("content-type") ?? ""));
var injectHtml = (req, res, next) => {
  if (req.method !== "GET" || !/text\/html|\*\/\*/.test(req.headers.accept ?? "")) return next();
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  const writeHead = res.writeHead.bind(res);
  const chunks = [];
  let html = null;
  const holding = () => html ??= isHtml(res);
  const toBuffer = (chunk, enc) => Buffer.isBuffer(chunk) ? chunk : ArrayBuffer.isView(chunk) ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength) : chunk instanceof ArrayBuffer ? Buffer.from(chunk) : Buffer.from(String(chunk), typeof enc === "string" ? enc : "utf8");
  res.writeHead = ((status, ...rest) => {
    const headers = rest.find((r) => r && typeof r === "object");
    if (headers && !Array.isArray(headers)) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === "content-type" && /text\/html/i.test(String(headers[k]))) html = true;
      if (html) {
        for (const k of Object.keys(headers)) if (k.toLowerCase() === "content-length") delete headers[k];
      }
    }
    if (holding()) res.removeHeader("content-length");
    return writeHead(status, ...rest);
  });
  res.write = ((chunk, ...rest) => {
    if (!holding()) return write(chunk, ...rest);
    if (chunk != null) chunks.push(toBuffer(chunk, rest[0]));
    const cb = rest.find((r) => typeof r === "function");
    cb?.();
    return true;
  });
  res.end = ((chunk, ...rest) => {
    if (!holding()) return end(chunk, ...rest);
    if (chunk != null && typeof chunk !== "function") chunks.push(toBuffer(chunk, rest[0]));
    const body = withTag(Buffer.concat(chunks).toString("utf8"));
    if (!res.headersSent) res.setHeader("content-length", Buffer.byteLength(body));
    const cb = [chunk, ...rest].find((r) => typeof r === "function");
    return end(body, cb);
  });
  next();
};
function inspeck(options = {}) {
  const port = options.port ?? envPort() ?? 4848;
  const enabled = options.enabled ?? true;
  return {
    name: "inspeck",
    apply: "serve",
    /* /__inspeck/… on the dev server is Inspeck on 127.0.0.1. The Host it sees is its own, so it answers;
       the page's Origin goes along, and the plugin checks that's this machine. */
    config: () => ({
      server: {
        proxy: enabled ? {
          [PREFIX]: { target: `http://127.0.0.1:${port}`, changeOrigin: true, rewrite: (p) => p.slice(PREFIX.length) || "/" }
        } : {}
      }
    }),
    /* Before Vite's own middleware, so every page passes through it, server-rendered ones included. */
    configureServer: (server) => {
      if (enabled) server.middlewares.use(injectHtml);
    },
    /* An index.html app gets the tag here too (the middleware then sees it and leaves the page alone). */
    transformIndexHtml: () => enabled ? [{ tag: "script", attrs: { src: SRC, async: true }, injectTo: "body" }] : []
  };
}
export {
  PREFIX,
  inspeck as default,
  inspeck,
  withTag
};
