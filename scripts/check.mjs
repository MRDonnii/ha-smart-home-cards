import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

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

const forbidden = [
  ["known address or household name", /hyacintvej|mådde|\bmadde\b|\bmette\b|\bmads\b|\bviggo\b|\bfie\b|leonora|gunner_ren|energitte|th_poul|jt_net_protect|dinsikring|verisure_alarm|th_faelles|th_charger/i],
  ["private IPv4 address", /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["credential-like value", /\b(?:api[_-]?key|access[_-]?token|bearer|password)\s*[:=]\s*["'][^"'\n]{8,}["']/i]
];

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(filename));
    else if (entry.isFile() && entry.name.endsWith(".js")) result.push(filename);
  }
  return result;
}

const auditedFiles = [
  ...await sourceFiles(path.join(root, "src", "cards")),
  path.join(root, "cards.json"),
  path.join(root, "README.md"),
  path.join(root, "docs", "CARDS.md"),
  path.join(root, "dist", "ha-smart-home-cards.js")
];
for (const filename of auditedFiles) {
  const contents = await readFile(filename, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(contents)) {
      throw new Error(`${label} found in ${path.relative(root, filename)}`);
    }
  }
}
console.log(`Validated ${cards.length} catalog entries, ${auditedFiles.length} privacy-scanned files, and the combined bundle`);
