#!/usr/bin/env node

// packages/inspeck/src/cli.ts
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, relative } from "path";
import { createInterface } from "readline/promises";
var MARKETPLACE = "pulkitmittal19/inspeck-claude";
var PLUGIN = "inspeck@inspeck";
var TAG_SRC = "http://127.0.0.1:4848/inspeck.js";
var say = (s = "") => process.stdout.write(s + "\n");
var done = (s) => say(`  \u2713 ${s}`);
var note = (s) => say(`  \xB7 ${s}`);
var warn = (s) => say(`  ! ${s}`);
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  return { ok: !r.error && r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, missing: r.error?.code === "ENOENT" };
}
function installPlugin() {
  say("Claude Code plugin");
  const version = run("claude", ["--version"]);
  if (version.missing) {
    warn("Claude Code isn't installed (no `claude` command). Install it from https://claude.com/claude-code, then run:");
    say(`      claude plugin marketplace add ${MARKETPLACE}`);
    say(`      claude plugin install ${PLUGIN}`);
    return false;
  }
  if (/\binspeck@/.test(run("claude", ["plugin", "list"]).out)) {
    done("already installed");
    return true;
  }
  if (!/\binspeck\b/.test(run("claude", ["plugin", "marketplace", "list"]).out)) {
    const added = run("claude", ["plugin", "marketplace", "add", MARKETPLACE]);
    if (!added.ok) {
      warn(`couldn't add the marketplace:
${added.out.trim()}`);
      return false;
    }
    done(`added the marketplace ${MARKETPLACE}`);
  }
  const installed = run("claude", ["plugin", "install", PLUGIN]);
  if (!installed.ok) {
    warn(`couldn't install the plugin:
${installed.out.trim()}`);
    return false;
  }
  done("installed; new Claude sessions start with it");
  return true;
}
var MARKETPLACE_NAME = "inspeck";
var settingsFile = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
function withAutoUpdate(src) {
  let settings;
  try {
    settings = src?.trim() ? JSON.parse(src) : {};
  } catch {
    return { src: src ?? "", result: "manual" };
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { src: src ?? "", result: "manual" };
  const known = settings.extraKnownMarketplaces ?? {};
  if (typeof known !== "object" || Array.isArray(known)) return { src: src ?? "", result: "manual" };
  const entry = known[MARKETPLACE_NAME];
  const ours = !entry?.source || entry.source.source === "github" && entry.source.repo === MARKETPLACE;
  if (!ours) return { src: src ?? "", result: "other" };
  if (entry?.autoUpdate === true) return { src: src ?? "", result: "present" };
  known[MARKETPLACE_NAME] = { ...entry, source: { source: "github", repo: MARKETPLACE }, autoUpdate: true };
  settings.extraKnownMarketplaces = known;
  return { src: JSON.stringify(settings, null, 2) + "\n", result: "added" };
}
function turnOnAutoUpdate() {
  const file = settingsFile();
  const { src, result } = withAutoUpdate(existsSync(file) ? readFileSync(file, "utf8") : null);
  if (result === "added") {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, src);
    done(`auto-update on: new versions arrive by themselves (${file.replace(homedir(), "~")})`);
  } else if (result === "present") {
    done("auto-update on");
  } else if (result === "other") {
    note("auto-update left as it is: your inspeck marketplace isn't the GitHub one");
  } else {
    warn(`couldn't read ${file}; to get new versions by themselves, turn on auto-update in Claude: /plugin \u203A Marketplaces \u203A inspeck`);
  }
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
var firstExisting = (cwd, names) => names.map((n) => join(cwd, n)).find((p) => existsSync(p)) ?? null;
function detect(cwd) {
  const pkg = readJson(join(cwd, "package.json"));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const astro = firstExisting(cwd, ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts"]);
  if (astro || deps.astro) return astro ? { kind: "astro", config: astro } : { kind: "other" };
  const nuxt = firstExisting(cwd, ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"]);
  if (nuxt || deps.nuxt) return nuxt ? { kind: "nuxt", config: nuxt } : { kind: "other" };
  const vite = firstExisting(cwd, ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]);
  if (vite) return { kind: "vite", config: vite };
  if (deps.next) {
    return { kind: "next", layout: firstExisting(cwd, [
      "app/layout.tsx",
      "app/layout.jsx",
      "app/layout.js",
      "src/app/layout.tsx",
      "src/app/layout.jsx",
      "src/app/layout.js",
      "pages/_document.tsx",
      "pages/_document.jsx",
      "pages/_document.js",
      "src/pages/_document.tsx",
      "src/pages/_document.jsx",
      "src/pages/_document.js"
    ]) };
  }
  const html = firstExisting(cwd, ["index.html"]);
  if (html && !pkg) return { kind: "html", file: html };
  if (html && !deps.react && !deps.vue && !deps.svelte && !deps["@angular/core"]) return { kind: "html", file: html };
  return { kind: "other" };
}
function packageManager(cwd) {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return ["pnpm", ["add", "-D", "inspeck"]];
  if (existsSync(join(cwd, "yarn.lock"))) return ["yarn", ["add", "-D", "inspeck"]];
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return ["bun", ["add", "-d", "inspeck"]];
  return ["npm", ["install", "-D", "inspeck"]];
}
function afterImports(src, line) {
  const imports = [...src.matchAll(/^import[^\n]*?(?:from\s*)?['"][^'"]+['"];?[ \t]*$/gm)];
  if (!imports.length) return `${line}
${src}`;
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  return `${src.slice(0, at)}
${line}${src.slice(at)}`;
}
function wireVite(src, file) {
  if (/['"]inspeck\/vite['"]/.test(src) || src.includes("inspeck.js")) return { src, result: "present" };
  const plugins = /\bplugins\s*:\s*\[/.exec(src);
  if (!plugins) return { src, result: "manual" };
  const open = plugins.index + plugins[0].length;
  const empty = /^\s*\]/.test(src.slice(open));
  let out = `${src.slice(0, open)}${empty ? "inspeck()" : "inspeck(), "}${src.slice(open)}`;
  out = file.endsWith(".cjs") ? `const inspeck = require('inspeck/vite').default
${out}` : afterImports(out, `import inspeck from 'inspeck/vite'`);
  return { src: out, result: "added" };
}
function wireAstro(src) {
  if (/['"]inspeck\/vite['"]/.test(src) || src.includes("inspeck.js")) return { src, result: "present" };
  let out = null;
  const vite = /\bvite\s*:\s*\{/.exec(src);
  if (vite) {
    const plugins = /\bplugins\s*:\s*\[/.exec(src.slice(vite.index));
    if (plugins) {
      const open = vite.index + plugins.index + plugins[0].length;
      out = `${src.slice(0, open)}${/^\s*\]/.test(src.slice(open)) ? "inspeck()" : "inspeck(), "}${src.slice(open)}`;
    } else {
      const open = vite.index + vite[0].length;
      out = `${src.slice(0, open)} plugins: [inspeck()],${src.slice(open)}`;
    }
  } else {
    const config = /\b(defineConfig\(\s*\{|export\s+default\s+\{)/.exec(src);
    if (config) {
      const open = config.index + config[0].length;
      const empty = /^\s*\}/.test(src.slice(open));
      out = `${src.slice(0, open)}
  vite: { plugins: [inspeck()] },${empty ? "\n" : ""}${src.slice(open).replace(/^\s*(?=\})/, empty ? "" : "$&")}`;
    }
  }
  if (!out) return { src, result: "manual" };
  return { src: afterImports(out, `import inspeck from 'inspeck/vite'`), result: "added" };
}
var NUXT_HEAD = `$development: { app: { head: { script: [{ src: '${TAG_SRC}', async: true }] } } },`;
function wireNuxt(src) {
  if (src.includes("inspeck.js")) return { src, result: "present" };
  if (/\$development\s*:/.test(src)) return { src, result: "manual" };
  const config = /\b(defineNuxtConfig\(\s*\{|export\s+default\s+\{)/.exec(src);
  if (!config) return { src, result: "manual" };
  const open = config.index + config[0].length;
  return { src: `${src.slice(0, open)}
  ${NUXT_HEAD}${src.slice(open)}`, result: "added" };
}
var NEXT_TAG = `{process.env.NODE_ENV === 'development' && <script src="${TAG_SRC}" async />}`;
function wireNext(src) {
  if (src.includes("inspeck.js")) return { src, result: "present" };
  const own = /^([ \t]*)<\/body>/m.exec(src);
  if (own) return { src: `${src.slice(0, own.index)}${own[1]}  ${NEXT_TAG}
${src.slice(own.index)}`, result: "added" };
  const inline = src.indexOf("</body>");
  if (inline >= 0) return { src: `${src.slice(0, inline)}${NEXT_TAG}${src.slice(inline)}`, result: "added" };
  return { src, result: "manual" };
}
var HTML_TAG = `<script>/* Inspeck: loads on this computer only, never on the live site */ if (/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$|\\.localhost$/.test(location.hostname)) document.head.appendChild(Object.assign(document.createElement('script'), { src: '${TAG_SRC}', async: true }))</script>`;
function wireHtml(src) {
  if (src.includes("inspeck.js")) return { src, result: "present" };
  const body = /^([ \t]*)<\/body>/im.exec(src);
  if (!body) return { src, result: "manual" };
  const line = `${body[1]}  ${HTML_TAG}
`;
  return { src: src.slice(0, body.index) + line + src.slice(body.index), result: "added" };
}
async function confirm(question, flags) {
  if (flags.yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`  ? ${question} (y/N) `)).trim());
  } finally {
    rl.close();
  }
}
function printNextTag() {
  say(`      ${NEXT_TAG}`);
}
function printTag() {
  say(`      ${HTML_TAG}`);
  say("    Add it in development only; on any address that isn't this machine the widget stays silent anyway.");
}
function wireStorybookHead(src) {
  if (src?.includes("inspeck.js")) return { src, result: "present" };
  return { src: `${src ? `${src.replace(/\s*$/, "")}
` : ""}${HTML_TAG}
`, result: "added" };
}
function wireStorybook(cwd) {
  if (!existsSync(join(cwd, ".storybook"))) return;
  const file = join(cwd, ".storybook", "preview-head.html");
  const { src, result } = wireStorybookHead(existsSync(file) ? readFileSync(file, "utf8") : null);
  if (result === "present") {
    done("Storybook already loads Inspeck");
    return;
  }
  writeFileSync(file, src);
  done("added Inspeck to Storybook (.storybook/preview-head.html): it runs in each story, on this computer only");
}
var CSP_FILES = [
  "index.html",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "middleware.ts",
  "middleware.js",
  "src/middleware.ts",
  "src/middleware.js",
  "app/layout.tsx",
  "app/layout.jsx",
  "src/app/layout.tsx",
  "src/app/layout.jsx",
  "pages/_document.tsx",
  "pages/_document.jsx",
  "nuxt.config.ts",
  "nuxt.config.js",
  "server.js",
  "server.ts"
];
function cspFileIn(cwd) {
  for (const f of CSP_FILES) {
    const p = join(cwd, f);
    try {
      if (existsSync(p) && /content-security-policy/i.test(readFileSync(p, "utf8"))) return p;
    } catch {
    }
  }
  return null;
}
function cspHint(cwd) {
  const kind = detect(cwd).kind;
  if (kind === "vite" || kind === "astro") return;
  const file = cspFileIn(cwd);
  if (!file) return;
  const origin = new URL(TAG_SRC).origin;
  warn(`${relative(cwd, file) || file} sets a Content-Security-Policy, which would block Inspeck. In development only, add ${origin} to its script-src and connect-src.`);
}
async function wireApp(flags) {
  const { cwd } = flags;
  const app = detect(cwd);
  const rel = (p) => relative(cwd, p) || p;
  say("Your app");
  if (app.kind === "astro") {
    if (!flags.skipInstall) {
      const [pm, args] = packageManager(cwd);
      const r = run(pm, args, cwd);
      if (!r.ok) {
        warn(`\`${pm} ${args.join(" ")}\` failed:
${r.out.trim()}`);
        return;
      }
      done(`installed inspeck with ${pm}`);
    }
    const { src, result } = wireAstro(readFileSync(app.config, "utf8"));
    if (result === "present") done(`${rel(app.config)} already loads Inspeck`);
    else if (result === "added") {
      writeFileSync(app.config, src);
      done(`added inspeck() to Vite in ${rel(app.config)} (only in astro dev, never in a build)`);
    } else {
      warn(`couldn't find where to add it in ${rel(app.config)}. Add this yourself:`);
      say(`      import inspeck from 'inspeck/vite'`);
      say("      vite: { plugins: [inspeck()] }");
    }
    return;
  }
  if (app.kind === "nuxt") {
    const { src, result } = wireNuxt(readFileSync(app.config, "utf8"));
    if (result === "present") done(`${rel(app.config)} already loads Inspeck`);
    else if (result === "added") {
      writeFileSync(app.config, src);
      done(`added a development-only script to ${rel(app.config)}`);
    } else {
      warn(`couldn't find where to add it in ${rel(app.config)}. Add this to defineNuxtConfig yourself:`);
      say(`      ${NUXT_HEAD}`);
    }
    return;
  }
  if (app.kind === "vite") {
    if (!flags.skipInstall) {
      const [pm, args] = packageManager(cwd);
      const r = run(pm, args, cwd);
      if (!r.ok) {
        warn(`\`${pm} ${args.join(" ")}\` failed:
${r.out.trim()}`);
        return;
      }
      done(`installed inspeck with ${pm}`);
    }
    const { src, result } = wireVite(readFileSync(app.config, "utf8"), app.config);
    if (result === "present") done(`${rel(app.config)} already loads Inspeck`);
    else if (result === "added") {
      writeFileSync(app.config, src);
      done(`added inspeck() to ${rel(app.config)} (only while vite serves, never in a build)`);
    } else {
      warn(`couldn't find the plugins list in ${rel(app.config)}. Add this yourself:`);
      say(`      import inspeck from 'inspeck/vite'`);
      say("      plugins: [inspeck()]");
    }
    return;
  }
  if (app.kind === "next") {
    if (!app.layout) {
      warn("Next.js app, but no app/layout or pages/_document found. Add this inside <body> of your root layout:");
      printNextTag();
      return;
    }
    const { src, result } = wireNext(readFileSync(app.layout, "utf8"));
    if (result === "present") done(`${rel(app.layout)} already loads Inspeck`);
    else if (result === "added") {
      writeFileSync(app.layout, src);
      done(`added a development-only tag to ${rel(app.layout)}`);
    } else {
      warn(`couldn't find </body> in ${rel(app.layout)}. Add this inside <body>:`);
      printNextTag();
    }
    return;
  }
  if (app.kind === "html") {
    const current = readFileSync(app.file, "utf8");
    if (current.includes("inspeck.js")) {
      done(`${rel(app.file)} already loads Inspeck`);
      return;
    }
    note(`${rel(app.file)} is a plain page: the tag loads Inspeck only when the page is opened on this computer, never on a deployed site.`);
    if (!await confirm(`Add the tag to ${rel(app.file)}?`, flags)) {
      note("left it alone. To add it yourself:");
      printTag();
      return;
    }
    const { src, result } = wireHtml(current);
    if (result === "added") {
      writeFileSync(app.file, src);
      done(`added the tag to ${rel(app.file)}`);
    } else {
      warn(`couldn't find </body> in ${rel(app.file)}. Add this before it:`);
      printTag();
    }
    return;
  }
  note("No Vite, Next.js, Astro, Nuxt or plain index.html here. Add this to your page's HTML (it loads only on this computer):");
  printTag();
}
async function main(argv) {
  const [command, ...rest] = argv;
  const flags = {
    yes: rest.includes("--yes") || rest.includes("-y"),
    skipPlugin: rest.includes("--skip-plugin"),
    skipInstall: rest.includes("--skip-install"),
    autoUpdate: !rest.includes("--no-auto-update"),
    cwd: process.cwd()
  };
  if (command !== "init") {
    say("Usage: npx inspeck init [--yes] [--skip-plugin] [--skip-install] [--no-auto-update]");
    say("");
    say("  Installs the Inspeck plugin for Claude Code and adds the widget to the app in this folder.");
    say("  --yes             add the tag to a plain HTML page without asking");
    say("  --skip-plugin     leave Claude Code alone");
    say("  --skip-install    don't install the npm package (Vite)");
    say("  --no-auto-update  don't turn on auto-update for the plugin");
    return command === void 0 || command === "--help" || command === "-h" ? 0 : 1;
  }
  say("Inspeck");
  say("");
  const plugin = flags.skipPlugin ? true : installPlugin();
  if (!flags.skipPlugin && plugin && flags.autoUpdate) turnOnAutoUpdate();
  say("");
  await wireApp(flags);
  wireStorybook(flags.cwd);
  cspHint(flags.cwd);
  say("");
  say("Next, in Claude: /inspeck:start");
  say("It opens your app, turns Inspeck on and links it to the chat. Or open the app in your own browser and press I.");
  if (!plugin) say("(Install the Claude Code plugin first: the widget is served by it.)");
  return 0;
}

// packages/inspeck/src/bin.ts
main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
