import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const cards = JSON.parse(await readFile(path.join(root, "cards.json"), "utf8"));
const seen = new Set();
for (const card of cards) {
  if (!card.slug || !card.name || !card.filename || !card.category) throw new Error(`Incomplete card metadata: ${JSON.stringify(card)}`);
  if (seen.has(card.slug)) throw new Error(`Duplicate slug: ${card.slug}`);
  seen.add(card.slug);
  await stat(path.join(root, "src", "cards", card.slug, card.filename));
}
const bundle = await readFile(path.join(root, "dist", "ha-smart-home-cards.js"), "utf8");
if (!bundle.includes("MRDonnii Smart Home Cards")) throw new Error("Bundle banner missing");

// Household names, addresses and private entity prefixes are stored only as
// SHA-256 hashes of their lowercase form, so the guard does not publish them.
// To add a word: node -e 'console.log(require("crypto").createHash("sha256").update("word").digest("hex"))'
// WORD hashes must match a whole ASCII word (like a regex \b...\b match);
// SUBSTRING hashes match anywhere inside a run of letters, digits and underscores.
const privateWordHashes = new Set([
  "9931dfc71f3d78914fef7e07a90219754c43d6ffa48d7fa59e78d8c5fe812eb4",
  "9ab60eca6ebd10d283be1f9618361fa54e044ea3b6852ca7a4acac25c6ed1449",
  "22261f8500403019224c8b04d3450382a07917fae29268dbfe2cb88e59d9cc80",
  "0a128b8d99f63cac6b2a6d4693adaef1a8eb771767316e909213e4c127922fcb",
  "0777c5bfbd969706fafd4e17980dd47fdc57ed41ab00f46cc9703958865ab6a2",
  "96ecd3d8e9650d4684f88da2bd4966d609c7804d2d29fceabdd808adf642142f"
]);
const privateSubstringHashes = new Set([
  "915e2db2c341e03e88a047237f19ec7ac91a3b33002c9c5c08903f42a6684137",
  "5d70b7a03e1cda81147f6ee2e8ae96c5430c94c4e34d8c60100b1f13270ace89",
  "66698accf7c7013a0c3e9afbb997cd15897cb450a16733242e693e0b9ae775d4",
  "5614ac550a33ee654f94a30bd7e597790549ba15d65007fa9ec1f57045909e48",
  "09f3a1acc835b200d0e4a58b08753f045ad592f8f66d2eeaca97df19ddfb2690",
  "449936f638fe3b6e4b5b06d02bdff6e2981803bf747ea84ee911759369f9c780",
  "3c457654a74ca34deab287489b0b3c8b7ab82fb25fab2cde8f0705f3c585b8b4",
  "5b2f49095c1e0486f78c0ccacac1cc3a13ceac5485253b0c7a2015cc584ddb08",
  "29022a783971fcb7fc37835dc348026ed78508360427018e58b272118ce2c1c4",
  "7139cc692086b4888492d5a28a89691e5b05efa7c251ec16e82663e78e09edc8",
  "5348650928818751122950599faa98be2d93a0ef505ee231921cb61a7aa570b3",
  "1f0f0cc71b0d4ca2af13d06f45a59433109b313251750dfd679e0c5c91277049",
  "0197c66b88fac10a5a5375a273e993d71764961951a861463391583c917e0a37"
]);
const privateSubstringLengths = [5, 6, 7, 9, 10, 14];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashCache = new Map();
function cachedHash(value) {
  let digest = hashCache.get(value);
  if (digest === undefined) {
    digest = sha256(value);
    hashCache.set(value, digest);
  }
  return digest;
}
function containsPrivateWord(contents) {
  const lower = contents.toLowerCase();
  for (const token of new Set(lower.match(/[a-z0-9_]+/g) || [])) {
    if (privateWordHashes.has(cachedHash(token))) return true;
  }
  for (const run of new Set(lower.match(/[\p{L}\p{N}_]+/gu) || [])) {
    const chars = [...run];
    for (const length of privateSubstringLengths) {
      for (let start = 0; start + length <= chars.length; start += 1) {
        if (privateSubstringHashes.has(cachedHash(chars.slice(start, start + length).join("")))) return true;
      }
    }
  }
  return false;
}

const forbidden = [
  ["known address or household name", { test: containsPrivateWord }],
  ["private IPv4 address", /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["credential-like value", /\b(?:api[_-]?key|access[_-]?token|bearer|password)\s*[:=]\s*["'][^"'\n]{8,}["']/i]
];

// Every file below `directory` (recursively) whose name ends with one of `extensions`; all files when none are given.
async function sourceFiles(directory, extensions = []) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(filename, extensions));
    else if (entry.isFile() && (!extensions.length || extensions.some((ext) => entry.name.endsWith(ext)))) result.push(filename);
  }
  return result;
}

// Sources and card READMEs (src/cards, src/shared, src/index.js), the tests and their helpers, the catalog, the docs
// and the built bundle.
const auditedFiles = [...new Set([
  ...await sourceFiles(path.join(root, "src"), [".js", ".mjs", ".ts", ".tsx", ".css", ".json", ".md"]),
  ...await sourceFiles(path.join(root, "tests"), [".mjs", ".js", ".html", ".md"]),
  ...await sourceFiles(path.join(root, "tests", "helpers")),
  path.join(root, "cards.json"),
  path.join(root, "README.md"),
  path.join(root, "docs", "CARDS.md"),
  path.join(root, "dist", "ha-smart-home-cards.js")
])];
for (const filename of auditedFiles) {
  const contents = await readFile(filename, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(contents)) {
      throw new Error(`${label} found in ${path.relative(root, filename)}`);
    }
  }
}
console.log(`Validated ${cards.length} catalog entries, ${auditedFiles.length} privacy-scanned files, and the combined bundle`);
