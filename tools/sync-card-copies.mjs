#!/usr/bin/env node
// Sync stand-alone copies of Smart Home Cards cards after a release.
//
// Some cards are also served outside the HACS bundle (a /local file that other apps import, a copy inside
// another web app, ...). This script builds each such card from the released source, writes it to every copy,
// bumps the ?v= cache id where the copy is referenced (HTML <script> tags, Home Assistant Lovelace resources)
// and verifies with SHA-256 that every copy matches the build.
//
// The list of copies is PRIVATE (paths, host names, token files) and is NOT part of this repository:
//   default: ~/.config/shc-card-copies/targets.json   (override with --config <file> or SHC_COPIES_CONFIG)
//
// Usage (run from a checkout of this repo, with node_modules installed):
//   node tools/sync-card-copies.mjs            # sync every copy to the release in package.json, then verify
//   node tools/sync-card-copies.mjs --check    # verify only, change nothing (exit 1 if a copy differs)
//   node tools/sync-card-copies.mjs --card th-electricity-price-card
//   --allow-unreleased  build from the working tree even if it differs from the v<version> tag
//
// Config format (JSON):
// {
//   "homes": {                       // Home Assistant instances, referenced by name from "ha_resource"
//     "home": { "url": "http://ha.local:8123" },        // no credentials: served file is verified, ?v= is bumped by hand
//     "other": { "url": "http://other:8123", "credentials": { "env": "~/.config/y/env", "token": "HA_TOKEN" } }
//   },
//   "copies": [
//     { "card": "th-electricity-price-card",
//       "file": "/mnt/config/www/th-electricity-price-card/th-electricity-price-card.js",
//       "backup_dir": "/mnt/config/_archive/backups/card-copies",          // optional
//       "ha_resource": { "home": "home", "match": "/local/th-electricity-price-card/" } },  // optional
//     { "card": "ha-hch5-live-card",
//       "file": "/srv/app/js/ha-hch5-live-card.js",
//       "html": ["/srv/app/index.html", "/srv/app/beast.html"] }           // optional: bump ?v= of the <script>
//   ]
// }
//
// Build rule: src/cards/<card>/<card>.js is copied byte for byte when it has no import statements (it can then
// also be loaded as a classic script); otherwise it is bundled stand-alone with esbuild (ESM), like the copies
// that were made by hand before.
// Cache id: the package version (e.g. 0.5.248). It is only changed for copies whose content changed.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const short = (h) => h.slice(0, 12);

const CHECK = flag("--check");
const configPath = expand(option("--config") || process.env.SHC_COPIES_CONFIG || "~/.config/shc-card-copies/targets.json");
if (!existsSync(configPath)) { console.error(`No config at ${configPath} (see the header of this script).`); process.exit(2); }
const config = JSON.parse(await readFile(configPath, "utf8"));
const onlyCard = option("--card");
const copies = (config.copies || []).filter((c) => !onlyCard || c.card === onlyCard);
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
const tag = `v${version}`;
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const warn = (msg) => console.log(`  WARN ${msg}`);

// ---------- build ----------
const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function assertReleased(card) {
  if (flag("--allow-unreleased")) return;
  try { git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`); }
  catch { throw new Error(`tag ${tag} not found locally (git fetch --tags), or pass --allow-unreleased`); }
  try { git("diff", "--quiet", tag, "--", `src/cards/${card}`, "src/shared"); }
  catch { throw new Error(`src/cards/${card} or src/shared differs from ${tag}; release first or pass --allow-unreleased`); }
}
const builds = new Map();
async function build(card) {
  if (builds.has(card)) return builds.get(card);
  const entry = path.join(root, "src", "cards", card, `${card}.js`);
  if (!existsSync(entry)) throw new Error(`no source ${path.relative(root, entry)}`);
  assertReleased(card);
  const source = await readFile(entry);
  let out = source;
  if (/^\s*import\s/m.test(source.toString("utf8"))) {
    const { build: esbuild } = await import("esbuild");
    const result = await esbuild({ entryPoints: [entry], bundle: true, format: "esm", write: false, logLevel: "warning" });
    out = Buffer.from(result.outputFiles[0].contents);
  }
  const b = { buf: out, hash: sha(out) };
  builds.set(card, b);
  return b;
}

// ---------- Home Assistant (websocket) ----------
function credentials(home) {
  const c = config.homes?.[home]?.credentials;
  if (!c) throw new Error(`no credentials for home "${home}"`);
  let values;
  if (c.file) values = JSON.parse(readFileSync(expand(c.file), "utf8"));
  else values = Object.fromEntries(readFileSync(expand(c.env), "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  return { url: String(config.homes[home].url || values[c.url]).replace(/\/$/, ""), token: values[c.token] };
}
const sockets = new Map();
async function ha(home) {
  if (sockets.has(home)) return sockets.get(home);
  const { url, token } = credentials(home);
  const ws = new WebSocket(`${url.replace(/^http/, "ws")}/api/websocket`, { headers: { "User-Agent": "Mozilla/5.0 shc-sync" } });
  let id = 0; const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error(`${home}: websocket error`));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (d.type === "auth_ok") resolve();
      else if (d.type === "auth_invalid") reject(new Error(`${home}: token rejected`));
      else if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.success ? p.resolve(d.result) : p.reject(new Error(d.error?.message || "ws error")); }
    };
  });
  await ready;
  const client = {
    call: (msg) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, ...msg })); }),
    close: () => ws.close(),
  };
  sockets.set(home, client);
  return client;
}

// ---------- copies ----------
const setV = (url, v) => (/[?&]v=[^&]*/.test(url) ? url.replace(/([?&]v=)[^&]*/, `$1${v}`) : `${url}${url.includes("?") ? "&" : "?"}v=${v}`);

async function syncCopy(copy) {
  const { buf, hash } = await build(copy.card);
  console.log(`${copy.card} (${tag}, sha256 ${short(hash)}) -> ${copy.file}`);
  const file = expand(copy.file);
  const before = existsSync(file) ? await readFile(file) : null;
  const changed = !before || sha(before) !== hash;
  if (changed && !CHECK) {
    if (before && copy.backup_dir) {
      const dir = expand(copy.backup_dir); await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      await copyFile(file, path.join(dir, `${path.basename(file)}.${stamp}`));
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
  }
  const after = existsSync(file) ? await readFile(file) : null;
  if (!after || sha(after) !== hash) fail(`file ${after ? `sha256 ${short(sha(after))}` : "missing"}`);
  else console.log(`  ok   file ${changed && !CHECK ? "updated" : "already equal"}`);

  // <script src=".../<file>?v=..."> in HTML pages
  for (const htmlPath of copy.html || []) {
    const p = expand(htmlPath); const html = await readFile(p, "utf8");
    const name = path.basename(file).replaceAll(".", "\\.");
    const re = new RegExp(`(src=["'][^"']*${name})(\\?v=[^"']*)?(["'])`, "g");
    const found = re.test(html); re.lastIndex = 0;
    if (!found) { fail(`${htmlPath}: no <script> for ${path.basename(file)}`); continue; }
    if (changed && !CHECK) {
      const next = html.replace(re, `$1?v=${version}$3`);
      if (next !== html) await writeFile(p, next);
      console.log(`  ok   ${path.basename(p)} ?v=${version}`);
    } else {
      const v = [...html.matchAll(re)].map((m) => (m[2] || "").slice(3)).join(",");
      console.log(`  ok   ${path.basename(p)} ?v=${v}`);
    }
  }

  // Lovelace resource: bump ?v= (needs a token) and fetch the served file back from Home Assistant (no token needed)
  if (copy.ha_resource) {
    const home = copy.ha_resource.home;
    const base = String(config.homes?.[home]?.url || "").replace(/\/$/, "");
    let url = copy.ha_resource.match;
    if (config.homes?.[home]?.credentials) {
      try {
        const client = await ha(home);
        const res = (await client.call({ type: "lovelace/resources" })).find((r) => r.url.includes(copy.ha_resource.match));
        if (!res) { fail(`${home}: no resource matching ${copy.ha_resource.match}`); return; }
        url = res.url;
        if (changed && !CHECK && setV(url, version) !== url) {
          url = setV(url, version);
          await client.call({ type: "lovelace/resources/update", resource_id: res.id, url, res_type: res.type });
        }
        console.log(`  ok   resource ${url}`);
      } catch (error) { warn(`${home}: ${error.message} - resource not checked`); }
    }
    if (changed && !CHECK && url === copy.ha_resource.match) warn(`set the Lovelace resource ${copy.ha_resource.match} to ?v=${version} by hand`);
    if (!base) { fail(`${home}: no url in config`); return; }
    const served = Buffer.from(await (await fetch(`${base}${setV(url.split("?")[0], `${version}-verify-${Date.now()}`)}`, { headers: { "Cache-Control": "no-cache" } })).arrayBuffer());
    if (sha(served) !== hash) fail(`${home} serves sha256 ${short(sha(served))}`);
    else console.log(`  ok   served by ${home} (sha256 ${short(hash)})`);
  }
}

for (const copy of copies) {
  try { await syncCopy(copy); } catch (error) { fail(`${copy.card}: ${error.message}`); }
}
for (const s of sockets.values()) s.close();
console.log(failures ? `${failures} problem(s)` : `All ${copies.length} copies match ${tag}.`);
process.exit(failures ? 1 : 0);
