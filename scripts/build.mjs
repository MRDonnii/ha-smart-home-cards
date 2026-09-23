import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const unitAsset = path.join(root, "src/cards/ha-calefa-flow-card/assets/calefa-unit.webp");
const unitDataUrl = `data:image/webp;base64,${(await readFile(unitAsset)).toString("base64")}`;
await build({
  entryPoints: [path.join(root, "src/cards/ha-hch5-live-card/source/card.tsx")],
  outfile: path.join(root, "src/cards/ha-hch5-live-card/ha-hch5-live-card.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  loader: { ".css": "text" },
  jsx: "automatic",
  minify: true,
});
const cards = JSON.parse(await readFile(path.join(root, "cards.json"), "utf8"));
const entry = cards.map((card) => `import ${JSON.stringify(`./cards/${card.slug}/${card.filename}`)};`).join("\n");
await writeFile(path.join(root, "src", "index.js"), `${entry}\n`);

const outfile = path.join(root, "dist", "ha-smart-home-cards.js");
await build({
  entryPoints: [path.join(root, "src", "index.js")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  legalComments: "eof",
  plugins: [{ name: "calefa-unit-asset", setup(build) {
    build.onLoad({ filter: /ha-calefa-flow-card\/ha-calefa-flow-card\.js$/ }, async ({ path: filename }) => ({
      contents: (await readFile(filename, "utf8")).replace('const CALEFA_DEFAULT_UNIT_IMAGE = "";', `const CALEFA_DEFAULT_UNIT_IMAGE = ${JSON.stringify(unitDataUrl)};`),
      loader: "js",
    }));
  } }],
  banner: { js: `/* MRDonnii Smart Home Cards v${JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version} */` }
});

const bundle = await readFile(outfile, "utf8");
await writeFile(outfile, bundle.replace(/[ \t]+$/gm, ""));

console.log(`Built ${cards.length} cards into dist/ha-smart-home-cards.js`);
